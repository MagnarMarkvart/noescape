import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import {
  HabitRangeLog,
  HabitsService,
  HabitView,
} from './habits.service';

export type HabitusViewMode = 'day' | 'week' | 'month';

@Component({
  selector: 'app-habitus-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './habitus-page.html',
  styleUrl: './habitus-page.css',
})
export class HabitusPage implements OnInit {
  private readonly habitsService = inject(HabitsService);
  private readonly timed = new TimedToast();

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly selected = signal<HabitView | null>(null);
  protected readonly period = signal<HabitRangeLog | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly busyDate = signal<string | null>(null);
  protected readonly viewMode = signal<HabitusViewMode>('month');
  /** Focus day (YYYY-MM-DD); week/month derive from this. */
  protected readonly anchor = signal(this.isoToday());

  protected readonly todayIso = this.isoToday();

  protected readonly periodLabel = computed(() => {
    const mode = this.viewMode();
    const { from, to } = this.bounds();
    if (mode === 'day') {
      return this.formatDay(from);
    }
    if (mode === 'week') {
      return `${this.formatShort(from)} – ${this.formatShort(to)}`;
    }
    const [y, m] = from.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  protected readonly nowButtonLabel = computed(() => {
    switch (this.viewMode()) {
      case 'day':
        return 'Today';
      case 'week':
        return 'This week';
      default:
        return 'This month';
    }
  });

  ngOnInit(): void {
    this.reload();
  }

  protected select(h: HabitView): void {
    this.selected.set(h);
    this.loadPeriod(h.id);
  }

  protected setView(mode: HabitusViewMode): void {
    this.viewMode.set(mode);
    const sel = this.selected();
    if (sel) {
      this.loadPeriod(sel.id);
    }
  }

  protected shift(delta: number): void {
    const mode = this.viewMode();
    const a = this.anchor();
    if (mode === 'day') {
      this.anchor.set(this.offsetIso(a, delta));
    } else if (mode === 'week') {
      this.anchor.set(this.offsetIso(a, delta * 7));
    } else {
      const [y, m, d] = a.split('-').map(Number);
      const next = new Date(y, m - 1 + delta, Math.min(d, 28));
      this.anchor.set(this.toIso(next));
    }
    const sel = this.selected();
    if (sel) {
      this.loadPeriod(sel.id);
    }
  }

  protected jumpToNow(): void {
    this.anchor.set(this.isoToday());
    const sel = this.selected();
    if (sel) {
      this.loadPeriod(sel.id);
    }
  }

  protected canToggle(date: string): boolean {
    return date <= this.todayIso;
  }

  protected toggleDay(date: string, completed: boolean): void {
    const h = this.selected();
    if (!h || !this.canToggle(date) || this.busyDate()) {
      return;
    }
    this.busyDate.set(date);
    const req = completed
      ? this.habitsService.uncomplete(h.id, date)
      : this.habitsService.complete(h.id, date);
    req.subscribe({
      next: () => {
        this.busyDate.set(null);
        this.timed.set(
          completed ? `Cleared ${date}` : `Logged ${h.name} · ${date}`,
        );
        this.reload(h.id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyDate.set(null);
        this.timed.set(err.error?.message ?? 'Could not update day');
      },
    });
  }

  protected markToday(): void {
    const h = this.selected();
    if (!h || this.busyDate()) {
      return;
    }
    this.busyDate.set(this.todayIso);
    this.habitsService.complete(h.id, this.todayIso).subscribe({
      next: () => {
        this.busyDate.set(null);
        this.timed.set(`Logged ${h.name} · today`);
        this.reload(h.id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyDate.set(null);
        this.timed.set(err.error?.message ?? 'Could not log habit');
      },
    });
  }

  protected archiveSelected(): void {
    const h = this.selected();
    if (!h) {
      return;
    }
    if (
      !confirm(
        `Archive “${h.name}”? Progress stays in Progression; it leaves the active list.`,
      )
    ) {
      return;
    }
    this.habitsService.archive(h.id).subscribe({
      next: () => {
        this.timed.set(`Archived: ${h.name}`);
        this.selected.set(null);
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Archive failed');
      },
    });
  }

  protected deleteSelected(): void {
    const h = this.selected();
    if (!h) {
      return;
    }
    if (
      !confirm(
        `Delete “${h.name}” permanently? All logs for this habit will be erased.`,
      )
    ) {
      return;
    }
    this.habitsService.remove(h.id).subscribe({
      next: () => {
        this.timed.set(`Deleted: ${h.name}`);
        this.selected.set(null);
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Delete failed');
      },
    });
  }

  private reload(selectId?: number): void {
    this.habitsService.list().subscribe({
      next: (rows) => {
        this.habits.set(rows);
        this.error.set(null);
        const pick =
          rows.find((r) => r.id === selectId) ??
          (this.selected()
            ? (rows.find((r) => r.id === this.selected()!.id) ?? null)
            : null) ??
          rows[0] ??
          null;
        this.selected.set(pick);
        if (pick) {
          this.loadPeriod(pick.id);
        } else {
          this.period.set(null);
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(
          err.error?.message ??
            'Habitus locked — complete Custodia Mentis (or use dev mode).',
        );
      },
    });
  }

  private loadPeriod(habitId: number): void {
    const { from, to } = this.bounds();
    this.habitsService.range(habitId, from, to).subscribe({
      next: (p) => this.period.set(p),
    });
  }

  private bounds(): { from: string; to: string } {
    const mode = this.viewMode();
    const a = this.anchor();
    if (mode === 'day') {
      return { from: a, to: a };
    }
    if (mode === 'week') {
      const from = this.startOfWeek(a);
      return { from, to: this.offsetIso(from, 6) };
    }
    const [y, m] = a.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to };
  }

  private startOfWeek(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return this.toIso(d);
  }

  private offsetIso(iso: string, days: number): string {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return this.toIso(d);
  }

  private toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private isoToday(): string {
    return this.toIso(new Date());
  }

  private formatDay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private formatShort(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
}
