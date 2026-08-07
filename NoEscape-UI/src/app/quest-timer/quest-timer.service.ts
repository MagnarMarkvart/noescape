import { computed, Injectable, signal } from '@angular/core';
import {
  DEFAULT_QUEST_TIMER_CONFIG,
  JINGLE_SRC,
  QuestTimerConfig,
  TimerPhase,
} from './quest-timer.model';

@Injectable({ providedIn: 'root' })
export class QuestTimerService {
  private readonly audio =
    typeof Audio !== 'undefined' ? new Audio(JINGLE_SRC) : null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private endAtMs: number | null = null;
  private pausedRemainingMs = 0;

  readonly config = signal<QuestTimerConfig>({ ...DEFAULT_QUEST_TIMER_CONFIG });
  readonly phase = signal<TimerPhase>('idle');
  readonly running = signal(false);
  /** 1-based work/rest cycle index within the session. */
  readonly currentIteration = signal(0);
  readonly remainingMs = signal(0);
  readonly totalPhaseMs = signal(0);
  readonly muted = signal(false);

  readonly remainingLabel = computed(() =>
    this.formatMs(this.remainingMs()),
  );

  readonly progressPercent = computed(() => {
    const total = this.totalPhaseMs();
    if (total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round(((total - this.remainingMs()) / total) * 100));
  });

  readonly phaseLabel = computed(() => {
    switch (this.phase()) {
      case 'work':
        return 'Work';
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
    if (phase === 'idle') {
      return `${cfg.iterations} quest${cfg.iterations === 1 ? '' : 's'}`;
    }
    if (phase === 'complete') {
      return 'Session sealed';
    }
    return `${this.currentIteration()} / ${cfg.iterations}`;
  });

  applyConfig(config: QuestTimerConfig): void {
    if (this.running() || this.phase() === 'work' || this.phase() === 'rest') {
      return;
    }
    this.config.set(this.sanitize(config));
  }

  startSession(config?: QuestTimerConfig): void {
    if (config) {
      this.config.set(this.sanitize(config));
    }
    this.stopTicker();
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
    if (this.running() || (this.phase() !== 'work' && this.phase() !== 'rest')) {
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
    this.advancePhase(false);
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

  private advancePhase(playSound: boolean): void {
    if (playSound) {
      this.playJingle();
    }

    const cfg = this.config();
    const phase = this.phase();
    const iteration = this.currentIteration();

    if (phase === 'work') {
      const isLast = iteration >= cfg.iterations;
      if (isLast && !cfg.restAfterLast) {
        this.finishSession();
        return;
      }
      this.beginPhase('rest', cfg.restMinutes);
      return;
    }

    if (phase === 'rest') {
      if (iteration >= cfg.iterations) {
        this.finishSession();
        return;
      }
      this.currentIteration.set(iteration + 1);
      this.beginPhase('work', cfg.workMinutes);
    }
  }

  private finishSession(): void {
    this.stopTicker();
    this.running.set(false);
    this.phase.set('complete');
    this.remainingMs.set(0);
    this.endAtMs = null;
    this.pausedRemainingMs = 0;
  }

  private tick(): void {
    if (!this.running() || this.endAtMs == null) {
      return;
    }
    const left = Math.max(0, this.endAtMs - Date.now());
    this.remainingMs.set(left);
    if (left <= 0) {
      this.advancePhase(true);
    }
  }

  private startTicker(): void {
    this.stopTicker();
    this.tickHandle = setInterval(() => this.tick(), 200);
  }

  private stopTicker(): void {
    if (this.tickHandle != null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private playJingle(): void {
    if (this.muted() || !this.audio) {
      return;
    }
    try {
      this.audio.currentTime = 0;
      void this.audio.play();
    } catch {
      // Autoplay may be blocked until the user interacts with the page.
    }
  }

  private sanitize(config: QuestTimerConfig): QuestTimerConfig {
    return {
      workMinutes: clamp(config.workMinutes, 1, 180),
      restMinutes: clamp(config.restMinutes, 1, 60),
      iterations: clamp(Math.round(config.iterations), 1, 20),
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
