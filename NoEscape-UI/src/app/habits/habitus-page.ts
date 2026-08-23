import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CharacterService } from '../character/character.service';
import { TimedToast } from '../shared/timed-toast';
import {
  monthGridLead,
  monthRange,
  shiftIsoDays,
  shiftIsoMonths,
  startOfWeekIso,
  weekdayNames,
} from '../shared/time';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { HabitCard } from './habit-card';
import { HABITUS_DEMO_HABITS, habitusDemoStats } from './habitus-demo';
import {
  HabitStats,
  HabitStatsGrain,
  HabitsService,
  HabitView,
} from './habits.service';

type CatalogView = 'cards' | 'calendar';

@Component({
  selector: 'app-habitus-page',
  imports: [RouterLink, UiIconBtn, HabitCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './habitus-page.html',
  styleUrl: './habitus-page.css',
  host: {
    '[class.demo]': 'demo()',
  },
})
export class HabitusPage implements OnInit {
  private readonly habitsService = inject(HabitsService);
  private readonly character = inject(CharacterService);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly demo = toSignal(
    this.route.data.pipe(map((d) => d['demo'] === true)),
    { initialValue: this.route.snapshot.data['demo'] === true },
  );

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly busyId = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly view = signal<CatalogView>('cards');
  protected readonly grain = signal<HabitStatsGrain>('month');
  protected readonly anchor = signal(this.character.todayIso());
  protected readonly selectedIds = signal<number[]>([]);
  protected readonly stats = signal<HabitStats | null>(null);

  protected readonly todayIso = computed(() => this.character.todayIso());
  protected readonly weekdays = computed(() =>
    weekdayNames(this.character.weekStartsOn()),
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.habits();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      const hay = [row.name, row.questName ?? '', row.skill?.name ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  protected readonly calendarHabits = computed(() => {
    const ids = this.selectedIds();
    const rows = this.habits();
    if (!ids.length) {
      return rows;
    }
    return rows.filter((row) => ids.includes(row.id));
  });

  protected readonly periodLabel = computed(() => {
    const grain = this.grain();
    const stats = this.stats();
    if (grain === 'all') {
      return 'All time';
    }
    if (!stats) {
      return '';
    }
    if (grain === 'day') {
      return this.character.formatDate(stats.from);
    }
    if (grain === 'week') {
      return `${this.character.formatDate(stats.from)} – ${this.character.formatDate(stats.to)}`;
    }
    if (grain === 'year') {
      return stats.from.slice(0, 4);
    }
    const [y, m] = stats.from.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  protected readonly monthLead = computed(() => {
    if (this.grain() !== 'month' || !this.stats()) {
      return 0;
    }
    const [y, m] = this.stats()!.from.split('-').map(Number);
    return monthGridLead(y, m, this.character.weekStartsOn());
  });

  protected readonly leadPads = computed(() =>
    Array.from({ length: this.monthLead() }, (_, i) => i),
  );

  protected readonly sparkPoints = computed(() => {
    const series = this.stats()?.series ?? [];
    if (series.length < 2) {
      return '';
    }
    const max = Math.max(1, ...series.map((p) => p.value));
    return series
      .map((p, i) => {
        const x = (i / (series.length - 1)) * 100;
        const y = 36 - (p.value / max) * 32;
        return `${x},${y}`;
      })
      .join(' ');
  });

  ngOnInit(): void {
    this.reload();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setView(view: CatalogView): void {
    this.view.set(view);
    if (view === 'calendar') {
      this.loadStats();
    }
  }

  protected setGrain(grain: HabitStatsGrain): void {
    this.grain.set(grain);
    this.loadStats();
  }

  protected toggleHabitFilter(id: number): void {
    this.selectedIds.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
    this.loadStats();
  }

  protected selectAllHabits(): void {
    this.selectedIds.set([]);
    this.loadStats();
  }

  protected shift(delta: number): void {
    if (this.grain() === 'all') {
      return;
    }
    const grain = this.grain();
    const a = this.anchor();
    if (grain === 'day') {
      this.anchor.set(shiftIsoDays(a, delta));
    } else if (grain === 'week') {
      this.anchor.set(shiftIsoDays(a, delta * 7));
    } else if (grain === 'year') {
      this.anchor.set(shiftIsoDays(a, delta * 365));
    } else {
      this.anchor.set(shiftIsoMonths(a, delta));
    }
    this.loadStats();
  }

  protected jumpToNow(): void {
    this.anchor.set(this.character.todayIso());
    this.loadStats();
  }

  protected isSelected(id: number): boolean {
    const ids = this.selectedIds();
    return ids.length === 0 || ids.includes(id);
  }

  protected clickTally(habit: HabitView): void {
    if (this.demo() || this.busyId()) {
      if (this.demo()) {
        this.timed.set('Demo only — forge a real habit to keep tallies.');
      }
      return;
    }
    this.busyId.set(habit.id);
    this.habitsService.click(habit.id).subscribe({
      next: (next) => {
        this.patch(next);
        this.busyId.set(null);
        if (this.view() === 'calendar') {
          this.loadStats();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.timed.set(err.error?.message ?? 'Could not mark');
      },
    });
  }

  protected undoTally(habit: HabitView): void {
    if (this.demo() || this.busyId()) {
      return;
    }
    this.busyId.set(habit.id);
    this.habitsService.undo(habit.id).subscribe({
      next: (next) => {
        this.patch(next);
        this.busyId.set(null);
        if (this.view() === 'calendar') {
          this.loadStats();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.timed.set(err.error?.message ?? 'Nothing to undo');
      },
    });
  }

  protected completeCheck(habit: HabitView): void {
    if (this.demo()) {
      this.timed.set('Demo only — forge a real habit to keep logs.');
      return;
    }
    if (this.busyId()) {
      return;
    }
    this.busyId.set(habit.id);
    this.habitsService.complete(habit.id, this.todayIso()).subscribe({
      next: () => {
        this.busyId.set(null);
        this.timed.set(`Logged ${habit.name}`);
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.timed.set(err.error?.message ?? 'Could not log habit');
      },
    });
  }

  private patch(next: HabitView): void {
    this.habits.update((rows) =>
      rows.map((row) => (row.id === next.id ? next : row)),
    );
  }

  private reload(): void {
    if (this.demo()) {
      this.habits.set(HABITUS_DEMO_HABITS as HabitView[]);
      this.error.set(null);
      return;
    }
    this.habitsService.list().subscribe({
      next: (rows) => {
        this.habits.set(rows);
        this.error.set(null);
        if (this.view() === 'calendar') {
          this.loadStats();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Could not load Habitus.');
      },
    });
  }

  private loadStats(): void {
    const { from, to } = this.bounds();
    if (this.demo()) {
      this.stats.set(
        habitusDemoStats({
          from: this.grain() === 'all' ? undefined : from,
          to: this.grain() === 'all' ? undefined : to,
          grain: this.grain(),
          ids: this.selectedIds(),
          today: this.todayIso(),
        }),
      );
      return;
    }
    this.habitsService
      .stats({
        from: this.grain() === 'all' ? undefined : from,
        to: this.grain() === 'all' ? undefined : to,
        ids: this.selectedIds(),
        grain: this.grain(),
      })
      .subscribe({
        next: (rows) => this.stats.set(rows),
        error: (err: { error?: { message?: string } }) => {
          this.timed.set(err.error?.message ?? 'Could not load calendar');
        },
      });
  }

  private bounds(): { from: string; to: string } {
    const grain = this.grain();
    const a = this.anchor();
    if (grain === 'day') {
      return { from: a, to: a };
    }
    if (grain === 'week') {
      const from = startOfWeekIso(a, this.character.weekStartsOn());
      return { from, to: shiftIsoDays(from, 6) };
    }
    if (grain === 'year') {
      const y = a.slice(0, 4);
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    if (grain === 'all') {
      return { from: a, to: a };
    }
    return monthRange(a);
  }
}
