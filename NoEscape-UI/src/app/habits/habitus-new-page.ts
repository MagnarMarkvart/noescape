import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CharacterService } from '../character/character.service';
import { TimedToast } from '../shared/timed-toast';
import {
  addSkillWeight,
  bumpSkillWeight,
  boostsWealth,
  primarySkillSlug,
  removeSkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { parseMoneyToCents } from '../shared/money';
import { SkillsService } from '../skills/skills.service';
import { Skill, SkillTree } from '../skills/skill.model';
import { QuestsService } from '../quests/quests.service';
import { QuestView } from '../quests/quest.model';
import { ForgeShell } from '../shared/ui/forge-shell';
import { IconPicker } from '../shared/ui/icon-picker';
import { NumberField } from '../shared/ui/number-field';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import { SkillWeightList } from '../shared/skill-weight-list';
import { DurationField } from '../shared/ui/duration-field';
import { EffortField } from '../shared/ui/effort-field';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { DURATION_PRESETS } from '../dailies/daily.model';
import { splitQuestXp } from '../quests/quest.model';
import {
  TABULA_PERIOD_OPTIONS,
  TABULA_POLARITY_OPTIONS,
  TabulaPeriod,
  TabulaPolarity,
} from '../tabularium/tabularium.model';
import { DEFAULT_HABIT_ICON } from './habit-icons';
import {
  HabitKind,
  HabitGroupView,
  HabitQuestRule,
  HabitQuestTarget,
  HabitsService,
  HabitWriteBody,
} from './habits.service';

@Component({
  selector: 'app-habitus-new-page',
  imports: [
    RouterLink,
    ForgeShell,
    IconPicker,
    NumberField,
    SkillTreePicker,
    SkillWeightList,
    DurationField,
    EffortField,
    UiConfirm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './habitus-new-page.html',
  styleUrl: './habitus-new-page.css',
})
export class HabitusNewPage implements OnInit {
  private readonly habitsService = inject(HabitsService);
  private readonly skillsService = inject(SkillsService);
  private readonly questsService = inject(QuestsService);
  private readonly character = inject(CharacterService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly editId = signal<number | null>(null);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly groups = signal<HabitGroupView[]>([]);
  protected readonly newGroupName = signal('');
  protected readonly durationPresets = DURATION_PRESETS;
  protected readonly periods = TABULA_PERIOD_OPTIONS;
  protected readonly polarities = TABULA_POLARITY_OPTIONS;

  protected readonly draft = signal({
    name: '',
    icon: DEFAULT_HABIT_ICON,
    cadence: 'DAILY',
    everyNDays: 1,
    skillWeights: [] as Array<{ slug: string; weight: number }>,
    effortLevel: 5,
    durationMinutes: 30,
    allowInDailies: true,
    kind: 'check' as HabitKind,
    period: 'day' as TabulaPeriod,
    polarity: 'virtue' as TabulaPolarity,
    normMin: 0,
    normMax: 1,
    step: 1,
    questId: null as number | null,
    questTarget: 'JOURNEY' as HabitQuestTarget,
    questSubtaskId: null as number | null,
    questRule: 'COUNT' as HabitQuestRule,
    questRequiredCount: 1,
    questWindowDays: 7,
    wealthAmount: '',
    groupId: null as number | null,
  });

  protected readonly heading = computed(() =>
    this.editId() ? 'Amend habit' : 'Forge a habit',
  );
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
  protected readonly allSkills = computed(() =>
    this.categories().flatMap((c) => c.skills),
  );
  protected readonly selectedSlugs = computed(() =>
    this.draft().skillWeights.map((row) => row.slug),
  );
  protected readonly weightsValid = computed(
    () =>
      this.draft().skillWeights.length === 0 ||
      skillWeightsValid(this.draft().skillWeights),
  );
  protected readonly weightRemaining = computed(() =>
    skillWeightRemaining(this.draft().skillWeights),
  );
  protected readonly weightShares = computed(() =>
    splitQuestXp(0, this.draft().skillWeights).map((share) => {
      const skill = this.allSkills().find((s) => s.slug === share.slug);
      return {
        ...share,
        name: skill?.name ?? share.slug,
        icon: skill?.icon,
      };
    }),
  );
  protected readonly canSave = computed(() => {
    const d = this.draft();
    const nameOk = d.name.trim().length > 0;
    const weightsOk = this.weightsValid();
    const bandOk = d.normMax >= d.normMin;
    const subtaskOk =
      !d.questId ||
      d.questTarget !== 'SUBTASK' ||
      (d.questSubtaskId != null && d.questSubtaskId > 0);
    return nameOk && weightsOk && bandOk && subtaskOk;
  });
  protected readonly showWealth = computed(
    () =>
      boostsWealth(this.draft().skillWeights) ||
      parseMoneyToCents(this.draft().wealthAmount) > 0,
  );
  protected readonly currencyLabel = computed(() => this.character.currency());
  protected readonly selectedQuest = computed(() => {
    const id = this.draft().questId;
    if (!id) {
      return null;
    }
    return this.quests().find((q) => q.id === id) ?? null;
  });
  protected readonly questSubtasks = computed(
    () => this.selectedQuest()?.subtasks ?? [],
  );

  ngOnInit(): void {
    this.skillsService.getTree().subscribe({
      next: (tree) => this.skillTree.set(tree),
    });
    this.questsService.list('all').subscribe({
      next: (rows) => this.quests.set(rows),
    });
    this.habitsService.listGroups().subscribe({
      next: (rows) => this.groups.set(rows),
      error: () => this.groups.set([]),
    });
    const raw = this.route.snapshot.paramMap.get('id');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id < 1) {
      return;
    }
    this.editId.set(id);
    this.habitsService.getOne(id).subscribe({
      next: (row) => {
        this.draft.set({
          name: row.name,
          icon: row.icon || DEFAULT_HABIT_ICON,
          cadence: row.cadence === 'EVERY_N_DAYS' ? 'EVERY_N_DAYS' : 'DAILY',
          everyNDays: row.everyNDays,
          skillWeights: row.skillWeights ?? [],
          effortLevel: row.effortLevel || 5,
          durationMinutes: row.durationMinutes || 30,
          allowInDailies:
            row.kind === 'tally' ? false : row.allowInDailies !== false,
          kind: row.kind === 'tally' ? 'tally' : 'check',
          period: row.period || 'day',
          polarity: row.polarity || 'virtue',
          normMin: row.normMin,
          normMax: row.normMax,
          step: row.step,
          questId: row.questLink?.questId ?? row.questId,
          questTarget: row.questLink?.target === 'SUBTASK' ? 'SUBTASK' : 'JOURNEY',
          questSubtaskId: row.questLink?.subtaskId ?? null,
          questRule: row.questLink?.rule ?? 'COUNT',
          questRequiredCount: row.questLink?.requiredCount ?? 1,
          questWindowDays: row.questLink?.windowDays ?? 7,
          wealthAmount:
            row.wealthCents > 0 ? String(row.wealthCents / 100) : '',
          groupId: row.groupId,
        });
        const skill = this.allSkills().find((s) => s.id === row.skillId);
        if (skill) {
          const cat = this.categories().find((c) =>
            c.skills.some((x) => x.id === skill.id),
          );
          if (cat) {
            this.selectedCategory.set(cat.category);
          }
        }
      },
      error: () => this.timed.set('Habit not found'),
    });
  }

  protected pickIcon(icon: string): void {
    this.draft.update((d) => ({ ...d, icon }));
  }

  protected setName(value: string): void {
    this.draft.update((d) => ({ ...d, name: value }));
  }

  protected setGroupId(raw: string): void {
    const id = Number(raw);
    this.draft.update((d) => ({
      ...d,
      groupId: Number.isInteger(id) && id > 0 ? id : null,
    }));
  }

  protected onNewGroupName(event: Event): void {
    this.newGroupName.set((event.target as HTMLInputElement).value);
  }

  protected addGroup(): void {
    const name = this.newGroupName().trim();
    if (!name || this.saving()) {
      return;
    }
    this.habitsService.createGroup(name).subscribe({
      next: (group) => {
        this.groups.update((rows) => [...rows, group]);
        this.newGroupName.set('');
        this.draft.update((d) => ({ ...d, groupId: group.id }));
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Could not add group');
      },
    });
  }

  protected setCadence(cadence: string): void {
    this.draft.update((d) => ({ ...d, cadence }));
  }

  protected setEveryNDays(n: number): void {
    this.draft.update((d) => ({ ...d, everyNDays: n }));
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected pickSkill(skill: Skill): void {
    this.setWeights(addSkillWeight(this.draft().skillWeights, skill.slug));
  }

  protected bumpSkillWeight(event: { slug: string; delta: number }): void {
    this.setWeights(
      bumpSkillWeight(this.draft().skillWeights, event.slug, event.delta),
    );
  }

  protected removeSkillWeight(slug: string): void {
    this.setWeights(removeSkillWeight(this.draft().skillWeights, slug));
  }

  protected setEffort(level: number): void {
    this.draft.update((d) => ({ ...d, effortLevel: level }));
  }

  protected setDuration(minutes: number | null): void {
    this.draft.update((d) => ({ ...d, durationMinutes: Math.max(1, minutes ?? 30) }));
  }

  protected setAllowInDailies(allow: boolean): void {
    this.draft.update((d) => ({
      ...d,
      allowInDailies: d.kind === 'tally' ? false : allow,
    }));
  }

  protected setKind(kind: HabitKind): void {
    this.draft.update((d) => ({
      ...d,
      kind,
      allowInDailies: kind === 'tally' ? false : d.allowInDailies,
    }));
  }

  protected setPeriod(period: TabulaPeriod): void {
    this.draft.update((d) => ({ ...d, period }));
  }

  protected setPolarity(polarity: TabulaPolarity): void {
    this.draft.update((d) => ({ ...d, polarity }));
  }

  protected setNormMin(n: number): void {
    this.draft.update((d) => {
      const normMin = Math.max(0, n);
      return { ...d, normMin, normMax: Math.max(d.normMax, normMin) };
    });
  }

  protected setNormMax(n: number): void {
    this.draft.update((d) => {
      const normMax = Math.max(0, n);
      return { ...d, normMax, normMin: Math.min(d.normMin, normMax) };
    });
  }

  protected setStep(n: number): void {
    this.draft.update((d) => ({ ...d, step: Math.max(1, n) }));
  }

  protected setQuest(raw: string): void {
    const id = Number(raw);
    this.draft.update((d) => ({
      ...d,
      questId: Number.isFinite(id) && id > 0 ? id : null,
      questSubtaskId: null,
    }));
  }

  protected setQuestTarget(target: HabitQuestTarget): void {
    this.draft.update((d) => ({
      ...d,
      questTarget: target,
      questSubtaskId: target === 'JOURNEY' ? null : d.questSubtaskId,
    }));
  }

  protected setQuestSubtask(raw: string): void {
    const id = Number(raw);
    this.draft.update((d) => ({
      ...d,
      questSubtaskId: Number.isFinite(id) && id > 0 ? id : null,
    }));
  }

  protected setQuestRule(rule: HabitQuestRule): void {
    this.draft.update((d) => ({ ...d, questRule: rule }));
  }

  protected setQuestRequiredCount(n: number): void {
    this.draft.update((d) => ({
      ...d,
      questRequiredCount: Math.max(1, Math.round(n) || 1),
    }));
  }

  protected setQuestWindowDays(n: number): void {
    this.draft.update((d) => ({
      ...d,
      questWindowDays: Math.max(1, Math.round(n) || 7),
    }));
  }

  protected setWealthAmount(event: Event): void {
    const wealthAmount = (event.target as HTMLInputElement).value;
    this.draft.update((d) => ({ ...d, wealthAmount }));
  }

  protected save(): void {
    if (!this.canSave() || this.saving()) {
      return;
    }
    const body = this.payload();
    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.habitsService.update(id, body)
      : this.habitsService.create(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/habitus']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.timed.set(err.error?.message ?? 'Could not save');
      },
    });
  }

  protected remove(): void {
    const id = this.editId();
    if (!id || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.habitsService.remove(id).subscribe({
      next: () => {
        this.removing.set(false);
        void this.router.navigate(['/habitus']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.removing.set(false);
        this.confirmRemove.set(false);
        this.timed.set(err.error?.message ?? 'Could not remove');
      },
    });
  }

  private setWeights(rows: Array<{ slug: string; weight: number }>): void {
    this.draft.update((d) => ({ ...d, skillWeights: rows }));
  }

  private payload(): HabitWriteBody {
    const d = this.draft();
    const primary = this.allSkills().find(
      (s) => s.slug === primarySkillSlug(d.skillWeights),
    );
    return {
      name: d.name.trim(),
      icon: d.icon,
      skillId: primary?.id ?? null,
      cadence: d.cadence,
      everyNDays: d.everyNDays,
      skillWeights: d.skillWeights,
      effortLevel: d.effortLevel,
      durationMinutes: d.durationMinutes,
      allowInDailies: d.kind === 'tally' ? false : d.allowInDailies,
      kind: d.kind,
      period: d.period,
      polarity: d.polarity,
      normMin: d.normMin,
      normMax: d.normMax,
      step: d.step,
      questId: d.questId,
      questLink: d.questId
        ? {
            questId: d.questId,
            target: d.questTarget,
            subtaskId: d.questTarget === 'SUBTASK' ? d.questSubtaskId : null,
            rule: d.questRule,
            requiredCount: d.questRequiredCount,
            windowDays: d.questRule === 'WINDOW' ? d.questWindowDays : null,
          }
        : null,
      wealthCents: boostsWealth(d.skillWeights)
        ? parseMoneyToCents(d.wealthAmount)
        : 0,
      groupId: d.groupId,
    };
  }
}
