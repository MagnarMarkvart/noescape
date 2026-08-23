import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, min, required, submit } from '@angular/forms/signals';
import { DecimalPipe } from '@angular/common';
import { TimedToast } from '../shared/timed-toast';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { HabitsService, HabitView } from '../habits/habits.service';
import { DURATION_PRESETS } from './daily.model';
import { DailiesService } from './dailies.service';
import { calculateDailyTaskXp } from './daily-xp';
import { splitQuestXp } from '../quests/quest.model';
import { SkillWeightList } from '../shared/skill-weight-list';
import { DurationField } from '../shared/ui/duration-field';
import { EffortField } from '../shared/ui/effort-field';
import { ForgeShell } from '../shared/ui/forge-shell';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import {
  addSkillWeight,
  boostsWealth,
  bumpSkillWeight,
  primarySkillSlug,
  removeSkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { parseMoneyToCents } from '../shared/money';
import { CharacterService } from '../character/character.service';

@Component({
  selector: 'app-daily-default-forge-page',
  imports: [
    FormField,
    DecimalPipe,
    RouterLink,
    SkillWeightList,
    ForgeShell,
    SkillTreePicker,
    DurationField,
    EffortField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-default-forge-page.html',
  styleUrl: './daily-default-forge-page.css',
})
export class DailyDefaultForgePage implements OnInit {
  private readonly dailies = inject(DailiesService);
  private readonly skillsService = inject(SkillsService);
  private readonly habitsService = inject(HabitsService);
  private readonly character = inject(CharacterService);
  private readonly router = inject(Router);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly habits = signal<HabitView[]>([]);
  protected readonly creating = signal(false);
  protected readonly durationPresets = DURATION_PRESETS;

  protected readonly createModel = signal({
    name: '',
    skillId: 0,
    skillWeights: [] as Array<{ slug: string; weight: number }>,
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
  protected readonly categories = computed(
    () => this.skillTree()?.categories ?? [],
  );
  protected readonly subskills = computed(() => {
    const category = this.selectedCategory();
    if (!category) {
      return [] as Skill[];
    }
    return this.categories().find((c) => c.category === category)?.skills ?? [];
  });
  protected readonly selectedSlugs = computed(() =>
    this.createModel().skillWeights.map((row) => row.slug),
  );
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
    return splitQuestXp(this.previewXp(), weights).map((share) => {
      const skill = this.allSkills().find((s) => s.slug === share.slug);
      return {
        ...share,
        name: skill?.name ?? share.slug,
        icon: skill?.icon,
      };
    });
  });
  protected readonly weightRemaining = computed(() =>
    skillWeightRemaining(this.createModel().skillWeights),
  );
  protected readonly weightsValid = computed(() =>
    skillWeightsValid(this.createModel().skillWeights),
  );
  protected readonly showWealth = computed(
    () =>
      boostsWealth(this.createModel().skillWeights) ||
      parseMoneyToCents(this.createModel().wealthAmount) > 0,
  );
  protected readonly currencyLabel = computed(() => this.character.currency());

  ngOnInit(): void {
    this.skillsService.getTree().subscribe({
      next: (t) => this.skillTree.set(t),
    });
    this.habitsService.list().subscribe({
      next: (rows) =>
        this.habits.set(
          rows.filter((h) => h.allowInDailies !== false && h.kind !== 'tally'),
        ),
      error: () => this.habits.set([]),
    });
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected pickSkill(skill: Skill): void {
    this.setWeights(addSkillWeight(this.createModel().skillWeights, skill.slug));
  }

  protected bumpSkillWeight(event: { slug: string; delta: number }): void {
    this.setWeights(
      bumpSkillWeight(this.createModel().skillWeights, event.slug, event.delta),
    );
  }

  protected removeSkillWeight(slug: string): void {
    this.setWeights(removeSkillWeight(this.createModel().skillWeights, slug));
  }

  protected onHabitSelect(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value) || 0;
    const habit = this.habits().find((h) => h.id === id);
    this.createModel.update((m) => ({ ...m, habitId: id }));
    if (!habit) {
      return;
    }
    if (!this.createModel().name.trim()) {
      this.createForm.name().value.set(habit.name);
    }
    if (habit.skillWeights?.length) {
      this.setWeights(habit.skillWeights);
    }
    this.createForm.effortLevel().value.set(habit.effortLevel || 5);
    this.createForm.durationMinutes().value.set(
      Math.max(1, habit.durationMinutes || 45),
    );
    if (habit.wealthCents > 0) {
      this.createModel.update((m) => ({
        ...m,
        wealthAmount: (habit.wealthCents / 100).toFixed(2),
      }));
    }
  }

  protected selectEffort(level: number): void {
    this.createForm.effortLevel().value.set(level);
  }

  protected setDuration(minutes: number | null): void {
    this.createForm.durationMinutes().value.set(Math.max(1, minutes ?? 45));
  }

  protected setWealthAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.createModel.update((m) => ({ ...m, wealthAmount: value }));
  }

  protected create(): void {
    if (!this.weightsValid()) {
      this.timed.set('Assign all 10 skill points');
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
            void this.router.navigate(['/dailies/defaults']);
          },
          error: (err: { error?: { message?: string } }) => {
            this.creating.set(false);
            this.timed.set(err.error?.message ?? 'Create failed');
          },
        });
    });
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
}
