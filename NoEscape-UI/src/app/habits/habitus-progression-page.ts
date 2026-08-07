import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HabitMonthLog, HabitsService, HabitView } from './habits.service';

@Component({
  selector: 'app-habitus-progression-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './habitus-progression-page.html',
  styleUrl: './habitus-progression-page.css',
})
export class HabitusProgressionPage implements OnInit {
  private readonly habitsService = inject(HabitsService);

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly selected = signal<HabitView | null>(null);
  protected readonly month = signal<HabitMonthLog | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly cursor = signal({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  protected readonly monthLabel = computed(() => {
    const c = this.cursor();
    return new Date(c.year, c.month - 1, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  protected readonly activeCount = computed(
    () => this.habits().filter((h) => h.active).length,
  );
  protected readonly archivedCount = computed(
    () => this.habits().filter((h) => h.archived).length,
  );

  ngOnInit(): void {
    this.reload();
  }

  protected select(h: HabitView): void {
    this.selected.set(h);
    this.loadMonth(h.id);
  }

  protected shiftMonth(delta: number): void {
    const c = this.cursor();
    const d = new Date(c.year, c.month - 1 + delta, 1);
    this.cursor.set({ year: d.getFullYear(), month: d.getMonth() + 1 });
    const sel = this.selected();
    if (sel) {
      this.loadMonth(sel.id);
    }
  }

  protected unarchive(h: HabitView): void {
    this.habitsService.unarchive(h.id).subscribe({
      next: (updated) => {
        this.toast.set(`Restored: ${updated.name}`);
        this.reload(updated.id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.set(err.error?.message ?? 'Could not restore habit');
      },
    });
  }

  private reload(selectId?: number): void {
    this.habitsService.progression().subscribe({
      next: (rows) => {
        this.habits.set(rows);
        this.error.set(null);
        const pick =
          rows.find((r) => r.id === selectId) ??
          this.selected() ??
          rows[0] ??
          null;
        const resolved = pick
          ? (rows.find((r) => r.id === pick.id) ?? null)
          : null;
        this.selected.set(resolved);
        if (resolved) {
          this.loadMonth(resolved.id);
        } else {
          this.month.set(null);
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Could not load progression');
      },
    });
  }

  private loadMonth(habitId: number): void {
    const c = this.cursor();
    this.habitsService.month(habitId, c.year, c.month).subscribe({
      next: (m) => this.month.set(m),
    });
  }
}
