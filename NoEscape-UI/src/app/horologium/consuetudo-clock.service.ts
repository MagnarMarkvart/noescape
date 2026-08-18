import { computed, Injectable, signal } from '@angular/core';
import { formatClockMs } from '../consuetudo/consuetudo-xp';
import { RoutineCompletePayload, RoutineView } from '../consuetudo/routines.service';

@Injectable({ providedIn: 'root' })
export class ConsuetudoClockService {
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private stepStartedAt = 0;
  private pausedAccum = 0;
  private pauseStartedAt: number | null = null;

  readonly routine = signal<RoutineView | null>(null);
  readonly index = signal(0);
  readonly running = signal(false);
  readonly finished = signal(false);
  readonly awarding = signal(false);
  readonly now = signal(Date.now());
  readonly logs = signal<RoutineCompletePayload['steps']>([]);

  readonly currentStep = computed(() => {
    const routine = this.routine();
    if (!routine) {
      return null;
    }
    return routine.steps[this.index()] ?? null;
  });

  readonly plannedMs = computed(
    () => (this.currentStep()?.durationMinutes ?? 0) * 60_000,
  );

  readonly stepElapsedMs = computed(() => {
    if (!this.currentStep() || this.stepStartedAt === 0) {
      return 0;
    }
    const end = this.running()
      ? this.now()
      : (this.pauseStartedAt ?? this.now());
    return Math.max(0, end - this.stepStartedAt - this.pausedAccum);
  });

  readonly overtime = computed(() => {
    const planned = this.plannedMs();
    return (
      planned > 0 &&
      this.stepElapsedMs() > planned &&
      !this.finished() &&
      this.stepStartedAt > 0
    );
  });

  readonly remainingMs = computed(
    () => this.plannedMs() - this.stepElapsedMs(),
  );

  readonly displayLabel = computed(() => {
    if (this.finished()) {
      return '00:00';
    }
    const remaining = this.remainingMs();
    if (remaining < 0) {
      return `+${formatClockMs(-remaining)}`;
    }
    return formatClockMs(remaining);
  });

  readonly progressPercent = computed(() => {
    const planned = this.plannedMs();
    if (planned <= 0) {
      return 0;
    }
    if (this.overtime()) {
      return 100;
    }
    return Math.min(100, (this.stepElapsedMs() / planned) * 100);
  });

  readonly inProgress = computed(
    () =>
      this.routine() != null &&
      !this.finished() &&
      (this.running() || this.logs().length > 0 || this.stepStartedAt > 0),
  );

  readonly stepCount = computed(() => this.routine()?.steps.length ?? 0);

  readonly stepMeta = computed(() => {
    const total = this.stepCount();
    if (total === 0) {
      return '';
    }
    return `${this.index() + 1}/${total}`;
  });

  load(routine: RoutineView | null): void {
    if (this.inProgress()) {
      return;
    }
    this.clearTimers();
    this.routine.set(routine);
    this.index.set(0);
    this.running.set(false);
    this.finished.set(false);
    this.logs.set([]);
    this.stepStartedAt = 0;
    this.pausedAccum = 0;
    this.pauseStartedAt = null;
  }

  start(): void {
    const routine = this.routine();
    if (!routine?.steps.length || this.finished()) {
      return;
    }
    if (this.running()) {
      return;
    }
    if (this.stepStartedAt > 0 && this.pauseStartedAt != null) {
      this.resume();
      return;
    }
    this.beginStep();
  }

  pause(): void {
    if (!this.running()) {
      return;
    }
    this.pauseStartedAt = Date.now();
    this.running.set(false);
  }

  resume(): void {
    if (this.running() || this.finished() || this.stepStartedAt === 0) {
      return;
    }
    if (this.pauseStartedAt != null) {
      this.pausedAccum += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = null;
    }
    this.running.set(true);
    this.ensureTick();
  }

  completeCurrent(): void {
    this.commitCurrent('COMPLETED');
  }

  skipCurrent(): void {
    this.commitCurrent('SKIPPED');
  }

  reset(): void {
    this.clearTimers();
    this.index.set(0);
    this.running.set(false);
    this.finished.set(false);
    this.awarding.set(false);
    this.logs.set([]);
    this.stepStartedAt = 0;
    this.pausedAccum = 0;
    this.pauseStartedAt = null;
  }

  payload(): RoutineCompletePayload | null {
    const logs = this.logs();
    if (!logs.length) {
      return null;
    }
    return { steps: logs };
  }

  private beginStep(): void {
    this.stepStartedAt = Date.now();
    this.pausedAccum = 0;
    this.pauseStartedAt = null;
    this.running.set(true);
    this.ensureTick();
    this.now.set(Date.now());
  }

  private commitCurrent(outcome: 'COMPLETED' | 'SKIPPED'): void {
    const step = this.currentStep();
    if (!step || this.finished()) {
      return;
    }
    const elapsedMs = this.stepElapsedMs();
    const plannedSeconds = Math.max(0, Math.round(step.durationMinutes * 60));
    this.logs.update((rows) => [
      ...rows,
      {
        stepId: step.id > 0 ? step.id : null,
        title: step.title,
        icon: step.icon,
        plannedSeconds,
        elapsedMs,
        outcome,
      },
    ]);
    const next = this.index() + 1;
    const total = this.stepCount();
    if (next >= total) {
      this.running.set(false);
      this.finished.set(true);
      this.clearTimers();
      this.stepStartedAt = 0;
      return;
    }
    this.index.set(next);
    this.beginStep();
  }

  private ensureTick(): void {
    if (this.tickTimer != null) {
      return;
    }
    this.tickTimer = setInterval(() => this.now.set(Date.now()), 250);
  }

  private clearTimers(): void {
    if (this.tickTimer != null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
