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
import { QuestsService } from '../quests/quests.service';
import { TimedToast } from '../shared/timed-toast';
import { FINANCE_SKILL_SLUG } from '../shared/skill-weights';
import { centsToInput, formatMoney, parseMoneyToCents } from '../shared/money';
import { SkillsService } from '../skills/skills.service';
import { Skill } from '../skills/skill.model';
import {
  monthGridLead,
  startOfWeekIso,
  weekdayNames,
} from '../shared/time';
import {
  HABITUS_DEMO_HABITS,
  HABITUS_UNLOCK_QUEST_SLUG,
  habitusDemoRange,
} from './habitus-demo';
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
  host: {
    '[class.demo]': 'demo()',
  },
})
export class HabitusPage implements OnInit {
  private readonly habitsService = inject(HabitsService);
  private readonly character = inject(CharacterService);
  private readonly quests = inject(QuestsService);
  private readonly skillsService = inject(SkillsService);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly demo = toSignal(
    this.route.data.pipe(map((d) => d['demo'] === true)),
    { initialValue: this.route.snapshot.data['demo'] === true },
  );
  protected readonly unlockQuestPath = signal('/quests');

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly selected = signal<HabitView | null>(null);
  protected readonly period = signal<HabitRangeLog | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly busyDate = signal<string | null>(null);
  protected readonly viewMode = signal<HabitusViewMode>('month');
  /** Focus day (YYYY-MM-DD); week/month derive from this. */
  protected readonly anchor = signal(this.isoToday());
  protected readonly skills = signal<Skill[]>([]);
  protected readonly skillDraft = signal(0);
  protected readonly wealthDraft = signal('');
  protected readonly savingReward = signal(false);

  protected readonly todayIso = computed(() => this.character.todayIso());

  protected readonly showWealthEdit = computed(() => {
    const skill = this.skills().find((s) => s.id === this.skillDraft());
    return skill?.slug === FINANCE_SKILL_SLUG || parseMoneyToCents(this.wealthDraft()) > 0;
  });

  protected readonly currencyLabel = computed(() => this.character.currency());

  protected readonly weekdays = computed(() =>
    weekdayNames(this.character.weekStartsOn()),
  );

  protected readonly monthLead = computed(() => {
    if (this.viewMode() !== 'month') {
      return 0;
    }
    const [y, m] = this.bounds().from.split('-').map(Number);
    return monthGridLead(y, m, this.character.weekStartsOn());
  });

  protected readonly leadPads = computed(() =>
    Array.from({ length: this.monthLead() }, (_, i) => i),
  );

  protected readonly periodLabel = computed(() => {
    const mode = this.viewMode();
    const { from, to } = this.bounds();
    if (mode === 'day') {
      return this.character.formatDate(from);
    }
    if (mode === 'week') {
      return `${this.character.formatDate(from)} – ${this.character.formatDate(to)}`;
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
    if (this.demo()) {
      this.quests.list('all').subscribe({
        next: (rows) => {
          const q = rows.find((r) => r.slug === HABITUS_UNLOCK_QUEST_SLUG);
          if (q) {
            this.unlockQuestPath.set(`/quests/${q.id}`);
          }
        },
      });
    }
    this.reload();
    this.skillsService.getAll().subscribe({
      next: (rows) => this.skills.set(rows),
    });
  }

  protected select(h: HabitView): void {
    this.selected.set(h);
    this.skillDraft.set(h.skillId ?? 0);
    this.wealthDraft.set(centsToInput(h.wealthCents));
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
    return date <= this.todayIso();
  }

  protected toggleDay(date: string, completed: boolean): void {
    const h = this.selected();
    if (!h || !this.canToggle(date) || this.busyDate()) {
      return;
    }
    if (this.demo()) {
      this.timed.set('Demo only — complete Custodia Mentis to keep logs.');
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
        void this.character.getProfile().subscribe();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyDate.set(null);
        this.timed.set(err.error?.message ?? 'Could not update day');
      },
    });
  }

  protected markToday(): void {
    if (this.demo()) {
      this.timed.set('Demo only — complete Custodia Mentis to keep logs.');
      return;
    }
    const h = this.selected();
    if (!h || this.busyDate()) {
      return;
    }
    this.busyDate.set(this.todayIso());
    this.habitsService.complete(h.id, this.todayIso()).subscribe({
      next: () => {
        this.busyDate.set(null);
        this.timed.set(`Logged ${h.name} · today`);
        this.reload(h.id);
        void this.character.getProfile().subscribe();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyDate.set(null);
        this.timed.set(err.error?.message ?? 'Could not log habit');
      },
    });
  }

  protected setSkillDraft(event: Event): void {
    this.skillDraft.set(Number((event.target as HTMLSelectElement).value) || 0);
  }

  protected setWealthDraft(event: Event): void {
    this.wealthDraft.set((event.target as HTMLInputElement).value);
  }

  protected formatHabitWealth(cents: number | null | undefined): string {
    const n = Math.round(Number(cents) || 0);
    return n > 0 ? formatMoney(n, this.character.currency()) : '';
  }

  protected saveReward(): void {
    const h = this.selected();
    if (!h || this.demo() || this.savingReward()) {
      return;
    }
    const skill = this.skills().find((s) => s.id === this.skillDraft());
    this.savingReward.set(true);
    this.habitsService
      .update(h.id, {
        skillId: this.skillDraft() > 0 ? this.skillDraft() : null,
        wealthCents:
          skill?.slug === FINANCE_SKILL_SLUG
            ? parseMoneyToCents(this.wealthDraft())
            : 0,
      })
      .subscribe({
        next: (updated) => {
          this.savingReward.set(false);
          this.habits.update((rows) =>
            rows.map((row) => (row.id === updated.id ? updated : row)),
          );
          this.selected.set(updated);
          this.skillDraft.set(updated.skillId ?? 0);
          this.wealthDraft.set(centsToInput(updated.wealthCents));
          this.timed.set('Reward saved');
        },
        error: (err: { error?: { message?: string } }) => {
          this.savingReward.set(false);
          this.timed.set(err.error?.message ?? 'Could not save reward');
        },
      });
  }

  protected archiveSelected(): void {
    if (this.demo()) {
      return;
    }
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
    if (this.demo()) {
      return;
    }
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
    if (this.demo()) {
      this.applyHabits(HABITUS_DEMO_HABITS, selectId);
      return;
    }
    this.habitsService.list().subscribe({
      next: (rows) => {
        this.applyHabits(rows, selectId);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(
          err.error?.message ??
            'Habitus locked — complete Custodia Mentis (or use dev mode).',
        );
      },
    });
  }

  private applyHabits(rows: HabitView[], selectId?: number): void {
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
      this.skillDraft.set(pick.skillId ?? 0);
      this.wealthDraft.set(centsToInput(pick.wealthCents));
      this.loadPeriod(pick.id);
    } else {
      this.period.set(null);
    }
  }

  private loadPeriod(habitId: number): void {
    const { from, to } = this.bounds();
    if (this.demo()) {
      this.period.set(habitusDemoRange(habitId, from, to));
      return;
    }
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
    return startOfWeekIso(iso, this.character.weekStartsOn());
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
    return this.character.todayIso();
  }
}
