import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CharacterService } from '../character/character.service';
import { RuneCheck } from '../shared/rune-check';
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
import { LogActivityResponse, XpReversalResponse } from '../skills/skill.model';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { HabitCard } from './habit-card';
import { HABITUS_DEMO_HABITS, habitusDemoStats } from './habitus-demo';
import {
  HabitActionResult,
  HabitGroupView,
  HabitMonthLog,
  HabitStats,
  HabitStatsGrain,
  HabitsService,
  HabitView,
} from './habits.service';

type CatalogView = 'cards' | 'calendar';
type DueFilter = 'all' | 'today';

@Component({
  selector: 'app-habitus-page',
  imports: [RouterLink, UiIconBtn, HabitCard, RuneCheck],
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
  private readonly router = inject(Router);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly timed = new TimedToast();

  protected readonly demo = toSignal(
    this.route.data.pipe(map((d) => d['demo'] === true)),
    { initialValue: this.route.snapshot.data['demo'] === true },
  );

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly ledgerHabits = signal<HabitView[]>([]);
  protected readonly groups = signal<HabitGroupView[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly busyId = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly view = signal<CatalogView>('cards');
  protected readonly dueFilter = signal<DueFilter>('today');
  protected readonly showCompleted = signal(false);
  protected readonly skillFilter = signal<string | null>(null);
  protected readonly dragMode = signal(false);
  protected readonly grain = signal<HabitStatsGrain>('month');
  protected readonly anchor = signal(this.character.todayIso());
  protected readonly selectedIds = signal<number[]>([]);
  protected readonly stats = signal<HabitStats | null>(null);
  protected readonly selectedLedger = signal<HabitView | null>(null);
  protected readonly month = signal<HabitMonthLog | null>(null);
  protected readonly cursor = signal({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  protected readonly todayIso = computed(() => this.character.todayIso());
  protected readonly weekdays = computed(() =>
    weekdayNames(this.character.weekStartsOn()),
  );

  protected readonly skillChips = computed(() => {
    const seen = new Map<string, { slug: string; name: string; icon: string | null }>();
    for (const row of this.habits()) {
      if (row.skill?.slug) {
        seen.set(row.skill.slug, {
          slug: row.skill.slug,
          name: row.skill.name,
          icon: row.skill.icon,
        });
      }
      for (const w of row.skillWeights ?? []) {
        if (!seen.has(w.slug)) {
          seen.set(w.slug, { slug: w.slug, name: w.slug, icon: null });
        }
      }
    }
    return [...seen.values()];
  });

  protected readonly searched = computed(() => {
    const q = this.query().trim().toLowerCase();
    const skill = this.skillFilter();
    return this.habits().filter((row) => {
      if (skill) {
        const slugs = [
          row.skill?.slug,
          ...(row.skillWeights ?? []).map((w) => w.slug),
        ].filter(Boolean);
        if (!slugs.includes(skill)) {
          return false;
        }
      }
      if (!q) {
        return true;
      }
      const hay = [row.name, row.questName ?? '', row.skill?.name ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  protected readonly openCards = computed(() => {
    const rows = this.searched();
    if (this.dueFilter() === 'all') {
      return rows;
    }
    return rows.filter((row) =>
      row.kind === 'tally' ? true : row.dueToday && !row.successfulToday,
    );
  });

  protected readonly doneCards = computed(() => {
    if (this.dueFilter() !== 'today' || !this.showCompleted()) {
      return [] as HabitView[];
    }
    return this.searched().filter(
      (row) => row.kind === 'check' && row.successfulToday,
    );
  });

  protected readonly grouped = computed(() => {
    const rows = this.openCards();
    const groups = this.groups();
    return {
      groups: groups.map((g) => ({
        ...g,
        habits: rows.filter((h) => h.groupId === g.id),
      })),
      cloister: rows.filter((h) => !h.groupId),
    };
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

  protected readonly ledgerMonthLabel = computed(() => {
    const c = this.cursor();
    return new Date(c.year, c.month - 1, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  protected readonly ledgerMonthLead = computed(() => {
    const c = this.cursor();
    return monthGridLead(c.year, c.month, this.character.weekStartsOn());
  });

  protected readonly ledgerLeadPads = computed(() =>
    Array.from({ length: this.ledgerMonthLead() }, (_, i) => i),
  );

  protected readonly activeCount = computed(
    () => this.ledgerHabits().filter((h) => h.active).length,
  );
  protected readonly archivedCount = computed(
    () => this.ledgerHabits().filter((h) => h.archived).length,
  );

  ngOnInit(): void {
    const qView = this.route.snapshot.queryParamMap.get('view');
    const dataView = this.route.snapshot.data['view'] as string | undefined;
    if (qView === 'calendar' || dataView === 'calendar') {
      this.view.set('calendar');
    }
    this.reload();
  }

  protected formatDate(iso: string | null | undefined): string {
    return this.character.formatDate(iso);
  }

  protected dayTone(
    day: { marks?: Array<{ done: boolean }> },
  ): 'full' | 'mixed' | 'miss' | null {
    const marks = day.marks ?? [];
    if (!marks.length) {
      return null;
    }
    const done = marks.filter((m) => m.done).length;
    if (done === marks.length) {
      return 'full';
    }
    if (done === 0) {
      return 'miss';
    }
    return 'mixed';
  }

  protected dayIcons(day: {
    marks?: Array<{ id: number; icon: string | null; done: boolean }>;
  }): Array<{ id: number; icon: string | null }> {
    const tone = this.dayTone(day);
    if (tone === 'miss' || tone == null) {
      return [];
    }
    const marks = day.marks ?? [];
    const rows = tone === 'full' ? marks : marks.filter((m) => m.done);
    return rows.map((m) => ({ id: m.id, icon: m.icon }));
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected setView(view: CatalogView): void {
    this.view.set(view);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (view === 'calendar') {
      this.loadStats();
      this.loadLedger();
    }
  }

  protected setDueFilter(filter: DueFilter): void {
    this.dueFilter.set(filter);
    if (filter !== 'today') {
      this.showCompleted.set(false);
    }
  }

  protected setShowCompleted(on: boolean): void {
    this.showCompleted.set(on);
  }

  protected setSkillFilter(slug: string | null): void {
    this.skillFilter.set(this.skillFilter() === slug ? null : slug);
  }

  protected setDragMode(on: boolean): void {
    this.dragMode.set(on);
  }

  protected onDrop(groupId: number | null, event: DragEvent): void {
    event.preventDefault();
    if (!this.dragMode() || this.demo()) {
      return;
    }
    const raw = event.dataTransfer?.getData('text/plain') ?? '';
    const habitId = Number(raw);
    if (!Number.isFinite(habitId) || habitId < 1) {
      return;
    }
    const bucket =
      groupId == null
        ? this.grouped().cloister
        : (this.grouped().groups.find((g) => g.id === groupId)?.habits ?? []);
    this.habitsService.place(habitId, groupId, bucket.length).subscribe({
      next: (next) => this.patch(next),
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Could not move habit');
      },
    });
  }

  protected allowDrop(event: DragEvent): void {
    if (this.dragMode()) {
      event.preventDefault();
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

  protected plus(habit: HabitView): void {
    if (this.guardDemo(habit)) {
      return;
    }
    if (habit.kind === 'tally') {
      this.runAction(habit.id, this.habitsService.click(habit.id, habit.step));
      return;
    }
    this.runAction(
      habit.id,
      this.habitsService.complete(habit.id, this.todayIso()),
    );
  }

  protected minus(habit: HabitView): void {
    if (this.demo() || this.busyId()) {
      return;
    }
    if (habit.kind === 'tally') {
      this.runAction(habit.id, this.habitsService.click(habit.id, -habit.step));
      return;
    }
    this.runAction(
      habit.id,
      this.habitsService.uncomplete(habit.id, this.todayIso()),
    );
  }

  protected selectLedger(h: HabitView): void {
    this.selectedLedger.set(h);
    this.loadMonth(h.id);
  }

  protected shiftLedgerMonth(delta: number): void {
    const c = this.cursor();
    const d = new Date(c.year, c.month - 1 + delta, 1);
    this.cursor.set({ year: d.getFullYear(), month: d.getMonth() + 1 });
    const sel = this.selectedLedger();
    if (sel) {
      this.loadMonth(sel.id);
    }
  }

  protected unarchive(h: HabitView): void {
    if (this.demo()) {
      return;
    }
    this.habitsService.unarchive(h.id).subscribe({
      next: (updated) => {
        this.timed.set(`Restored: ${updated.name}`);
        this.reload();
        this.loadLedger(updated.id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Could not restore habit');
      },
    });
  }

  private guardDemo(habit: HabitView): boolean {
    if (this.demo()) {
      this.timed.set('Demo only — forge a real habit to keep logs.');
      return true;
    }
    return Boolean(this.busyId()) && this.busyId() !== habit.id
      ? true
      : Boolean(this.busyId());
  }

  private runAction(
    habitId: number,
    req: ReturnType<HabitsService['complete']>,
  ): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(habitId);
    req.subscribe({
      next: (result) => {
        this.busyId.set(null);
        this.applyAction(result);
        if (this.view() === 'calendar') {
          this.loadStats();
          const sel = this.selectedLedger();
          if (sel?.id === habitId) {
            this.loadMonth(habitId);
          }
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.timed.set(err.error?.message ?? 'Could not update habit');
      },
    });
  }

  private applyAction(result: HabitActionResult): void {
    if (result.habit) {
      this.patch(result.habit);
      this.ledgerHabits.update((rows) =>
        rows.map((row) => (row.id === result.habit!.id ? result.habit! : row)),
      );
      const sel = this.selectedLedger();
      if (sel && result.habit.id === sel.id) {
        this.selectedLedger.set(result.habit);
      }
    }
    this.publishAwards(result.awards);
  }

  private publishAwards(awards?: unknown[]): void {
    if (!awards?.length) {
      return;
    }
    for (const award of awards) {
      if (award && typeof award === 'object' && 'activity' in award) {
        this.xpFeedback.publishAward(award as LogActivityResponse);
      } else if (award && typeof award === 'object' && 'xpRemoved' in award) {
        this.xpFeedback.publishReversal(award as XpReversalResponse);
      }
    }
  }

  private patch(next: HabitView): void {
    this.habits.update((rows) =>
      rows.map((row) => (row.id === next.id ? next : row)),
    );
  }

  private reload(): void {
    if (this.demo()) {
      this.habits.set(HABITUS_DEMO_HABITS as HabitView[]);
      this.ledgerHabits.set(HABITUS_DEMO_HABITS as HabitView[]);
      this.groups.set([]);
      this.error.set(null);
      if (this.view() === 'calendar') {
        this.loadStats();
        this.loadLedger();
      }
      return;
    }
    this.habitsService.list().subscribe({
      next: (rows) => {
        this.habits.set(rows);
        this.error.set(null);
        if (this.view() === 'calendar') {
          this.loadStats();
          this.loadLedger();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Could not load Habitus.');
      },
    });
    this.habitsService.listGroups().subscribe({
      next: (rows) => this.groups.set(rows),
      error: () => this.groups.set([]),
    });
  }

  private loadLedger(selectId?: number): void {
    if (this.demo()) {
      const rows = HABITUS_DEMO_HABITS as HabitView[];
      this.ledgerHabits.set(rows);
      const pick =
        rows.find((r) => r.id === selectId) ??
        this.selectedLedger() ??
        rows[0] ??
        null;
      this.selectedLedger.set(pick);
      if (pick) {
        this.month.set(null);
      }
      return;
    }
    this.habitsService.progression().subscribe({
      next: (rows) => {
        this.ledgerHabits.set(rows);
        const pick =
          rows.find((r) => r.id === selectId) ??
          this.selectedLedger() ??
          rows[0] ??
          null;
        const resolved = pick
          ? (rows.find((r) => r.id === pick.id) ?? null)
          : null;
        this.selectedLedger.set(resolved);
        if (resolved) {
          this.loadMonth(resolved.id);
        } else {
          this.month.set(null);
        }
      },
    });
  }

  private loadMonth(habitId: number): void {
    if (this.demo()) {
      this.month.set(null);
      return;
    }
    const c = this.cursor();
    this.habitsService.month(habitId, c.year, c.month).subscribe({
      next: (m) => this.month.set(m),
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
