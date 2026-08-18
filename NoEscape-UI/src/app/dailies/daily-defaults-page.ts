import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { form, FormField, min, required, submit } from '@angular/forms/signals';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { HabitsService, HabitView } from '../habits/habits.service';
import {
  DailyTaskTemplate,
  DURATION_PRESETS,
  EFFORT_LEVELS,
  dailySkillLine,
} from './daily.model';
import { DailiesService } from './dailies.service';
import { calculateDailyTaskXp } from './daily-xp';
import { splitQuestXp } from '../quests/quest.model';
import { SkillWeightList } from '../shared/skill-weight-list';
import {
  addSkillWeight,
  boostsWealth,
  bumpSkillWeight,
  primarySkillSlug,
  removeSkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { formatMoney, parseMoneyToCents } from '../shared/money';
import { CharacterService } from '../character/character.service';

@Component({
  selector: 'app-daily-defaults-page',
  imports: [RouterLink, FormField, DecimalPipe, SkillWeightList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-defaults-page.html',
  styleUrl: './daily-defaults-page.css',
})
export class DailyDefaultsPage implements OnInit {
  private readonly dailies = inject(DailiesService);
  private readonly skillsService = inject(SkillsService);
  private readonly habitsService = inject(HabitsService);
  private readonly character = inject(CharacterService);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly templates = signal<DailyTaskTemplate[]>([]);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly habits = signal<HabitView[]>([]);
  protected readonly creating = signal(false);
  protected readonly query = signal('');
  protected readonly effortLevels = EFFORT_LEVELS;
  protected readonly durationPresets = DURATION_PRESETS;

  protected readonly createModel = signal({
    name: '',
    skillId: 0,
    skillWeights: [] as Array<{ slug: string; weight: number }>,
    skillPick: 0,
    habitId: 0,
    effortLevel: 5,
    durationMinutes: 45,
    wealthAmount: '',
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
    min(p.skillId, 1);
    min(p.effortLevel, 1);
    min(p.durationMinutes, 1);
  });

  protected readonly allSkills = computed(() => {
    const tree = this.skillTree();
    if (!tree) {
      return [] as Skill[];
    }
    return tree.categories.flatMap((c) => c.skills);
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.templates();
    if (!q) {
      return rows;
    }
    return rows.filter((t) => {
      const hay = [
        t.name,
        t.skill.name,
        t.skill.category,
        t.habit?.name ?? '',
        ...(t.skillShares ?? []).map((s) => s.name),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  protected readonly previewXp = computed(() => {
    const m = this.createModel();
    return calculateDailyTaskXp({
      importance: 'REGULAR',
      effortLevel: m.effortLevel,
      durationMinutes: m.durationMinutes > 0 ? m.durationMinutes : 1,
    });
  });

  protected readonly weightShares = computed(() => {
    const weights = this.createModel().skillWeights;
    return splitQuestXp(this.previewXp(), weights).map((share) => ({
      ...share,
      name: this.allSkills().find((s) => s.slug === share.slug)?.name ?? share.slug,
    }));
  });

  protected readonly weightRemaining = computed(() =>
    skillWeightRemaining(this.createModel().skillWeights),
  );

  protected readonly weightsValid = computed(() =>
    skillWeightsValid(this.createModel().skillWeights),
  );

  protected readonly showWealth = computed(() =>
    boostsWealth(this.createModel().skillWeights) ||
    parseMoneyToCents(this.createModel().wealthAmount) > 0,
  );

  protected readonly currencyLabel = computed(() => this.character.currency());

  protected readonly availableSkills = computed(() => {
    const taken = new Set(this.createModel().skillWeights.map((s) => s.slug));
    return this.allSkills().filter((s) => !taken.has(s.slug));
  });

  ngOnInit(): void {
    this.reload();
    this.skillsService.getTree().subscribe({
      next: (t) => this.skillTree.set(t),
    });
    this.habitsService.list().subscribe({
      next: (rows) => this.habits.set(rows),
      error: () => this.habits.set([]),
    });
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onSkillSelect(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value) || 0;
    this.createModel.update((m) => ({ ...m, skillPick: id }));
  }

  protected addSkillShare(): void {
    const id = this.createModel().skillPick;
    const skill = this.allSkills().find((s) => s.id === id);
    if (!skill) {
      return;
    }
    const rows = addSkillWeight(this.createModel().skillWeights, skill.slug);
    const primary = this.allSkills().find(
      (s) => s.slug === primarySkillSlug(rows),
    );
    this.createModel.update((m) => ({
      ...m,
      skillWeights: rows,
      skillId: primary?.id ?? 0,
      skillPick: 0,
    }));
  }

  protected bumpSkillWeight(event: { slug: string; delta: number }): void {
    this.setWeights(
      bumpSkillWeight(this.createModel().skillWeights, event.slug, event.delta),
    );
  }

  protected removeSkillWeight(slug: string): void {
    this.setWeights(removeSkillWeight(this.createModel().skillWeights, slug));
  }

  protected skillLine(t: DailyTaskTemplate): string {
    return dailySkillLine(t);
  }

  protected onHabitSelect(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value) || 0;
    this.createModel.update((m) => ({ ...m, habitId: id }));
  }

  protected selectEffort(level: number): void {
    this.createForm.effortLevel().value.set(level);
  }

  protected selectDuration(minutes: number): void {
    this.createForm.durationMinutes().value.set(minutes);
  }

  protected formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  protected create(): void {
    if (!this.weightsValid()) {
      this.timed.set('Distribute all 10 skill-weight points first');
      return;
    }
    void submit(this.createForm, async () => {
      const m = this.createModel();
      const skill = this.allSkills().find((s) => s.id === Number(m.skillId));
      this.creating.set(true);
      this.dailies
        .createTemplate({
          name: m.name.trim(),
          icon: skill?.icon ?? '◆',
          skillId: Number(m.skillId),
          skillWeights: m.skillWeights,
          habitId: m.habitId > 0 ? m.habitId : null,
          effortLevel: Number(m.effortLevel),
          durationMinutes: Number(m.durationMinutes),
          wealthCents: boostsWealth(m.skillWeights)
            ? parseMoneyToCents(m.wealthAmount)
            : 0,
        })
        .subscribe({
          next: () => {
            this.creating.set(false);
            this.createModel.set({
              name: '',
              skillId: 0,
              skillWeights: [],
              skillPick: 0,
              habitId: 0,
              effortLevel: 5,
              durationMinutes: 45,
              wealthAmount: '',
            });
            this.timed.set('Default task saved');
            this.reload();
          },
          error: (err: { error?: { message?: string } }) => {
            this.creating.set(false);
            this.timed.set(err.error?.message ?? 'Create failed');
          },
        });
    });
  }

  protected remove(t: DailyTaskTemplate): void {
    if (!confirm(`Remove “${t.name}” from defaults?`)) {
      return;
    }
    this.dailies.removeTemplate(t.id).subscribe({
      next: () => {
        this.timed.set(`Removed: ${t.name}`);
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Remove failed');
      },
    });
  }

  protected formatWealth(cents: number | null | undefined): string {
    const n = Math.round(Number(cents) || 0);
    return n > 0 ? formatMoney(n, this.character.currency()) : '';
  }

  protected setWealthAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.createModel.update((m) => ({ ...m, wealthAmount: value }));
  }

  private setWeights(rows: Array<{ slug: string; weight: number }>): void {
    const primary = this.allSkills().find(
      (s) => s.slug === primarySkillSlug(rows),
    );
    this.createModel.update((m) => ({
      ...m,
      skillWeights: rows,
      skillId: primary?.id ?? 0,
    }));
  }

  private reload(): void {
    this.dailies.listTemplates().subscribe({
      next: (rows) => this.templates.set(rows),
    });
  }
}
