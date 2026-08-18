import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { HorologiumApiService } from './horologium-api.service';
import { HorologiumTimerService } from './horologium-timer.service';
import {
  formatElapsedMs,
  HorologiumWatchRecord,
} from './horologium.model';

const WATCH_ID_KEY = 'noescape.horologium.watchId';
const WIDGET_KEY = 'noescape.horologium.watchWidget';

function loadWatchId(): number | null {
  try {
    const raw = Number(sessionStorage.getItem(WATCH_ID_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

function saveWatchId(id: number | null): void {
  try {
    if (id == null) {
      sessionStorage.removeItem(WATCH_ID_KEY);
    } else {
      sessionStorage.setItem(WATCH_ID_KEY, String(id));
    }
  } catch {
    /* private mode */
  }
}

function loadWidgetVisible(): boolean {
  try {
    return localStorage.getItem(WIDGET_KEY) !== '0';
  } catch {
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class HorologiumWatchService {
  private readonly api = inject(HorologiumApiService);
  private readonly timer = inject(HorologiumTimerService);

  readonly watches = signal<HorologiumWatchRecord[]>([]);
  readonly selectedId = signal<number | null>(loadWatchId());
  readonly draftName = signal('');
  readonly clock = signal(Date.now());
  /** User pressed play on a watch while no Sessio is driving it. */
  readonly soloRunning = signal(false);
  /** Small project clock during a pomodoro. Default on. */
  readonly widgetVisible = signal(loadWidgetVisible());

  private localBaseMs = 0;
  private localStartedAt: number | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  readonly selected = computed(() => {
    const id = this.selectedId();
    if (id == null) {
      return null;
    }
    return this.watches().find((w) => w.id === id) ?? null;
  });

  readonly pomodoroLinked = computed(() => {
    const phase = this.timer.phase();
    return phase === 'work' || phase === 'rest';
  });

  readonly desiredRunning = computed(() => {
    if (this.selected() == null) {
      return false;
    }
    const phase = this.timer.phase();
    if (phase === 'work') {
      return this.timer.running();
    }
    if (phase === 'rest' || phase === 'complete') {
      return false;
    }
    return this.soloRunning();
  });

  readonly selectedElapsedMs = computed(() => {
    this.clock();
    return this.elapsedOf(this.selected());
  });

  readonly selectedElapsedLabel = computed(() =>
    formatElapsedMs(this.selectedElapsedMs()),
  );

  readonly linkedHint = computed(() => {
    if (!this.selected()) {
      return 'Optional. Bind a project to count work time.';
    }
    if (this.timer.phase() === 'rest') {
      return 'Rest pauses the project watch.';
    }
    if (this.pomodoroLinked() || this.timer.phase() === 'complete') {
      return 'Follows the Sessio — pause, rest, and end pause the watch.';
    }
    return 'Counts while this watch is running.';
  });

  constructor() {
    this.reload();
    this.bindPageLifecycle();

    effect(() => {
      const want = this.desiredRunning();
      const selected = this.selected();
      queueMicrotask(() => this.reconcile(want, selected));
    });
    effect(() => {
      this.timer.linkedWatchName.set(this.selected()?.name ?? null);
    });
  }

  elapsedLabel(watch: HorologiumWatchRecord): string {
    return formatElapsedMs(this.elapsedOf(watch));
  }

  elapsedOf(watch: HorologiumWatchRecord | null): number {
    this.clock();
    if (!watch) {
      return 0;
    }
    if (watch.id === this.selectedId() && this.localStartedAt != null) {
      return this.localBaseMs + (Date.now() - this.localStartedAt);
    }
    return watch.elapsedMs;
  }

  reload(): void {
    this.api.listWatches('ACTIVE').subscribe({
      next: (rows) => {
        const frozen = rows.map((row) =>
          row.running ? { ...row, running: false, lastStartedAt: null } : row,
        );
        this.watches.set(frozen);
        for (const row of rows) {
          if (row.running) {
            this.api
              .updateWatch(row.id, {
                elapsedMs: row.elapsedMs,
                running: false,
              })
              .subscribe();
          }
        }
        const id = this.selectedId();
        if (id != null && !frozen.some((w) => w.id === id)) {
          this.selectedId.set(null);
          saveWatchId(null);
        }
        this.hydrateLocal(this.selected());
      },
    });
  }

  create(): void {
    const name = this.draftName().trim();
    if (!name) {
      return;
    }
    this.api.createWatch(name).subscribe({
      next: (row) => {
        this.draftName.set('');
        this.watches.update((list) => [row, ...list]);
        this.select(row.id);
      },
    });
  }

  bindScriptorium(workId: number, name = ''): void {
    const existing = this.watches().find(
      (w) => w.scriptoriumWorkId === workId && w.status === 'ACTIVE',
    );
    if (existing) {
      this.select(existing.id);
      return;
    }
    this.api.createWatch(name, workId).subscribe({
      next: (row) => {
        this.watches.update((list) =>
          list.some((w) => w.id === row.id) ? list : [row, ...list],
        );
        this.select(row.id);
      },
    });
  }

  select(id: number | null): void {
    if (id === this.selectedId()) {
      return;
    }
    this.pauseLocal(true);
    this.soloRunning.set(false);
    this.selectedId.set(id);
    saveWatchId(id);
    this.hydrateLocal(this.selected());
  }

  startSolo(): void {
    if (this.pomodoroLinked() || !this.selected()) {
      return;
    }
    this.soloRunning.set(true);
  }

  pauseSolo(): void {
    this.soloRunning.set(false);
  }

  toggleSolo(): void {
    if (this.pomodoroLinked()) {
      return;
    }
    if (this.desiredRunning()) {
      this.pauseSolo();
    } else {
      this.startSolo();
    }
  }

  toggleWidget(): void {
    this.widgetVisible.update((visible) => {
      const next = !visible;
      try {
        localStorage.setItem(WIDGET_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  archive(id: number): void {
    if (id === this.selectedId()) {
      this.pauseLocal(true);
      this.soloRunning.set(false);
    }
    this.api.archiveWatch(id).subscribe({
      next: () => {
        this.watches.update((list) => list.filter((w) => w.id !== id));
        if (this.selectedId() === id) {
          this.selectedId.set(null);
          saveWatchId(null);
          this.hydrateLocal(null);
        }
      },
    });
  }

  private reconcile(
    want: boolean,
    selected: HorologiumWatchRecord | null,
  ): void {
    if (!selected) {
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

  private hydrateLocal(watch: HorologiumWatchRecord | null): void {
    this.localBaseMs = watch?.elapsedMs ?? 0;
    this.localStartedAt = null;
    this.clock.set(Date.now());
  }

  private startLocal(): void {
    if (this.localStartedAt != null || this.selectedId() == null) {
      return;
    }
    this.localStartedAt = Date.now();
    this.clock.set(this.localStartedAt);
    this.patchSelected({ running: true, elapsedMs: this.localBaseMs });
    this.startClock();
  }

  private pauseLocal(persist: boolean): void {
    const wasRunning = this.localStartedAt != null;
    if (wasRunning) {
      this.localBaseMs += Date.now() - this.localStartedAt!;
      this.localStartedAt = null;
      this.clock.set(Date.now());
    }
    this.stopClock();
    if (persist && wasRunning && this.selectedId() != null) {
      this.patchSelected({ running: false, elapsedMs: this.localBaseMs });
    }
  }

  private patchSelected(payload: { elapsedMs: number; running: boolean }): void {
    const id = this.selectedId();
    if (id == null) {
      return;
    }
    this.api.updateWatch(id, payload).subscribe({
      next: (row) => {
        this.watches.update((list) =>
          list.map((w) =>
            w.id === row.id
              ? {
                  ...row,
                  elapsedMs: payload.elapsedMs,
                  running: payload.running,
                }
              : w,
          ),
        );
      },
    });
  }

  private startClock(): void {
    if (this.clockTimer == null) {
      this.clockTimer = setInterval(() => this.clock.set(Date.now()), 250);
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
    if (this.localStartedAt == null || this.selectedId() == null) {
      return;
    }
    const elapsed = this.localBaseMs + (Date.now() - this.localStartedAt);
    this.patchSelected({ elapsedMs: elapsed, running: true });
  }

  private bindPageLifecycle(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.pauseLocal(true);
      } else {
        this.reconcile(this.desiredRunning(), this.selected());
      }
    });
    window.addEventListener('pagehide', () => this.pauseLocal(true));
  }
}
