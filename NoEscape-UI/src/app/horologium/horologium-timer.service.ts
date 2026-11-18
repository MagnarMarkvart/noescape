import {
  computed,
  inject,
  Injectable,
  NgZone,
  signal,
} from '@angular/core';
import { ClockApiService } from '../clocks/clock-api.service';
import { ClockBoundDaily, ClockEvent, ClockKind, ClockSnapshot } from '../clocks/clock.model';
import { clockNow } from '../clocks/clock-now';
import { SoundSettingsService } from '../shared/sound-settings.service';
import {
  DEFAULT_HOROLOGIUM_CONFIG,
  HorologiumBoundDaily,
  HorologiumConfig,
  HorologiumMode,
  HorologiumSessionRecord,
  REST_END_JINGLE,
  TimerPhase,
  WORK_END_JINGLE,
} from './horologium.model';

const JINGLES_MUTE_KEY = 'noescape.horologium.jinglesMuted';
const AMBIENCE_MUTE_KEY = 'noescape.horologium.ambienceMuted';

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function slimBound(daily: HorologiumBoundDaily): ClockBoundDaily {
  return {
    source: daily.source,
    runId: daily.runId,
    dailyTaskId: daily.dailyTaskId,
    subtaskId: daily.subtaskId,
    questId: daily.questId,
    name: daily.name,
    journeyLabel: daily.journeyLabel,
  };
}

function sameBind(
  current: HorologiumBoundDaily | null,
  incoming: ClockBoundDaily,
): boolean {
  return (
    !!current &&
    current.source === incoming.source &&
    current.runId === incoming.runId &&
    current.dailyTaskId === incoming.dailyTaskId &&
    current.subtaskId === incoming.subtaskId
  );
}

@Injectable({ providedIn: 'root' })
export class HorologiumTimerService {
  private readonly clockApi = inject(ClockApiService);
  private readonly ngZone = inject(NgZone);
  private readonly sound = inject(SoundSettingsService);
  private workEndAudio: HTMLAudioElement | null = null;
  private restEndAudio: HTMLAudioElement | null = null;
  private tickHandle: number | null = null;
  private endAtMs: number | null = null;
  private pausedRemainingMs = 0;

  readonly config = signal<HorologiumConfig>({ ...DEFAULT_HOROLOGIUM_CONFIG });
  readonly mode = signal<HorologiumMode>('planned');
  readonly phase = signal<TimerPhase>('idle');
  readonly running = signal(false);
  /** 1-based work/rest cycle index within the session. */
  readonly currentIteration = signal(0);
  readonly remainingMs = signal(0);
  readonly totalPhaseMs = signal(0);
  /** Timer chimes (work/rest end). Independent of the scenery bed. */
  readonly jinglesMuted = signal(loadFlag(JINGLES_MUTE_KEY));
  /** Looping scenery soundscape. Independent of timer chimes. */
  readonly ambienceMuted = signal(loadFlag(AMBIENCE_MUTE_KEY));
  readonly presetId = signal<string | 'custom' | 'track'>('classic');
  readonly awarding = signal(false);
  readonly lastToast = signal<string | null>(null);
  readonly lastSession = signal<HorologiumSessionRecord | null>(null);
  readonly sessionsVersion = signal(0);
  /** Finished work blocks in the current planned/track run (skip does not count). */
  readonly completedBlocks = signal(0);
  readonly boundDaily = signal<HorologiumBoundDaily | null>(null);
  readonly taskCompleted = signal(false);
  readonly disciplineGranted = signal(false);
  /** Paused between phases until the user starts rest / the next lap. */
  readonly awaitingContinue = signal(false);
  /** Leftover rest skipped this sessio — added onto the next rest phase. */
  readonly restCarryMs = signal(0);
  private sessionStartedAt: number | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bound Vigilia project name — set by the watch service. */
  readonly linkedWatchName = signal<string | null>(null);

  readonly remainingLabel = computed(() => this.formatMs(this.remainingMs()));

  /** Default rest plus any skipped leftover, e.g. 08:06. */
  readonly nextRestLabel = computed(() =>
    this.formatMs(this.config().restMinutes * 60_000 + this.restCarryMs()),
  );

  readonly restStatLabel = computed(() => {
    if (this.phase() === 'rest') {
      return this.formatMs(this.totalPhaseMs());
    }
    if (this.restCarryMs() > 0) {
      return this.nextRestLabel();
    }
    return `${this.config().restMinutes}m`;
  });

  readonly canSkipRest = computed(
    () => this.phase() === 'rest' && !this.awarding(),
  );

  readonly continueLabel = computed(() => {
    if (!this.awaitingContinue()) {
      return 'Resume';
    }
    return this.phase() === 'rest' ? 'Start rest' : 'Start next lap';
  });

  readonly progressPercent = computed(() => {
    const total = this.totalPhaseMs();
    if (total <= 0) {
      return 0;
    }
    // Sub-percent precision so the SVG ring glides instead of stepping.
    return Math.min(100, Math.max(0, ((total - this.remainingMs()) / total) * 100));
  });

  readonly phaseLabel = computed(() => {
    switch (this.phase()) {
      case 'work':
        return 'Focus';
      case 'rest':
        return 'Rest';
      case 'complete':
        return 'Complete';
      default:
        return 'Ready';
    }
  });

  readonly sessionLabel = computed(() => {
    const cfg = this.config();
    const phase = this.phase();
    const mode = this.mode();
    if (phase === 'idle') {
      return mode === 'adhoc'
        ? 'Track'
        : `${cfg.iterations} block${cfg.iterations === 1 ? '' : 's'}`;
    }
    if (phase === 'complete') {
      return 'Goal complete';
    }
    if (mode === 'adhoc') {
      return `Block ${this.currentIteration()}`;
    }
    return `${this.currentIteration()} / ${cfg.iterations}`;
  });

  readonly canCompleteTask = computed(() => {
    if (!this.boundDaily() || this.taskCompleted()) {
      return false;
    }
    const phase = this.phase();
    return phase === 'work' || phase === 'rest' || phase === 'complete';
  });

  readonly taskLabel = computed(() => {
    const d = this.boundDaily();
    if (!d) {
      return '';
    }
    return d.journeyLabel?.trim() || d.name;
  });

  billedLaps(): number {
    return this.mode() === 'adhoc' ? 1 : this.config().iterations;
  }

  elapsedMinutes(): number {
    if (this.sessionStartedAt == null) {
      return 0;
    }
    return Math.max(0, Math.round((Date.now() - this.sessionStartedAt) / 60_000));
  }

  setBoundDaily(daily: HorologiumBoundDaily | null): void {
    this.rebindDaily(daily);
  }

  rebindDaily(daily: HorologiumBoundDaily | null): void {
    const kind = this.activeKind();
    if (!kind) {
      this.boundDaily.set(daily);
      this.taskCompleted.set(false);
      return;
    }
    this.clockApi.patchBoundDaily(kind, daily ? slimBound(daily) : null).subscribe({
      next: (event) => {
        this.applyEvent(event);
        if (daily) {
          this.boundDaily.set(daily);
        }
        this.taskCompleted.set(false);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        const message = err.error?.message;
        this.setToast(
          Array.isArray(message)
            ? message.join(', ')
            : (message ?? 'Could not change the focused task'),
        );
      },
    });
  }

  applyConfig(config: HorologiumConfig): void {
    if (this.running() || this.phase() === 'work' || this.phase() === 'rest') {
      return;
    }
    this.config.set(this.sanitize(config));
  }

  setMode(mode: HorologiumMode): void {
    if (this.running() || this.phase() === 'work' || this.phase() === 'rest') {
      return;
    }
    this.mode.set(mode);
    if (mode === 'adhoc') {
      this.presetId.set('track');
    }
  }

  startSession(config?: HorologiumConfig, mode?: HorologiumMode): void {
    if (config) {
      this.config.set(this.sanitize(config));
    }
    if (mode) {
      this.mode.set(mode);
    }
    const cfg = this.config();
    const kind: 'sessio' | 'track' =
      (mode ?? this.mode()) === 'adhoc' ? 'track' : 'sessio';
    const daily = this.boundDaily();
    this.awarding.set(true);
    this.clockApi
      .startSessio(kind, {
        ...cfg,
        presetId:
          this.presetId() === 'custom' || this.presetId() === 'track'
            ? undefined
            : this.presetId(),
        watchName: this.linkedWatchName(),
        boundDaily: daily
          ? {
              source: daily.source,
              runId: daily.runId,
              dailyTaskId: daily.dailyTaskId,
              subtaskId: daily.subtaskId,
              questId: daily.questId,
              name: daily.name,
              journeyLabel: daily.journeyLabel,
            }
          : null,
      })
      .subscribe({
        next: (event) => {
          this.awarding.set(false);
          this.applyEvent(event);
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.awarding.set(false);
          const message = err.error?.message;
          this.setToast(
            Array.isArray(message)
              ? message.join(', ')
              : (message ?? 'Could not start the timer'),
          );
        },
      });
  }

  applyEvent(event: ClockEvent): void {
    this.applySnapshot(event.snapshot, event.kind);
    this.handleClockFx(event);
  }

  applySnapshot(snapshot: ClockSnapshot | null, kind?: ClockKind): void {
    if (!snapshot) {
      const current = this.activeKind();
      if (kind && current && kind !== current) {
        return;
      }
      if (this.running() || this.phase() !== 'idle') {
        this.resetLocal();
      }
      return;
    }
    if (snapshot.kind !== 'sessio' && snapshot.kind !== 'track') {
      return;
    }
    const payload = snapshot.sessio;
    if (payload) {
      this.mode.set(payload.mode === 'adhoc' ? 'adhoc' : 'planned');
      this.config.set({
        workMinutes: payload.workMinutes,
        restMinutes: payload.restMinutes,
        iterations: payload.iterations,
        restAfterLast: payload.restAfterLast,
      });
      this.currentIteration.set(payload.currentIteration);
      this.completedBlocks.set(payload.completedBlocks);
      this.restCarryMs.set(payload.restCarryMs);
      this.taskCompleted.set(payload.taskCompleted);
      this.disciplineGranted.set(!!payload.disciplineGranted);
      this.sessionStartedAt = Date.parse(payload.sessionStartedAt) || Date.now();
      this.presetId.set(
        payload.presetId ||
          (payload.mode === 'adhoc' ? 'track' : this.presetId()),
      );
      if (payload.boundDaily) {
        const current = this.boundDaily();
        const keep = sameBind(current, payload.boundDaily);
        this.boundDaily.set({
          source: payload.boundDaily.source,
          runId: payload.boundDaily.runId,
          dailyTaskId: payload.boundDaily.dailyTaskId,
          subtaskId: payload.boundDaily.subtaskId,
          questId: payload.boundDaily.questId,
          name: payload.boundDaily.name,
          journeyLabel: payload.boundDaily.journeyLabel,
          kind: keep ? current!.kind : 'daily',
          totalXp: keep ? current!.totalXp : 0,
          durationDays: keep ? current!.durationDays : null,
          elapsedMs: keep ? current!.elapsedMs : 0,
          skillShares: keep ? current!.skillShares : [],
        });
      } else {
        this.boundDaily.set(null);
      }
    }
    const phase =
      snapshot.phase === 'work' ||
      snapshot.phase === 'rest' ||
      snapshot.phase === 'complete'
        ? snapshot.phase
        : 'idle';
    this.phase.set(phase);
    this.running.set(snapshot.status === 'running');
    this.awaitingContinue.set(
      snapshot.status === 'paused' && !!payload?.awaitingContinue,
    );
    this.totalPhaseMs.set(snapshot.totalPhaseMs);
    this.pausedRemainingMs = Math.max(0, snapshot.remainingMs);
    if (snapshot.status === 'running' && snapshot.endsAt) {
      this.endAtMs = Date.parse(snapshot.endsAt);
      this.remainingMs.set(Math.max(0, this.endAtMs - clockNow()));
      this.startTicker();
    } else {
      this.endAtMs = null;
      this.remainingMs.set(Math.max(0, snapshot.remainingMs));
      this.stopTicker();
    }
  }

  handleClockFx(event: ClockEvent): void {
    if (event.jingle === 'work' || event.jingle === 'rest') {
      this.playPhaseJingle(event.jingle);
    }
    if (event.toast) {
      this.setToast(event.toast);
    }
    const complete = event.complete as { session?: HorologiumSessionRecord } | undefined;
    if (complete?.session) {
      this.lastSession.set(complete.session);
    }
  }

  private activeKind(): 'sessio' | 'track' | null {
    const phase = this.phase();
    if (phase === 'idle') {
      return null;
    }
    return this.mode() === 'adhoc' ? 'track' : 'sessio';
  }

  pause(): void {
    const kind = this.activeKind();
    if (!kind || !this.running()) {
      return;
    }
    this.clockApi.pause(kind).subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  resume(): void {
    const kind = this.activeKind() ?? (this.mode() === 'adhoc' ? 'track' : 'sessio');
    if (this.running() || (this.phase() !== 'work' && this.phase() !== 'rest')) {
      return;
    }
    this.clockApi.resume(kind).subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  skipRest(): void {
    if (this.phase() !== 'rest') {
      return;
    }
    const kind = this.activeKind();
    if (!kind) {
      return;
    }
    this.clockApi.skip(kind).subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  reset(): void {
    const kind = this.activeKind();
    if (kind && (this.phase() === 'work' || this.phase() === 'rest')) {
      this.abandonSession();
      return;
    }
    if (kind === 'sessio' || kind === 'track') {
      this.clockApi.stop(kind).subscribe({
        next: (event) => this.applyEvent(event),
      });
      return;
    }
    this.resetLocal();
  }

  private resetLocal(): void {
    this.stopTicker();
    this.running.set(false);
    this.phase.set('idle');
    this.currentIteration.set(0);
    this.completedBlocks.set(0);
    this.taskCompleted.set(false);
    this.disciplineGranted.set(false);
    this.awaitingContinue.set(false);
    this.remainingMs.set(0);
    this.totalPhaseMs.set(0);
    this.endAtMs = null;
    this.pausedRemainingMs = 0;
    this.sessionStartedAt = null;
    this.restCarryMs.set(0);
  }

  /**
   * Stop a planned Sessio early and apply the unfinished-split XP penalty.
   * After a bound task is done, there is no penalty — the log records early end.
   * Track (adhoc) has no goal, so it just resets (or close-early if the task settled).
   */
  abandonSession(): void {
    const kind = this.activeKind() ?? (this.mode() === 'adhoc' ? 'track' : 'sessio');
    this.awarding.set(true);
    this.clockApi.stop(kind).subscribe({
      next: (event) => {
        this.awarding.set(false);
        this.applyEvent(event);
        const complete = event.complete as {
          xpRemoved?: number;
          unfinishedSplits?: number;
        } | undefined;
        if (complete && typeof complete.xpRemoved === 'number') {
          this.setToast(
            complete.xpRemoved > 0
              ? `Stopped — −${complete.xpRemoved} Focus XP (${complete.unfinishedSplits} unfinished split${complete.unfinishedSplits === 1 ? '' : 's'})`
              : event.toast || 'Sessio stopped',
          );
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.awarding.set(false);
        const message = err.error?.message;
        this.setToast(
          Array.isArray(message)
            ? message.join(', ')
            : (message ?? 'Could not apply abandon penalty'),
        );
      },
    });
  }

  completeBoundTask(decideEnd: () => boolean): void {
    if (!this.boundDaily() || this.taskCompleted() || this.awarding()) {
      return;
    }
    const kind = this.activeKind() ?? (this.mode() === 'adhoc' ? 'track' : 'sessio');
    const endSession = this.phase() === 'complete' ? false : decideEnd();
    this.awarding.set(true);
    this.clockApi.completeTask(kind, endSession).subscribe({
      next: (event) => {
        this.awarding.set(false);
        this.applyEvent(event);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.awarding.set(false);
        const message = err.error?.message;
        this.setToast(
          Array.isArray(message)
            ? message.join(', ')
            : (message ?? 'Could not complete the task'),
        );
      },
    });
  }

  toggleJinglesMute(): void {
    this.jinglesMuted.update((v) => {
      const next = !v;
      saveFlag(JINGLES_MUTE_KEY, next);
      return next;
    });
  }

  toggleAmbienceMute(): void {
    this.ambienceMuted.update((v) => {
      const next = !v;
      saveFlag(AMBIENCE_MUTE_KEY, next);
      return next;
    });
  }

  private setToast(message: string | null): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.lastToast.set(message);
    if (message) {
      this.toastTimer = setTimeout(() => {
        this.lastToast.set(null);
        this.toastTimer = null;
      }, 3000);
    }
  }

  private tick(): void {
    if (!this.running() || this.endAtMs == null) {
      return;
    }
    const left = Math.max(0, this.endAtMs - clockNow());
    this.remainingMs.set(left);
  }

  private startTicker(): void {
    this.stopTicker();
    // Smooth rAF clock outside Zone — signal updates drive the ring without Zone thrash.
    this.ngZone.runOutsideAngular(() => {
      const loop = () => {
        this.tick();
        if (this.running() && this.endAtMs != null) {
          this.tickHandle = requestAnimationFrame(loop);
        } else {
          this.tickHandle = null;
        }
      };
      this.tickHandle = requestAnimationFrame(loop);
    });
  }

  private stopTicker(): void {
    if (this.tickHandle != null) {
      cancelAnimationFrame(this.tickHandle);
      this.tickHandle = null;
    }
  }

  applyJingleVolume(): void {
    const gain = this.sound.feedbackVolume() / 100;
    if (this.workEndAudio) {
      this.workEndAudio.volume = gain;
    }
    if (this.restEndAudio) {
      this.restEndAudio.volume = gain;
    }
  }

  private playPhaseJingle(endingPhase: 'work' | 'rest'): void {
    if (this.jinglesMuted()) {
      return;
    }
    const audio = this.ensurePhaseAudio(endingPhase);
    if (!audio) {
      return;
    }
    try {
      audio.volume = this.sound.feedbackVolume() / 100;
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // Autoplay may be blocked until the user interacts with the page.
    }
  }

  private ensurePhaseAudio(
    endingPhase: 'work' | 'rest',
  ): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') {
      return null;
    }
    if (endingPhase === 'rest') {
      this.restEndAudio ??= new Audio(REST_END_JINGLE);
      return this.restEndAudio;
    }
    this.workEndAudio ??= new Audio(WORK_END_JINGLE);
    return this.workEndAudio;
  }

  private sanitize(config: HorologiumConfig): HorologiumConfig {
    return {
      workMinutes: clamp(config.workMinutes, 1, 180),
      restMinutes: clamp(config.restMinutes, 1, 60),
      iterations: clamp(Math.round(config.iterations), 2, 20),
      restAfterLast: false,
    };
  }

  private formatMs(ms: number): string {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.min(max, Math.max(min, n));
}
