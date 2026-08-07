import {
  computed,
  inject,
  Injectable,
  NgZone,
  signal,
} from '@angular/core';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { HorologiumApiService } from './horologium-api.service';
import {
  DEFAULT_HOROLOGIUM_CONFIG,
  HorologiumConfig,
  HorologiumMode,
  HorologiumSessionRecord,
  REST_END_JINGLE,
  TimerPhase,
  WORK_END_JINGLE,
} from './horologium.model';

@Injectable({ providedIn: 'root' })
export class HorologiumTimerService {
  private readonly api = inject(HorologiumApiService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly skillsService = inject(SkillsService);
  private readonly ngZone = inject(NgZone);
  private workEndAudio: HTMLAudioElement | null = null;
  private restEndAudio: HTMLAudioElement | null = null;
  private tickHandle: number | null = null;
  private endAtMs: number | null = null;
  private pausedRemainingMs = 0;
  private awardingBlock = false;

  readonly config = signal<HorologiumConfig>({ ...DEFAULT_HOROLOGIUM_CONFIG });
  readonly mode = signal<HorologiumMode>('planned');
  readonly phase = signal<TimerPhase>('idle');
  readonly running = signal(false);
  /** 1-based work/rest cycle index within the session. */
  readonly currentIteration = signal(0);
  readonly remainingMs = signal(0);
  readonly totalPhaseMs = signal(0);
  readonly muted = signal(false);
  readonly presetId = signal<string | 'custom' | 'track'>('classic');
  readonly awarding = signal(false);
  readonly lastToast = signal<string | null>(null);
  readonly lastSession = signal<HorologiumSessionRecord | null>(null);
  readonly sessionsVersion = signal(0);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly remainingLabel = computed(() => this.formatMs(this.remainingMs()));

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
    this.stopTicker();
    this.setToast(null);
    this.currentIteration.set(1);
    this.beginPhase('work', this.config().workMinutes);
  }

  pause(): void {
    if (!this.running()) {
      return;
    }
    this.pausedRemainingMs = Math.max(0, this.remainingMs());
    this.endAtMs = null;
    this.running.set(false);
    this.stopTicker();
  }

  resume(): void {
    if (
      this.running() ||
      (this.phase() !== 'work' && this.phase() !== 'rest')
    ) {
      return;
    }
    this.endAtMs = Date.now() + this.pausedRemainingMs;
    this.running.set(true);
    this.startTicker();
  }

  skip(): void {
    if (this.phase() !== 'work' && this.phase() !== 'rest') {
      return;
    }
    // Skip does not award block XP (timer must finish).
    this.advancePhase(false, false);
  }

  reset(): void {
    this.stopTicker();
    this.running.set(false);
    this.phase.set('idle');
    this.currentIteration.set(0);
    this.remainingMs.set(0);
    this.totalPhaseMs.set(0);
    this.endAtMs = null;
    this.pausedRemainingMs = 0;
  }

  toggleMute(): void {
    this.muted.update((v) => !v);
  }

  private beginPhase(phase: 'work' | 'rest', minutes: number): void {
    const ms = Math.max(1, Math.round(minutes * 60_000));
    this.phase.set(phase);
    this.totalPhaseMs.set(ms);
    this.remainingMs.set(ms);
    this.pausedRemainingMs = ms;
    this.endAtMs = Date.now() + ms;
    this.running.set(true);
    this.startTicker();
  }

  private advancePhase(playSound: boolean, awardWorkXp: boolean): void {
    const cfg = this.config();
    const phase = this.phase();
    const iteration = this.currentIteration();
    const mode = this.mode();

    if (playSound && (phase === 'work' || phase === 'rest')) {
      this.playPhaseJingle(phase);
    }

    if (phase === 'work') {
      if (awardWorkXp) {
        this.awardBlockXp();
      }

      if (mode === 'adhoc') {
        this.beginPhase('rest', cfg.restMinutes);
        return;
      }

      const isLast = iteration >= cfg.iterations;
      if (isLast && !cfg.restAfterLast) {
        this.finishPlannedGoal();
        return;
      }
      this.beginPhase('rest', cfg.restMinutes);
      return;
    }

    if (phase === 'rest') {
      if (mode === 'adhoc') {
        this.currentIteration.set(iteration + 1);
        this.beginPhase('work', cfg.workMinutes);
        return;
      }

      if (iteration >= cfg.iterations) {
        this.finishPlannedGoal();
        return;
      }
      this.currentIteration.set(iteration + 1);
      this.beginPhase('work', cfg.workMinutes);
    }
  }

  private finishPlannedGoal(): void {
    this.stopTicker();
    this.running.set(false);
    this.phase.set('complete');
    this.remainingMs.set(0);
    this.endAtMs = null;
    this.pausedRemainingMs = 0;
    this.awardGoalBonus();
  }

  private awardBlockXp(): void {
    if (this.awardingBlock) {
      return;
    }
    this.awardingBlock = true;
    this.awarding.set(true);
    const cfg = this.config();
    const mode = this.mode();
    const presetId = this.presetId();
    this.api
      .awardBlock({
        workMinutes: cfg.workMinutes,
        restMinutes: cfg.restMinutes,
        mode,
        presetId:
          presetId === 'custom' || presetId === 'track' ? undefined : presetId,
      })
      .subscribe({
        next: (result) => {
          this.awardingBlock = false;
          this.awarding.set(false);
          this.lastSession.set(result.session);
          this.skillsService.invalidateTree();
          this.xpFeedback.publishAward(result.award);
          this.sessionsVersion.update((n) => n + 1);
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.awardingBlock = false;
          this.awarding.set(false);
          const message = err.error?.message;
          this.setToast(
            Array.isArray(message)
              ? message.join(', ')
              : (message ?? 'Could not log block XP'),
          );
        },
      });
  }

  private awardGoalBonus(): void {
    this.awarding.set(true);
    const cfg = this.config();
    const presetId = this.presetId();
    this.api
      .awardGoalBonus({
        workMinutes: cfg.workMinutes,
        restMinutes: cfg.restMinutes,
        iterations: cfg.iterations,
        restAfterLast: cfg.restAfterLast,
        presetId:
          presetId === 'custom' || presetId === 'track' ? undefined : presetId,
      })
      .subscribe({
        next: (result) => {
          this.awarding.set(false);
          this.lastSession.set(result.session);
          if (result.award) {
            this.skillsService.invalidateTree();
            this.xpFeedback.publishAward(result.award);
          }
          this.sessionsVersion.update((n) => n + 1);
        },
        error: (err: { error?: { message?: string | string[] } }) => {
          this.awarding.set(false);
          const message = err.error?.message;
          this.setToast(
            Array.isArray(message)
              ? message.join(', ')
              : (message ?? 'Could not log goal bonus'),
          );
        },
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
    const left = Math.max(0, this.endAtMs - Date.now());
    this.remainingMs.set(left);
    if (left <= 0) {
      // Phase transitions touch awards / audio — run inside Angular.
      this.ngZone.run(() => this.advancePhase(true, true));
    }
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

  private playPhaseJingle(endingPhase: 'work' | 'rest'): void {
    if (this.muted()) {
      return;
    }
    const audio = this.ensurePhaseAudio(endingPhase);
    if (!audio) {
      return;
    }
    try {
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
      restAfterLast: Boolean(config.restAfterLast),
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
