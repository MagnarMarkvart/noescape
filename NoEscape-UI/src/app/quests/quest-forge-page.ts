import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, of } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { RuneCheck } from '../shared/rune-check';
import { SkillWeightList } from '../shared/skill-weight-list';
import { ForgeShell } from '../shared/ui/forge-shell';
import { DateField } from '../shared/ui/date-field';
import { NumberField } from '../shared/ui/number-field';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import { CharacterService } from '../character/character.service';
import { TimedToast } from '../shared/timed-toast';
import {
  addSkillWeight,
  boostsWealth,
  bumpSkillWeight,
  removeSkillWeight,
} from '../shared/skill-weights';
import { centsToInput, parseMoneyToCents } from '../shared/money';
import { DurationField } from '../shared/ui/duration-field';
import { ForgeLine } from '../shared/ui/forge-line';
import {
  DragGrip,
  DragItem,
  DragSortDrop,
  DropGroup,
  DropList,
  moveIndex,
} from '../shared/ui/drag-sort';
import { API_BASE_URL } from '../core/api.config';
import {
  QUEST_WEIGHT_TOTAL,
  QuestView,
  resolveQuestCoverUrl,
  splitQuestXp,
} from './quest.model';
import { QuestsService } from './quests.service';
import { ScriptoriumService } from '../scriptorium/scriptorium.service';
import { ScriptoriumWorkView, workLocked } from '../scriptorium/scriptorium.model';
import {
  HabitQuestRule,
  HabitsService,
  HabitView,
} from '../habits/habits.service';
import { QuestHabitBind } from './quest-habit-bind';

type JourneyBind = 'none' | 'daily' | 'habitus';

interface ForgeSubtask {
  id?: number;
  title: string;
  gatesJourney: boolean;
  deadline: string | null;
  estimateMinutes: number | null;
  habitId: number | null;
  habitRule: HabitQuestRule;
  habitRequiredCount: number;
  habitWindowDays: number;
}

@Component({
  selector: 'app-quest-forge-page',
  imports: [
    RouterLink,
    FormField,
    RuneCheck,
    SkillWeightList,
    ForgeShell,
    SkillTreePicker,
    NumberField,
    DateField,
    DurationField,
    QuestHabitBind,
    ForgeLine,
    DropGroup,
    DropList,
    DragItem,
    DragGrip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-forge-page.html',
  styleUrl: './quest-forge-page.css',
})
export class QuestForgePage implements OnInit {
  private readonly questsService = inject(QuestsService);
  private readonly scriptoriumApi = inject(ScriptoriumService);
  private readonly skillsService = inject(SkillsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();
  private readonly character = inject(CharacterService);
  private readonly habitsService = inject(HabitsService);

  protected readonly toast = this.timed.value;
  protected readonly saving = signal(false);
  protected readonly loading = signal(false);
  protected readonly editId = signal<number | null>(null);
  protected readonly scriptoriumWorkId = signal<number | null>(null);
  protected readonly habits = signal<HabitView[]>([]);
  protected readonly journeyBind = signal<JourneyBind>('none');
  protected readonly linkedHabitId = signal<number | null>(null);
  protected readonly habitRule = signal<HabitQuestRule>('COUNT');
  protected readonly habitRequiredCount = signal(1);
  protected readonly habitWindowDays = signal(7);
  protected readonly journeyDurationPresets = [30, 60, 120, 180, 240, 360, 480];
  protected readonly catalog = signal<QuestView[]>([]);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly coverPreview = signal<string | null>(null);
  protected readonly coverDataUrl = signal<string | null>(null);

  protected readonly subtasks = signal<ForgeSubtask[]>([]);
  protected readonly subtaskDraft = signal('');
  protected readonly gateDraft = signal(false);
  protected readonly subtaskDeadlineDraft = signal('');
  protected readonly subtaskEstimateDraft = signal<number | null>(null);
  protected readonly skillReqs = signal<Array<{ slug: string; level: number }>>(
    [],
  );
  protected readonly skillReqSlug = signal('');
  protected readonly skillReqLevel = signal(1);
  protected readonly questReqs = signal<string[]>([]);
  protected readonly skillWeights = signal<Array<{ slug: string; weight: number }>>(
    [],
  );
  protected readonly weightTotal = QUEST_WEIGHT_TOTAL;

  protected readonly createModel = signal({
    name: '',
    summary: '',
    rules: '',
    stakes: '',
    howToWin: '',
    destination: '',
    journeyLabel: '',
    journeyNote: '',
    commitmentLevel: 7,
    deadline: '',
    titleReward: '',
    totalXp: 0,
    wealthAmount: '',
    dailyWorkMinutes: null as number | null,
    dailyWorkTitle: '',
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
  });

  protected readonly isEdit = computed(() => this.editId() !== null);
  protected readonly fromCatalog = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('from') === 'catalog')),
    {
      initialValue: this.route.snapshot.queryParamMap.get('from') === 'catalog',
    },
  );
  protected readonly heading = computed(() =>
    this.isEdit() ? 'Amend quest' : 'Forge a quest',
  );
  protected readonly lede = computed(() =>
    this.isEdit()
      ? 'Changes apply even while the quest is in progress. Progress, timestamps, and missed days stay.'
      : 'Structure the path: prerequisites, a daily journey, subtasks, and a destination.',
  );
  protected readonly backHref = computed(() => {
    if (this.fromCatalog()) {
      return '/quests';
    }
    const id = this.editId();
    return id != null ? `/quests/${id}` : '/quests';
  });
  protected readonly backQuery = computed((): Record<string, string> =>
    this.fromCatalog() ? { edit: '1' } : {},
  );
  protected readonly categories = computed(
    () => this.skillTree()?.categories ?? [],
  );
  protected readonly skills = computed(() =>
    this.categories().flatMap((c) => c.skills),
  );
  protected readonly subskills = computed(() => {
    const category = this.selectedCategory();
    if (!category) {
      return [] as Skill[];
    }
    return this.categories().find((c) => c.category === category)?.skills ?? [];
  });
  protected readonly selectedSlugs = computed(() =>
    this.skillWeights().map((row) => row.slug),
  );
  protected readonly catalogChoices = computed(() => {
    const id = this.editId();
    return this.catalog().filter((q) => q.id !== id);
  });
  protected readonly weightSpent = computed(() =>
    this.skillWeights().reduce((sum, s) => sum + s.weight, 0),
  );
  protected readonly weightRemaining = computed(
    () => this.weightTotal - this.weightSpent(),
  );
  protected readonly xpShares = computed(() =>
    splitQuestXp(this.createModel().totalXp, this.skillWeights()),
  );
  protected readonly weightShares = computed(() =>
    this.xpShares().map((share) => {
      const skill = this.skills().find((s) => s.slug === share.slug);
      return {
        ...share,
        name: skill?.name ?? share.slug,
        icon: skill?.icon,
      };
    }),
  );
  protected readonly weightsValid = computed(() => {
    const rows = this.skillWeights();
    if (rows.length === 0) {
      return true;
    }
    return this.weightRemaining() === 0;
  });

  protected readonly showWealth = computed(() =>
    boostsWealth(this.skillWeights()) ||
    parseMoneyToCents(this.createModel().wealthAmount) > 0,
  );

  protected readonly currencyLabel = computed(() => this.character.currency());

  ngOnInit(): void {
    this.skillsService.getTree().subscribe({
      next: (tree) => this.skillTree.set(tree),
    });
    this.habitsService.list().subscribe({
      next: (rows) => {
        this.habits.set(rows);
        const id = this.editId();
        if (id) {
          this.syncLinkedHabit(id);
        }
      },
    });
    const rawId = this.route.snapshot.paramMap.get('id');
    const id = rawId ? Number(rawId) : NaN;
    if (Number.isFinite(id) && id > 0) {
      this.editId.set(id);
      this.loadQuest(id);
      return;
    }
    const scriptoriumRaw = this.route.snapshot.queryParamMap.get('scriptorium');
    const workId = scriptoriumRaw ? Number(scriptoriumRaw) : NaN;
    if (Number.isFinite(workId) && workId > 0) {
      this.scriptoriumWorkId.set(workId);
      this.loadScriptorium(workId);
    }
  }

  protected onCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.coverPreview.set(null);
      this.coverDataUrl.set(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.timed.set('Cover must be an image');
      input.value = '';
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      this.timed.set('Cover image is too large (max 4MB)');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      this.coverPreview.set(url);
      this.coverDataUrl.set(url);
    };
    reader.readAsDataURL(file);
  }

  protected clearCover(): void {
    this.coverPreview.set(null);
    this.coverDataUrl.set(null);
  }

  protected addSubtask(): void {
    const title = this.subtaskDraft().trim();
    if (!title) {
      return;
    }
    this.subtasks.update((rows) => [
      ...rows,
      {
        title,
        gatesJourney: this.gateDraft(),
        deadline: this.subtaskDeadlineDraft().trim() || null,
        estimateMinutes: this.subtaskEstimateDraft(),
        habitId: null,
        habitRule: 'COUNT',
        habitRequiredCount: 1,
        habitWindowDays: 7,
      },
    ]);
    this.subtaskDraft.set('');
    this.gateDraft.set(false);
    this.subtaskDeadlineDraft.set('');
    this.subtaskEstimateDraft.set(null);
  }

  protected onSubtaskDrop(event: DragSortDrop): void {
    this.subtasks.update((rows) =>
      moveIndex(rows, event.fromIndex, event.toIndex),
    );
  }

  protected removeSubtask(index: number): void {
    this.subtasks.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected setSubtaskDeadline(index: number, iso: string | null): void {
    const deadline = iso?.trim() || null;
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, deadline } : row)),
    );
  }

  protected setSubtaskDeadlineDraft(iso: string | null): void {
    this.subtaskDeadlineDraft.set(iso?.trim() || '');
  }

  protected setSubtaskEstimateDraft(minutes: number | null): void {
    this.subtaskEstimateDraft.set(
      minutes != null && minutes > 0 ? Math.round(minutes) : null,
    );
  }

  protected setSubtaskEstimate(index: number, minutes: number | null): void {
    const estimateMinutes =
      minutes != null && minutes > 0 ? Math.round(minutes) : null;
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, estimateMinutes } : row)),
    );
  }

  protected setSubtaskTitle(index: number, title: string): void {
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, title } : row)),
    );
  }

  protected setDailyWorkMinutes(minutes: number | null): void {
    this.createModel.update((m) => ({
      ...m,
      dailyWorkMinutes: minutes != null && minutes > 0 ? Math.round(minutes) : null,
    }));
  }

  protected setDailyWorkTitle(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.createModel.update((m) => ({ ...m, dailyWorkTitle: value }));
  }

  protected setDeadline(iso: string): void {
    this.createModel.update((m) => ({ ...m, deadline: iso }));
  }

  protected setSubtaskGate(index: number, gatesJourney: boolean): void {
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, gatesJourney } : row)),
    );
  }

  protected setGateDraft(checked: boolean): void {
    this.gateDraft.set(checked);
  }

  protected addSkillReq(): void {
    const slug = this.skillReqSlug();
    const level = Math.min(99, Math.max(1, Number(this.skillReqLevel()) || 1));
    if (!slug) {
      return;
    }
    this.skillReqs.update((rows) => {
      const rest = rows.filter((r) => r.slug !== slug);
      return [...rest, { slug, level }];
    });
  }

  protected setSkillReqSlug(event: Event): void {
    this.skillReqSlug.set((event.target as HTMLSelectElement).value);
  }

  protected setSkillReqLevel(level: number): void {
    this.skillReqLevel.set(Math.min(99, Math.max(1, level)));
  }

  protected setSubtaskDraftText(value: string): void {
    this.subtaskDraft.set(value);
  }

  protected setTotalXp(n: number): void {
    this.createModel.update((m) => ({ ...m, totalXp: Math.max(0, Math.round(n) || 0) }));
  }

  protected setWealthAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.createModel.update((m) => ({ ...m, wealthAmount: value }));
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected pickSkill(skill: Skill): void {
    this.skillWeights.set(addSkillWeight(this.skillWeights(), skill.slug));
  }

  protected bumpWeight(event: { slug: string; delta: number }): void {
    this.skillWeights.set(
      bumpSkillWeight(this.skillWeights(), event.slug, event.delta),
    );
  }

  protected removeSkillShare(slug: string): void {
    this.skillWeights.set(removeSkillWeight(this.skillWeights(), slug));
  }

  protected setJourneyBind(bind: JourneyBind): void {
    this.journeyBind.set(bind);
    if (bind !== 'habitus') {
      this.linkedHabitId.set(null);
    }
  }

  protected setLinkedHabit(id: number | null): void {
    this.linkedHabitId.set(id);
    if (id) {
      this.journeyBind.set('habitus');
    }
  }

  protected setHabitRule(rule: HabitQuestRule): void {
    this.habitRule.set(rule);
  }

  protected setHabitRequiredCount(n: number): void {
    this.habitRequiredCount.set(Math.max(1, Math.round(n) || 1));
  }

  protected setHabitWindowDays(n: number): void {
    this.habitWindowDays.set(Math.max(1, Math.round(n) || 7));
  }

  protected setSubtaskHabit(index: number, id: number | null): void {
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, habitId: id } : row)),
    );
  }

  protected setSubtaskHabitRule(index: number, rule: HabitQuestRule): void {
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, habitRule: rule } : row)),
    );
  }

  protected setSubtaskHabitRequiredCount(index: number, n: number): void {
    const habitRequiredCount = Math.max(1, Math.round(n) || 1);
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, habitRequiredCount } : row)),
    );
  }

  protected setSubtaskHabitWindowDays(index: number, n: number): void {
    const habitWindowDays = Math.max(1, Math.round(n) || 7);
    this.subtasks.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, habitWindowDays } : row)),
    );
  }

  protected journeyTakenIds(): number[] {
    return this.subtasks()
      .map((s) => s.habitId)
      .filter((id): id is number => id != null);
  }

  protected subtaskTakenIds(index: number): number[] {
    const journeyId =
      this.journeyBind() === 'habitus' ? this.linkedHabitId() : null;
    return [
      ...(journeyId ? [journeyId] : []),
      ...this.subtasks()
        .filter((_, i) => i !== index)
        .map((s) => s.habitId)
        .filter((id): id is number => id != null),
    ];
  }

  private syncLinkedHabit(quest: QuestView | number | null): void {
    const questId = typeof quest === 'number' ? quest : quest?.id ?? null;
    if (!questId) {
      return;
    }
    const view = typeof quest === 'object' && quest ? quest : null;
    const journeyLink = view?.journeyHabitLink ?? null;
    const bySubtask = new Map(
      (view?.subtasks ?? [])
        .filter((s) => s.habitLink)
        .map((s) => [s.id, s.habitLink!]),
    );
    if (!view) {
      const found = this.habits().find((h) => h.questLink?.questId === questId);
      if (found?.questLink?.target === 'JOURNEY') {
        this.journeyBind.set('habitus');
        this.linkedHabitId.set(found.id);
        this.habitRule.set(found.questLink.rule);
        this.habitRequiredCount.set(found.questLink.requiredCount);
        this.habitWindowDays.set(found.questLink.windowDays ?? 7);
      }
      return;
    }
    if (journeyLink) {
      this.journeyBind.set('habitus');
      this.linkedHabitId.set(journeyLink.habitId);
      this.habitRule.set(journeyLink.rule);
      this.habitRequiredCount.set(journeyLink.requiredCount);
      this.habitWindowDays.set(journeyLink.windowDays ?? 7);
    } else if (view.dailyWorkTitle) {
      this.journeyBind.set('daily');
      this.linkedHabitId.set(null);
    } else {
      this.journeyBind.set('none');
      this.linkedHabitId.set(null);
    }
    if (bySubtask.size) {
      this.subtasks.update((rows) =>
        rows.map((row) => {
          const link = row.id ? bySubtask.get(row.id) : undefined;
          if (!link) {
            return row;
          }
          return {
            ...row,
            habitId: link.habitId,
            habitRule: link.rule,
            habitRequiredCount: link.requiredCount,
            habitWindowDays: link.windowDays ?? 7,
          };
        }),
      );
    }
  }

  private saveHabitLink(quest: QuestView, done: () => void): void {
    const desired: Array<{
      habitId: number;
      target: 'JOURNEY' | 'SUBTASK';
      subtaskId: number | null;
      rule: HabitQuestRule;
      requiredCount: number;
      windowDays: number | null;
    }> = [];
    const journeyHabitId =
      this.journeyBind() === 'habitus' ? this.linkedHabitId() : null;
    if (journeyHabitId) {
      desired.push({
        habitId: journeyHabitId,
        target: 'JOURNEY',
        subtaskId: null,
        rule: this.habitRule(),
        requiredCount: this.habitRequiredCount(),
        windowDays:
          this.habitRule() === 'WINDOW' ? this.habitWindowDays() : null,
      });
    }
    this.subtasks().forEach((row, index) => {
      if (!row.habitId) {
        return;
      }
      const subtaskId = row.id ?? quest.subtasks[index]?.id ?? null;
      if (!subtaskId) {
        return;
      }
      desired.push({
        habitId: row.habitId,
        target: 'SUBTASK',
        subtaskId,
        rule: row.habitRule,
        requiredCount: row.habitRequiredCount,
        windowDays: row.habitRule === 'WINDOW' ? row.habitWindowDays : null,
      });
    });
    const existing = this.habits().filter(
      (h) => h.questLink?.questId === quest.id,
    );
    const desiredIds = new Set(desired.map((d) => d.habitId));
    const ops = [
      ...existing
        .filter((h) => !desiredIds.has(h.id))
        .map((h) => this.habitsService.upsertQuestLink(h.id, null)),
      ...desired.map((d) =>
        this.habitsService.upsertQuestLink(d.habitId, {
          questId: quest.id,
          target: d.target,
          subtaskId: d.subtaskId,
          rule: d.rule,
          requiredCount: d.requiredCount,
          windowDays: d.windowDays,
        }),
      ),
    ];
    if (!ops.length) {
      done();
      return;
    }
    forkJoin(ops).subscribe({
      next: () => done(),
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.timed.set(err.error?.message ?? 'Quest saved, but habit link failed');
        void this.router.navigate(['/quests', quest.id]);
      },
    });
  }

  protected setCommitment(event: Event): void {
    const n = Number((event.target as HTMLInputElement).value) || 7;
    this.createModel.update((m) => ({
      ...m,
      commitmentLevel: Math.min(7, Math.max(1, n)),
    }));
  }

  protected removeSkillReq(slug: string): void {
    this.skillReqs.update((rows) => rows.filter((r) => r.slug !== slug));
  }

  protected skillName(slug: string): string {
    return this.skills().find((s) => s.slug === slug)?.name ?? slug;
  }

  protected setQuestReq(slug: string, on: boolean): void {
    this.questReqs.update((rows) => {
      if (on) {
        return rows.includes(slug) ? rows : [...rows, slug];
      }
      return rows.filter((s) => s !== slug);
    });
  }

  protected commitmentLabel(n: number): string {
    if (n >= 7) {
      return 'Every day';
    }
    if (n <= 1) {
      return 'Once a week';
    }
    return `${n}× per week`;
  }

  protected saveQuest(): void {
    void submit(this.createForm, async () => {
      const m = this.createModel();
      if (!this.weightsValid()) {
        this.timed.set(
          `Distribute all ${this.weightTotal} weight points across the chosen skills`,
        );
        return;
      }
      if (this.journeyBind() === 'habitus' && !this.linkedHabitId()) {
        this.timed.set('Pick a habit for the Habitus bind, or choose None / Daily');
        return;
      }
      this.saving.set(true);
      const payload = {
        name: m.name.trim(),
        summary: m.summary.trim() || undefined,
        rules: m.rules.trim() || undefined,
        stakes: m.stakes.trim() || undefined,
        howToWin: m.howToWin.trim() || undefined,
        destination: m.destination.trim() || undefined,
        journeyLabel: m.journeyLabel.trim() || undefined,
        journeyNote: m.journeyNote.trim() || undefined,
        commitmentLevel: Number(m.commitmentLevel) || 7,
        deadline: m.deadline.trim() || null,
        coverDataUrl: this.coverDataUrl() ?? undefined,
        skillReqs: this.skillReqs(),
        questReqs: this.questReqs(),
        subtasks: this.subtasks().map((s) => ({
          id: s.id,
          title: s.title,
          gatesJourney: s.gatesJourney,
          deadline: s.deadline,
          estimateMinutes: s.estimateMinutes,
        })),
        rewards: m.titleReward.trim()
          ? { title: m.titleReward.trim() }
          : undefined,
        totalXp: Math.max(0, Math.round(Number(m.totalXp) || 0)),
        skillWeights: this.skillWeights(),
        wealthCents: boostsWealth(this.skillWeights())
          ? parseMoneyToCents(m.wealthAmount)
          : 0,
        scriptoriumWorkId: this.scriptoriumWorkId() ?? undefined,
        dailyWorkMinutes: m.dailyWorkMinutes,
        dailyWorkTitle:
          this.journeyBind() === 'daily'
            ? m.dailyWorkTitle.trim() || m.journeyLabel.trim() || m.name
            : null,
      };
      const id = this.editId();
      const req =
        id !== null
          ? this.questsService.update(id, payload)
          : this.questsService.create(payload);
      req.subscribe({
        next: (q) => {
          this.saveHabitLink(q, () => {
            this.saving.set(false);
            void this.router.navigate(['/quests', q.id]);
          });
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.timed.set(err.error?.message ?? 'Save failed');
        },
      });
    });
  }

  private loadQuest(id: number): void {
    this.loading.set(true);
    this.questsService.getOne(id).subscribe({
      next: (q) => {
        this.applyQuest(q);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load quest for editing');
      },
    });
  }

  private applyQuest(q: QuestView): void {
    this.createModel.set({
      name: q.name,
      summary: q.summary ?? '',
      rules: q.rules ?? '',
      stakes: q.stakes ?? '',
      howToWin: q.howToWin ?? '',
      destination: q.destination ?? '',
      journeyLabel: q.journeyLabel ?? '',
      journeyNote: q.journeyNote ?? '',
      commitmentLevel: q.commitmentLevel || 7,
      deadline: q.deadline ?? '',
      titleReward: q.rewards?.title ?? '',
      totalXp: q.totalXp || 0,
      wealthAmount: centsToInput(q.wealthCents),
      dailyWorkMinutes: q.dailyWorkMinutes ?? null,
      dailyWorkTitle: q.dailyWorkTitle ?? '',
    });
    this.subtasks.set(
      q.subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        gatesJourney: Boolean(s.gatesJourney),
        deadline: s.deadline ?? null,
        estimateMinutes: s.estimateMinutes ?? null,
        habitId: s.habitLink?.habitId ?? null,
        habitRule: s.habitLink?.rule ?? 'COUNT',
        habitRequiredCount: s.habitLink?.requiredCount ?? 1,
        habitWindowDays: s.habitLink?.windowDays ?? 7,
      })),
    );
    this.skillReqs.set(
      q.requirements
        .filter((r) => r.kind === 'skill' && r.slug)
        .map((r) => ({ slug: r.slug!, level: r.level ?? 1 })),
    );
    this.questReqs.set(
      q.requirements
        .filter((r) => r.kind === 'quest' && r.slug)
        .map((r) => r.slug!),
    );
    this.skillWeights.set(
      q.skillShares.map((s) => ({ slug: s.slug, weight: s.weight })),
    );
    const existing = resolveQuestCoverUrl(q.coverUrl, API_BASE_URL);
    this.coverPreview.set(existing);
    this.coverDataUrl.set(null);
    this.syncLinkedHabit(q);
  }

  private loadScriptorium(id: number): void {
    this.loading.set(true);
    this.scriptoriumApi.getOne(id).subscribe({
      next: (work) => {
        this.applyScriptorium(work);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load the Scriptorium work');
      },
    });
  }

  private applyScriptorium(work: ScriptoriumWorkView): void {
    if (workLocked(work) || work.status === 'ARCHIVED') {
      this.scriptoriumWorkId.set(null);
      this.timed.set('This folio is already assigned or shelved.');
      return;
    }
    this.createModel.update((m) => ({
      ...m,
      name: work.title,
      summary: work.notes.trim() || work.title,
      deadline: work.dueDate ?? '',
    }));
    this.subtasks.set(
      work.subtasks.map((s) => ({
        title: s.title,
        gatesJourney: false,
        deadline: null,
        estimateMinutes: null,
        habitId: null,
        habitRule: 'COUNT',
        habitRequiredCount: 1,
        habitWindowDays: 7,
      })),
    );
    this.skillWeights.set(work.skillWeights.map((w) => ({ ...w })));
  }
}
