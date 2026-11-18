import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { DailiesService } from '../dailies/dailies.service';
import { QuestsService } from '../quests/quests.service';
import { formatElapsedMs, HorologiumBoundDaily } from './horologium.model';
import { HorologiumTimerService } from './horologium-timer.service';

@Injectable({ providedIn: 'root' })
export class HorologiumTaskClockService {
  private readonly timer = inject(HorologiumTimerService);
  private readonly dailies = inject(DailiesService);
  private readonly quests = inject(QuestsService);

  readonly elapsedMs = signal(0);
  readonly elapsedLabel = computed(() => formatElapsedMs(this.elapsedMs()));

  private localBaseMs = 0;
  private localStartedAt: number | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private boundKey = '';
  private bound: HorologiumBoundDaily | null = null;
  private readonly elapsedByKey = new Map<string, number>();

  readonly desiredRunning = computed(() => {
    const bound = this.timer.boundDaily();
    if (!bound || this.timer.taskCompleted()) {
      return false;
    }
    if (bound.source === 'quest') {
      return false;
    }
    return this.timer.phase() === 'work' && this.timer.running();
  });

  constructor() {
    effect(() => {
      const bound = this.timer.boundDaily();
      const want = this.desiredRunning();
      queueMicrotask(() => this.reconcile(bound, want));
    });
    this.bindPageLifecycle();
  }

  /** Write the current work elapsed to the bound daily or subtask. */
  flush(): number {
    if (this.localStartedAt != null) {
      this.localBaseMs += Date.now() - this.localStartedAt;
      this.localStartedAt = null;
      this.elapsedMs.set(this.localBaseMs);
    }
    this.persist(this.localBaseMs);
    return this.localBaseMs;
  }

  private reconcile(bound: HorologiumBoundDaily | null, want: boolean): void {
    const key = bound
      ? `${bound.source}:${bound.runId}:${bound.dailyTaskId}:${bound.subtaskId}`
      : '';
    if (key !== this.boundKey) {
      this.pauseLocal(true);
      if (this.boundKey) {
        this.elapsedByKey.set(this.boundKey, this.localBaseMs);
      }
      this.bound = bound;
      this.boundKey = key;
      this.localBaseMs =
        (key ? this.elapsedByKey.get(key) : undefined) ?? bound?.elapsedMs ?? 0;
      this.elapsedMs.set(this.localBaseMs);
    } else {
      this.bound = bound;
    }
    if (!bound || bound.source === 'quest') {
      this.pauseLocal(true);
      this.stopClock();
      return;
    }
    if (want) {
      this.startLocal();
    } else {
      this.pauseLocal(true);
    }
  }

  private startLocal(): void {
    if (this.localStartedAt != null) {
      return;
    }
    this.localStartedAt = Date.now();
    this.startClock();
  }

  private pauseLocal(persist: boolean): void {
    const wasRunning = this.localStartedAt != null;
    if (wasRunning) {
      this.localBaseMs += Date.now() - this.localStartedAt!;
      this.localStartedAt = null;
      this.elapsedMs.set(this.localBaseMs);
    }
    this.stopClock();
    if (persist && wasRunning) {
      this.persist(this.localBaseMs);
    }
  }

  private startClock(): void {
    if (this.clockTimer == null) {
      this.clockTimer = setInterval(() => {
        if (this.localStartedAt != null) {
          this.elapsedMs.set(this.localBaseMs + (Date.now() - this.localStartedAt));
        }
      }, 250);
    }
    if (this.syncTimer == null) {
      this.syncTimer = setInterval(() => this.persistLive(), 15_000);
    }
  }

  private stopClock(): void {
    if (this.clockTimer != null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    if (this.syncTimer != null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private persistLive(): void {
    if (this.localStartedAt == null) {
      return;
    }
    this.persist(this.localBaseMs + (Date.now() - this.localStartedAt));
  }

  private persist(elapsedMs: number): void {
    const bound = this.bound;
    if (!bound || bound.source === 'quest') {
      return;
    }
    const ms = Math.max(0, Math.round(elapsedMs));
    const current = this.timer.boundDaily();
    if (
      current &&
      current.source === bound.source &&
      current.runId === bound.runId &&
      current.dailyTaskId === bound.dailyTaskId &&
      current.subtaskId === bound.subtaskId &&
      current.elapsedMs !== ms
    ) {
      this.timer.boundDaily.set({ ...current, elapsedMs: ms });
    }
    if (bound.source === 'daily' && bound.dailyTaskId) {
      this.dailies.patchElapsed(bound.dailyTaskId, ms).subscribe({
        error: () => {
          /* keep local clock */
        },
      });
      return;
    }
    if (bound.source === 'subtask' && bound.subtaskId && bound.runId) {
      this.quests.patchSubtaskElapsed(bound.runId, bound.subtaskId, ms).subscribe({
        error: () => {
          /* keep local clock */
        },
      });
    }
  }

  private bindPageLifecycle(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.pauseLocal(true);
      } else {
        this.reconcile(this.timer.boundDaily(), this.desiredRunning());
      }
    });
    window.addEventListener('pagehide', () => this.pauseLocal(true));
  }
}
