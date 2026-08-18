import {
  computed,
  inject,
  Injectable,
  NgZone,
  signal,
} from '@angular/core';
import { DailiesService } from '../dailies/dailies.service';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { HorologiumApiService } from './horologium-api.service';
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

@Injectable({ providedIn: 'root' })
export class HorologiumTimerService {
  private readonly api = inject(HorologiumApiService);
  private readonly dailies = inject(DailiesService);
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
    if (this.running() || this.phase() === 'work' || this.phase() === 'rest') {
      return;
    }
    this.boundDaily.set(daily);
    this.taskCompleted.set(false);
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
    this.stopTicker();
    this.setToast(null);
    this.currentIteration.set(1);
    this.completedBlocks.set(0);
    this.taskCompleted.set(false);
    this.disciplineGranted.set(false);
    this.sessionStartedAt = Date.now();
    this.beginPhase('work', this.config().workMinutes);
  }

  /** Sessio start clock + bound Vigilia name, attached to every log write. */
  private sessionStamp(): { startedAt?: string; watchName?: string } {
    const startedAt = this.sessionStartedAt
      ? new Date(this.sessionStartedAt).toISOString()
      : undefined;
    const watchName = this.linkedWatchName()?.trim();
    return {
      ...(startedAt ? { startedAt } : {}),
      ...(watchName ? { watchName } : {}),
    };
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

  skipRest(): void {
    if (this.phase() !== 'rest') {
      return;
    }
    const leftover = Math.ceil(Math.max(0, this.remainingMs()) / 1000) * 1000;
    this.restCarryMs.update((carry) => carry + leftover);
    this.advancePhase(false, false);
  }

  reset(): void {
    this.stopTicker();
    this.running.set(false);
    this.phase.set('idle');
    this.currentIteration.set(0);
    this.completedBlocks.set(0);
    this.taskCompleted.set(false);
    this.disciplineGranted.set(false);
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
    if (this.taskCompleted()) {
      this.closeEarlyAfterTask();
      return;
    }
    if (this.mode() !== 'planned') {
      this.reset();
      return;
    }
    const cfg = this.config();
    const unfinished = Math.max(0, cfg.iterations - this.completedBlocks());
    if (unfinished <= 0) {
      this.reset();
      return;
    }
    const presetId = this.presetId();
    this.awarding.set(true);
    this.api
      .abandonSession({
        workMinutes: cfg.workMinutes,
        restMinutes: cfg.restMinutes,
        iterations: cfg.iterations,
        completedBlocks: this.completedBlocks(),
        presetId:
          presetId === 'custom' || presetId === 'track' ? undefined : presetId,
        ...this.sessionStamp(),
      })
      .subscribe({
        next: (result) => {
          this.awarding.set(false);
          this.lastSession.set(result.session);
          this.skillsService.invalidateTree();
          if (result.reversal && result.xpRemoved > 0) {
            this.xpFeedback.publishReversal(result.reversal);
          }
          this.sessionsVersion.update((n) => n + 1);
          this.setToast(
            result.xpRemoved > 0
              ? `Stopped — −${result.xpRemoved} Focus XP (${result.unfinishedSplits} unfinished split${result.unfinishedSplits === 1 ? '' : 's'})`
              : 'Sessio stopped',
          );
          this.reset();
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
    const daily = this.boundDaily();
    if (!daily || this.taskCompleted() || this.awarding()) {
      return;
    }
    if (daily.source === 'daily') {
      this.completeBoundBoardDaily(daily, decideEnd);
      return;
    }
    const endSession = this.phase() === 'complete' ? false : decideEnd();
    const cfg = this.config();
    const presetId = this.presetId();
    this.awarding.set(true);
    this.api
      .completeTask({
        workMinutes: cfg.workMinutes,
        restMinutes: cfg.restMinutes,
        iterations: this.billedLaps(),
        mode: this.mode(),
        completedBlocks: this.completedBlocks(),
        elapsedMinutes: this.elapsedMinutes(),
        questRunId: daily.runId,
        questSubtaskId: daily.source === 'subtask' ? daily.subtaskId ?? undefined : undefined,
        endSession,
        disciplineGranted: this.disciplineGranted(),
        specialLapsAwarded: Math.min(this.completedBlocks(), this.billedLaps()),
        presetId:
          presetId === 'custom' || presetId === 'track' ? undefined : presetId,
        ...this.sessionStamp(),
      })
      .subscribe({
        next: (result) => {
          this.awarding.set(false);
          this.lastSession.set(result.session);
          this.skillsService.invalidateTree();
          this.publishAwards(result.awards);
          this.sessionsVersion.update((n) => n + 1);
          this.taskCompleted.set(true);
          this.disciplineGranted.set(true);
          if (result.endedEarly) {
            this.setToast(
              `${result.taskLabel} done · ended early in ${
                result.elapsedMinutes < 1 ? '<1' : result.elapsedMinutes
              }m · full session XP kept`,
            );
            this.reset();
            return;
          }
          this.setToast(
            `${result.taskLabel} done · full session XP granted. Remaining blocks are extra Focus.`,
          );
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

  private completeBoundBoardDaily(
    daily: HorologiumBoundDaily,
    decideEnd: () => boolean,
  ): void {
    const taskId = daily.dailyTaskId;
    if (!taskId) {
      return;
    }
    const endSession = this.phase() === 'complete' ? false : decideEnd();
    this.awarding.set(true);
    this.dailies.complete(taskId).subscribe({
      next: (result) => {
        this.skillsService.invalidateTree();
        for (const award of result.awards ?? (result.award ? [result.award] : [])) {
          this.xpFeedback.publishAward(award);
        }
        this.taskCompleted.set(true);
        this.sessionsVersion.update((n) => n + 1);
        if (endSession && this.phase() !== 'complete' && this.phase() !== 'idle') {
          this.closeEarlyAfterTask();
          return;
        }
        this.awarding.set(false);
        this.setToast(
          `${this.taskLabel()} done · daily XP granted. Remaining blocks are extra Focus.`,
        );
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.awarding.set(false);
        const message = err.error?.message;
        this.setToast(
          Array.isArray(message)
            ? message.join(', ')
            : (message ?? 'Could not complete the daily'),
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

  private beginPhase(
    phase: 'work' | 'rest',
    minutes: number,
    extraMs = 0,
  ): void {
    const ms = Math.max(
      1,
      Math.round(minutes * 60_000) + Math.max(0, extraMs),
    );
    this.phase.set(phase);
    this.totalPhaseMs.set(ms);
    this.remainingMs.set(ms);
    this.pausedRemainingMs = ms;
    this.endAtMs = Date.now() + ms;
    this.running.set(true);
    this.startTicker();
  }

  private takeRestCarry(): number {
    const extra = this.restCarryMs();
    this.restCarryMs.set(0);
    return extra;
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
        this.completedBlocks.update((n) => n + 1);
        this.awardBlockXp();
      }

      if (mode === 'adhoc') {
        this.beginPhase('rest', cfg.restMinutes, this.takeRestCarry());
        return;
      }

      const isLast = iteration >= cfg.iterations;
      if (isLast && !cfg.restAfterLast) {
        this.finishPlannedGoal();
        return;
      }
      this.beginPhase('rest', cfg.restMinutes, this.takeRestCarry());
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
    if (this.disciplineGranted()) {
      return;
    }
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
    const daily = this.boundDaily();
    const laps = this.billedLaps();
    const lapIndex = this.completedBlocks();
    this.api
      .awardBlock({
        workMinutes: cfg.workMinutes,
        restMinutes: cfg.restMinutes,
        mode,
        presetId:
          presetId === 'custom' || presetId === 'track' ? undefined : presetId,
        questRunId:
          daily?.source === 'quest' || daily?.source === 'subtask'
            ? daily.runId
            : undefined,
        questSubtaskId:
          daily?.source === 'subtask' ? daily.subtaskId ?? undefined : undefined,
        lapIndex,
        laps,
        specialDrops:
          (daily?.source === 'quest' || daily?.source === 'subtask') &&
          !this.taskCompleted(),
        ...this.sessionStamp(),
      })
      .subscribe({
        next: (result) => {
          this.awardingBlock = false;
          this.awarding.set(false);
          this.lastSession.set(result.session);
          this.skillsService.invalidateTree();
          this.xpFeedback.publishAward(result.award);
          this.publishAwards(
            (result.awards ?? []).filter(
              (a) => a.activity.id !== result.award.activity.id,
            ),
          );
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
        ...this.sessionStamp(),
      })
      .subscribe({
        next: (result) => {
          this.awarding.set(false);
          this.lastSession.set(result.session);
          if (result.award) {
            this.skillsService.invalidateTree();
            this.xpFeedback.publishAward(result.award);
            this.disciplineGranted.set(true);
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

  private closeEarlyAfterTask(): void {
    const cfg = this.config();
    const daily = this.boundDaily();
    const presetId = this.presetId();
    this.awarding.set(true);
    this.api
      .closeEarly({
        workMinutes: cfg.workMinutes,
        restMinutes: cfg.restMinutes,
        iterations: this.billedLaps(),
        elapsedMinutes: this.elapsedMinutes(),
        completedBlocks: this.completedBlocks(),
        questRunId: daily?.source === 'quest' ? daily.runId : undefined,
        taskLabel: this.taskLabel() || undefined,
        presetId:
          presetId === 'custom' || presetId === 'track' ? undefined : presetId,
        ...this.sessionStamp(),
      })
      .subscribe({
        next: (result) => {
          this.awarding.set(false);
          this.lastSession.set(result.session);
          this.sessionsVersion.update((n) => n + 1);
          this.setToast('Sessio closed — task was already done, no penalty');
          this.reset();
        },
        error: () => {
          this.awarding.set(false);
          this.reset();
        },
      });
  }

  private publishAwards(
    awards: Array<{
      activity: { xpGained: number };
      skill: import('../skills/skill.model').Skill;
      leveledUp: boolean;
      levelsGained: number;
      previousLevel?: number;
      previousProgress?: import('../skills/skill.model').Skill['progress'];
    }>,
  ): void {
    for (const award of awards) {
      this.xpFeedback.publishAward(award);
    }
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
    if (this.jinglesMuted()) {
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
