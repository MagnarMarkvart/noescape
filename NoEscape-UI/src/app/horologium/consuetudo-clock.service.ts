import { computed, inject, Injectable, NgZone, signal } from '@angular/core';
import { ClockApiService } from '../clocks/clock-api.service';
import { ClockEvent, ClockSnapshot, ClockStatus } from '../clocks/clock.model';
import { clockNow, clockSkewMs } from '../clocks/clock-now';
import { formatClockMs } from '../consuetudo/consuetudo-xp';
import { RoutineCompletePayload, RoutineView } from '../consuetudo/routines.service';
import { HorologiumNotesService } from './horologium-notes.service';

@Injectable({ providedIn: 'root' })
export class ConsuetudoClockService {
  private readonly clockApi = inject(ClockApiService);
  private readonly notesStore = inject(HorologiumNotesService);
  private readonly ngZone = inject(NgZone);
  private tickHandle: number | null = null;
  private readonly endAtMs = signal<number | null>(null);
  private readonly pausedRemaining = signal(0);

  readonly routine = signal<RoutineView | null>(null);
  readonly index = signal(0);
  readonly status = signal<ClockStatus>('idle');
  readonly running = signal(false);
  readonly finished = signal(false);
  readonly awarding = signal(false);
  readonly now = signal(Date.now());
  readonly logs = signal<RoutineCompletePayload['steps']>([]);
  readonly lastComplete = signal<unknown>(null);

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

  readonly remainingMs = computed(() => {
    this.now();
    clockSkewMs();
    if (this.finished() || this.status() === 'complete') {
      return 0;
    }
    const endAt = this.endAtMs();
    if (endAt != null && this.running()) {
      return endAt - clockNow();
    }
    return this.pausedRemaining();
  });

  readonly overtime = computed(() => {
    const remaining = this.remainingMs();
    return remaining < 0 && !this.finished() && this.plannedMs() > 0;
  });

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
    return Math.min(100, ((planned - Math.max(0, this.remainingMs())) / planned) * 100);
  });

  readonly inProgress = computed(
    () => this.status() === 'running' || this.status() === 'paused',
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
    this.routine.set(routine);
    this.index.set(0);
    this.status.set('idle');
    this.running.set(false);
    this.finished.set(false);
    this.logs.set([]);
    this.endAtMs.set(null);
    this.pausedRemaining.set(0);
    this.stopTicker();
  }

  start(): void {
    const routine = this.routine();
    if (!routine?.steps.length || this.finished() || this.running()) {
      return;
    }
    if (this.inProgress()) {
      this.clockApi.resume('consuetudo').subscribe({
        next: (event) => this.applyEvent(event),
      });
      return;
    }
    this.clockApi.startConsuetudo(routine.id).subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  pause(): void {
    if (!this.running()) {
      return;
    }
    const remaining = this.remainingMs();
    this.status.set('paused');
    this.running.set(false);
    this.pausedRemaining.set(remaining);
    this.endAtMs.set(null);
    this.stopTicker();
    this.now.set(clockNow());
    this.clockApi.pause('consuetudo').subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  resume(): void {
    if (this.running() || this.finished()) {
      return;
    }
    this.clockApi.resume('consuetudo').subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  completeCurrent(): void {
    this.clockApi.completeStep().subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  skipCurrent(): void {
    this.clockApi.skipStep().subscribe({
      next: (event) => this.applyEvent(event),
    });
  }

  reset(): void {
    if (this.inProgress() || this.finished()) {
      this.clockApi.stop('consuetudo').subscribe({
        next: (event) => this.applyEvent(event),
      });
      return;
    }
    this.resetLocal();
  }

  payload(): RoutineCompletePayload | null {
    const logs = this.logs();
    if (!logs.length) {
      return null;
    }
    return { steps: logs, notes: this.notesStore.text() };
  }

  applyEvent(event: ClockEvent): void {
    if (event.kind !== 'consuetudo') {
      return;
    }
    if (event.complete) {
      this.lastComplete.set(event.complete);
      this.awarding.set(false);
    }
    this.applySnapshot(event.snapshot);
  }

  applySnapshot(snapshot: ClockSnapshot | null): void {
    if (!snapshot || snapshot.kind !== 'consuetudo') {
      if (this.inProgress() || this.running() || this.finished()) {
        this.resetLocal();
      }
      return;
    }
    const payload = snapshot.consuetudo;
    if (payload) {
      const current = this.routine();
      this.routine.set({
        id: payload.routineId,
        name: payload.routineName,
        icon: payload.routineIcon,
        effortLevel: current?.effortLevel ?? 3,
        skillWeights: current?.skillWeights ?? [],
        sortOrder: current?.sortOrder ?? 0,
        active: true,
        createdAt: current?.createdAt ?? new Date().toISOString(),
        updatedAt: current?.updatedAt ?? new Date().toISOString(),
        steps: payload.steps,
        runs: current?.runs ?? [],
      });
      this.index.set(payload.index);
      this.logs.set(payload.logs);
    }
    this.finished.set(snapshot.status === 'complete' || snapshot.phase === 'complete');
    this.status.set(snapshot.status);
    this.running.set(snapshot.status === 'running');
    const incomingRemaining = snapshot.remainingMs;
    const keepOvertime =
      snapshot.status === 'paused' &&
      incomingRemaining >= 0 &&
      this.pausedRemaining() < 0;
    this.pausedRemaining.set(
      keepOvertime ? this.pausedRemaining() : incomingRemaining,
    );
    if (snapshot.status === 'running' && snapshot.endsAt) {
      this.endAtMs.set(Date.parse(snapshot.endsAt));
      this.startTicker();
    } else {
      this.endAtMs.set(null);
      this.stopTicker();
    }
    this.now.set(clockNow());
  }

  private resetLocal(): void {
    this.stopTicker();
    this.index.set(0);
    this.status.set('idle');
    this.running.set(false);
    this.finished.set(false);
    this.awarding.set(false);
    this.logs.set([]);
    this.endAtMs.set(null);
    this.pausedRemaining.set(0);
    this.now.set(clockNow());
  }

  private startTicker(): void {
    this.stopTicker();
    this.ngZone.runOutsideAngular(() => {
      const loop = () => {
        this.now.set(clockNow());
        if (this.running() && this.endAtMs() != null) {
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
}
