import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  form,
  FormField,
  max,
  maxLength,
  min,
  required,
  submit,
} from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import {
  DailyBoard,
  DailyTaskSlot,
  DailyTaskTemplate,
  DailyTier,
  DURATION_PRESETS,
  SlotFormModel,
  TaskImportance,
  dailySkillLine,
  dailySkillWeights,
  formatTaskDuration,
} from './daily.model';
import { HabitsService, HabitView } from '../habits/habits.service';
import { RuneCheck } from '../shared/rune-check';
import { DateNav } from '../shared/date-nav';
import { CalendarMarks } from '../shared/rune-calendar';
import { SkillWeightList } from '../shared/skill-weight-list';
import { DurationField } from '../shared/ui/duration-field';
import { EffortField } from '../shared/ui/effort-field';
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
import { centsToInput, formatMoney, parseMoneyToCents } from '../shared/money';
import { TimedToast } from '../shared/timed-toast';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { CharacterService } from '../character/character.service';
import { formatElapsedShort, monthRange } from '../shared/time';
import { DailiesService } from './dailies.service';
import { DefaultTaskPicker } from './default-task-picker';
import { calculateDailyTaskXp } from './daily-xp';
import { splitQuestXp } from '../quests/quest.model';

@Component({
  selector: 'app-dailies-page',
  imports: [
    DecimalPipe,
    FormField,
    RuneCheck,
    DateNav,
    SkillWeightList,
    SkillTreePicker,
    DurationField,
    EffortField,
    DefaultTaskPicker,
    UiIconBtn,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dailies-page.html',
  styleUrl: './dailies-page.css',
})
export class DailiesPage implements OnInit {
  private readonly dailiesService = inject(DailiesService);
  private readonly skillsService = inject(SkillsService);
  private readonly habitsService = inject(HabitsService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly character = inject(CharacterService);
  private readonly route = inject(ActivatedRoute);

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly templates = signal<DailyTaskTemplate[]>([]);
  private readonly timed = new TimedToast();

  protected readonly durationPresets = DURATION_PRESETS;

  protected readonly board = signal<DailyBoard | null>(null);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedDate = signal(this.todayIso());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly editingKey = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly completingId = signal<number | null>(null);
  protected readonly uncompletingId = signal<number | null>(null);
  protected readonly postponingId = signal<number | null>(null);
  protected readonly postponePickerOpen = signal(false);
  protected readonly postponeDate = signal(this.todayIso());
  protected readonly selectedCategory = signal<string>('');
  protected readonly editingSlot = signal<DailyTaskSlot | null>(null);
  protected readonly setupOpen = signal(true);
  /** Past days stay read-only until Edit is pressed. */
  protected readonly historyUnlocked = signal(false);
  /** When true, skip auto-hide after the base 1/3/5 board is filled. */
  private setupPinned = false;
  protected readonly calendarMarks = signal<CalendarMarks>({});

  protected readonly slotModel = signal<SlotFormModel>(this.blankModel());
  protected readonly slotForm = form(this.slotModel, (p) => {
    required(p.title, { message: 'Title is required' });
    maxLength(p.title, 120);
    min(p.skillId, 1, { message: 'Pick a skill' });
    min(p.effortLevel, 1);
    min(p.durationMinutes, 1);
    max(p.durationMinutes, 24 * 60);
  });

  protected readonly categories = computed(
    () => this.skillTree()?.categories ?? [],
  );
  protected readonly subskills = computed(() => {
    const category = this.selectedCategory();
    if (!category) {
      return [] as Skill[];
    }
    return (
      this.categories().find((c) => c.category === category)?.skills ?? []
    );
  });

  protected readonly isToday = computed(
    () => this.selectedDate() === this.todayIso(),
  );

  protected readonly isTomorrow = computed(
    () => this.selectedDate() === this.offsetIso(1, this.todayIso()),
  );

  protected readonly isPast = computed(
    () => this.selectedDate() < this.todayIso(),
  );

  protected readonly canMutate = computed(() => {
    const board = this.board();
    if (!board?.isEditable) {
      return false;
    }
    if (board.sealRequired) {
      return true;
    }
    return !this.isPast() || this.historyUnlocked();
  });

  protected readonly canPostponeEdit = computed(() => {
    const slot = this.editingSlot();
    return Boolean(slot?.id && slot.isFilled && !slot.completed);
  });

  protected readonly previewXp = computed(() => {
    const slot = this.editingSlot();
    const model = this.slotModel();
    if (!slot) {
      return 0;
    }
    const duration = model.durationMinutes;
    return calculateDailyTaskXp({
      importance: slot.importance,
      effortLevel: model.effortLevel,
      durationMinutes: duration > 0 ? duration : 1,
    });
  });

  protected readonly weightShares = computed(() => {
    const weights = this.slotModel().skillWeights;
    const xp = this.previewXp();
    return splitQuestXp(xp, weights).map((share) => ({
      ...share,
      name: this.skillName(share.slug),
      icon: this.findSkillBySlug(share.slug)?.icon,
    }));
  });

  protected readonly weightRemaining = computed(() =>
    skillWeightRemaining(this.slotModel().skillWeights),
  );

  protected readonly weightsValid = computed(() =>
    skillWeightsValid(this.slotModel().skillWeights),
  );

  protected readonly showWealth = computed(() =>
    boostsWealth(this.slotModel().skillWeights) ||
    parseMoneyToCents(this.slotModel().wealthAmount) > 0,
  );

  protected readonly currencyLabel = computed(() => this.character.currency());

  protected readonly allSkills = computed(() =>
    this.categories().flatMap((c) => c.skills),
  );
  protected readonly selectedSlugs = computed(() =>
    this.slotModel().skillWeights.map((row) => row.slug),
  );

  protected readonly filledSlots = computed(() => {
    const current = this.board();
    if (!current) {
      return [] as Array<{ tier: DailyTier; slot: DailyTaskSlot }>;
    }
    return current.tiers.flatMap((tier) =>
      tier.slots
        .filter((slot) => slot.isFilled)
        .map((slot) => ({ tier, slot })),
    );
  });

  ngOnInit(): void {
    const queryDate = this.route.snapshot.queryParamMap.get('date');
    if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      this.selectedDate.set(queryDate);
    }
    const cachedTree = this.skillsService.peekTree();
    if (cachedTree) {
      this.skillTree.set(cachedTree);
    }
    this.skillsService.getTree(!cachedTree).subscribe({
      next: (tree) => this.skillTree.set(tree),
      error: () => {
        if (!this.skillTree()) {
          this.error.set('Could not load skills.');
        }
      },
    });
    this.habitsService.list().subscribe({
      next: (rows) =>
        this.habits.set(rows.filter((h) => h.allowInDailies !== false)),
      error: () => this.habits.set([]),
    });
    this.dailiesService.listTemplates().subscribe({
      next: (rows) => this.templates.set(rows),
      error: () => this.templates.set([]),
    });

    const cachedBoard = this.dailiesService.peekBoard(this.selectedDate());
    if (cachedBoard) {
      this.applyBoard(cachedBoard);
      this.loading.set(false);
      this.loadBoard(this.selectedDate(), false, true);
      return;
    }
    this.loadBoard(this.selectedDate(), true, true);
  }

  protected slotKey(importance: TaskImportance, slotIndex: number): string {
    return `${importance}:${slotIndex}`;
  }

  protected isEditing(slot: DailyTaskSlot): boolean {
    return this.editingKey() === this.slotKey(slot.importance, slot.slotIndex);
  }

  protected toggleSetup(force?: boolean): void {
    if (!this.canMutate()) {
      return;
    }
    const next = force ?? !this.setupOpen();
    this.setupOpen.set(next);
    this.setupPinned = next;
    if (!next) {
      this.cancelEdit();
    }
  }

  protected onDateNav(iso: string): void {
    this.setDate(iso);
  }

  protected loadCalendar(range: { from: string; to: string }): void {
    this.dailiesService.calendar(range.from, range.to).subscribe({
      next: (rows) => {
        const marks: CalendarMarks = {};
        for (const row of rows) {
          marks[row.date] = { status: row.status };
        }
        this.calendarMarks.set(marks);
      },
    });
  }

  private refreshCalendar(): void {
    this.loadCalendar(monthRange(this.selectedDate()));
  }

  protected goToday(): void {
    this.setDate(this.todayIso());
  }

  protected startEdit(slot: DailyTaskSlot): void {
    if (slot.completed || !this.canMutate()) {
      return;
    }
    this.setupOpen.set(true);
    this.setupPinned = true;
    this.slotModel.set({
      title: slot.title,
      skillId: slot.skillId ?? 0,
      skillWeights: dailySkillWeights(slot),
      habitId: slot.habitId ?? 0,
      effortLevel: slot.effortLevel,
      durationMinutes: slot.durationMinutes || 45,
      saveAsDefault: false,
      loadedTemplateId: 0,
      wealthAmount: centsToInput(slot.wealthCents),
    });
    this.selectedCategory.set(slot.skill?.category ?? '');
    this.editingSlot.set(slot);
    this.editingKey.set(this.slotKey(slot.importance, slot.slotIndex));
    this.postponePickerOpen.set(false);
    this.postponeDate.set(this.offsetIso(1));
    this.timed.set(null);
  }

  protected cancelEdit(): void {
    this.editingKey.set(null);
    this.editingSlot.set(null);
    this.selectedCategory.set('');
    this.slotModel.set(this.blankModel());
    this.postponePickerOpen.set(false);
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected pickSkill(skill: Skill): void {
    this.setSkillWeights(addSkillWeight(this.slotModel().skillWeights, skill.slug));
  }

  protected bumpSkillWeight(event: { slug: string; delta: number }): void {
    this.setSkillWeights(
      bumpSkillWeight(this.slotModel().skillWeights, event.slug, event.delta),
    );
  }

  protected removeSkillWeight(slug: string): void {
    this.setSkillWeights(removeSkillWeight(this.slotModel().skillWeights, slug));
  }

  protected skillLine(input: {
    skillShares?: Array<{ name: string }> | null;
    skill?: { name: string } | null;
  } | null | undefined): string {
    return dailySkillLine(input);
  }

  protected applyTemplate(t: DailyTaskTemplate): void {
    const habitStillActive =
      t.habitId != null && this.habits().some((h) => h.id === t.habitId);
    this.slotModel.update((m) => ({
      ...m,
      title: t.name,
      skillId: t.skillId,
      skillWeights: dailySkillWeights(t),
      habitId: habitStillActive ? (t.habitId ?? 0) : 0,
      effortLevel: t.effortLevel,
      durationMinutes: t.durationMinutes,
      loadedTemplateId: t.id,
      wealthAmount: centsToInput(t.wealthCents),
    }));
    this.selectedCategory.set(t.skill.category);
  }

  protected selectEffort(level: number): void {
    this.slotForm.effortLevel().value.set(level);
  }

  protected setDuration(minutes: number | null): void {
    this.slotForm.durationMinutes().value.set(Math.max(1, minutes ?? 45));
  }

  protected saveSlot(): void {
    const slot = this.editingSlot();
    if (!slot) {
      return;
    }

    void submit(this.slotForm, async () => {
      const model = this.slotModel();
      const duration = model.durationMinutes;

      if (!model.title.trim() || !skillWeightsValid(model.skillWeights)) {
        this.timed.set('Title and a full 10-point skill split are required.');
        return;
      }

      this.saving.set(true);
      this.dailiesService
        .upsertSlot({
          date: slot.date,
          importance: slot.importance,
          slotIndex: slot.slotIndex,
          title: model.title.trim(),
          skillId: model.skillId,
          skillWeights: model.skillWeights,
          habitId: model.habitId > 0 ? model.habitId : null,
          effortLevel: model.effortLevel,
          durationMinutes: duration,
          wealthCents: boostsWealth(model.skillWeights)
            ? parseMoneyToCents(model.wealthAmount)
            : 0,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            if (model.saveAsDefault) {
              this.persistDefault(model, duration);
            } else {
              this.cancelEdit();
              this.timed.set('Task saved.');
              this.loadBoard(this.selectedDate(), false);
            }
          },
          error: (err: { error?: { message?: string | string[] } }) => {
            this.saving.set(false);
            this.timed.set(this.readError(err, 'Failed to save task'));
          },
        });
    });
  }

  protected clearSlot(slot: DailyTaskSlot): void {
    if (!slot.id || slot.completed || !this.canMutate()) {
      return;
    }
    this.dailiesService.clearSlot(slot.id).subscribe({
      next: () => {
        this.timed.set('Slot cleared.');
        if (this.isEditing(slot)) {
          this.cancelEdit();
        }
        this.loadBoard(this.selectedDate(), false);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.timed.set(this.readError(err, 'Failed to clear slot'));
      },
    });
  }

  protected completeSlot(slot: DailyTaskSlot): void {
    if (!slot.id || slot.completed || !this.canMutate()) {
      return;
    }
    this.completingId.set(slot.id);
    this.dailiesService.complete(slot.id).subscribe({
      next: (result) => {
        this.completingId.set(null);
        this.skillsService.invalidateTree();
        for (const award of result.awards ?? (result.award ? [result.award] : [])) {
          this.xpFeedback.publishAward(award);
        }
        this.loadBoard(this.selectedDate(), false, true);
        void this.character.getProfile().subscribe();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.completingId.set(null);
        this.timed.set(this.readError(err, 'Failed to complete task'));
      },
    });
  }

  protected uncompleteSlot(slot: DailyTaskSlot): void {
    if (!slot.id || !slot.completed || !this.canMutate()) {
      return;
    }
    this.uncompletingId.set(slot.id);
    this.dailiesService.uncomplete(slot.id).subscribe({
      next: (result) => {
        this.uncompletingId.set(null);
        const reversals =
          result.reversals ?? (result.reversal ? [result.reversal] : []);
        if (reversals.length) {
          this.skillsService.invalidateTree();
          for (const reversal of reversals) {
            this.xpFeedback.publishReversal(reversal);
          }
        }
        this.loadBoard(this.selectedDate(), false, true);
        void this.character.getProfile().subscribe();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.uncompletingId.set(null);
        this.timed.set(this.readError(err, 'Failed to undo completion'));
      },
    });
  }

  protected postponeTomorrow(): void {
    this.postponeTo(this.offsetIso(1));
  }

  protected openPostponePicker(): void {
    this.postponePickerOpen.set(true);
    this.postponeDate.set(this.offsetIso(1));
  }

  protected onPostponeDatePicked(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.postponeTo(value);
    }
  }

  private postponeTo(targetDate: string): void {
    const slot = this.editingSlot();
    if (!slot?.id || slot.completed || !this.canMutate()) {
      return;
    }
    this.postponingId.set(slot.id);
    this.dailiesService.postpone(slot.id, targetDate).subscribe({
      next: (result) => {
        this.postponingId.set(null);
        this.postponePickerOpen.set(false);
        this.cancelEdit();
        this.setupPinned = false;
        this.applyBoard(result.board);
        this.timed.set(`Moved to ${result.toDate}.`);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.postponingId.set(null);
        this.timed.set(this.readError(err, 'Postpone failed'));
      },
    });
  }

  protected unlockHistory(): void {
    this.historyUnlocked.set(true);
  }

  protected lockHistory(): void {
    this.historyUnlocked.set(false);
    this.setupOpen.set(false);
    this.setupPinned = false;
    this.cancelEdit();
  }

  protected addRegularSlot(): void {
    this.dailiesService.addRegularSlot(this.selectedDate()).subscribe({
      next: (board) => {
        this.board.set(board);
        this.setupOpen.set(true);
        this.setupPinned = true;
        this.timed.set('Regular slot added.');
        const empty = board.tiers
          .find((t) => t.importance === 'REGULAR')
          ?.slots.find((s) => s.isEmpty);
        if (empty) {
          this.startEdit(empty);
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.timed.set(this.readError(err, 'Could not add Regular slot'));
      },
    });
  }

  protected copyIncomplete(): void {
    this.dailiesService.copyIncomplete(this.selectedDate()).subscribe({
      next: (result) => {
        this.applyBoard(result.board);
        this.timed.set(
          `Copied ${result.copied} incomplete dailies from ${result.sourceDate}.`,
        );
        this.refreshCalendar();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.timed.set(this.readError(err, 'Copy failed'));
      },
    });
  }

  protected sealDay(): void {
    const sealing = this.selectedDate();
    const wasRequired = this.board()?.sealRequired ?? false;
    this.dailiesService.sealDay(sealing).subscribe({
      next: () => {
        this.timed.set(`Sealed ${sealing}.`);
        if (wasRequired) {
          this.goToday();
        } else {
          this.loadBoard(sealing, false);
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.timed.set(this.readError(err, 'Seal failed'));
      },
    });
  }

  protected formatDuration(minutes: number): string {
    return formatTaskDuration(minutes);
  }

  private setDate(date: string): void {
    this.cancelEdit();
    this.setupPinned = false;
    this.historyUnlocked.set(false);
    this.selectedDate.set(date);
    const cached = this.dailiesService.peekBoard(date);
    if (cached) {
      this.applyBoard(cached);
      this.loading.set(false);
      this.loadBoard(date, false, true);
      return;
    }
    this.loadBoard(date, true, true);
  }

  private loadBoard(
    date: string,
    showLoading = true,
    force = false,
  ): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.dailiesService.getBoard(date, force).subscribe({
      next: (board) => {
        this.applyBoard(board);
        this.loading.set(false);
        this.error.set(null);
        this.refreshCalendar();
      },
      error: () => {
        this.loading.set(false);
        if (!this.board()) {
          this.error.set(
            'Could not reach the Dailies server. Is the backend running?',
          );
        }
      },
    });
  }

  private applyBoard(raw: DailyBoard): void {
    const isEditable = raw.isEditable !== false;
    const board: DailyBoard = {
      ...raw,
      isEditable,
      readOnly: raw.readOnly ?? !isEditable,
    };
    this.board.set(board);
    this.selectedDate.set(board.date);

    if (!this.isTodaySelected(board.date)) {
      if (!this.historyUnlocked()) {
        this.setupOpen.set(false);
        this.setupPinned = false;
        this.cancelEdit();
      } else if (!this.setupPinned && !this.editingKey()) {
        this.setupOpen.set(false);
      }
      return;
    }

    if (!this.canMutate()) {
      this.setupOpen.set(false);
      this.setupPinned = false;
      this.cancelEdit();
      return;
    }

    if (board.filledCount === 0) {
      this.setupOpen.set(true);
      this.setupPinned = false;
      return;
    }
    // Any set tasks → Tasks view by default (unless pinned in Setup/edit).
    if (!this.setupPinned && !this.editingKey()) {
      this.setupOpen.set(false);
    }
  }

  private isTodaySelected(date: string): boolean {
    return date === this.todayIso();
  }

  protected onHabitSelect(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.applyHabit(Number(raw) || 0);
  }

  protected setSaveAsDefault(checked: boolean): void {
    this.slotModel.update((m) => ({ ...m, saveAsDefault: checked }));
  }

  protected setWealthAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.slotModel.update((m) => ({ ...m, wealthAmount: value }));
  }

  protected applyHabit(habitId: number): void {
    const habit = this.habits().find((h) => h.id === habitId);
    this.slotForm.habitId().value.set(habitId);
    if (!habit) {
      return;
    }
    if (!this.slotModel().title.trim()) {
      this.slotForm.title().value.set(habit.name);
    }
    if (habit.skillWeights?.length) {
      this.setSkillWeights(habit.skillWeights);
    } else if (habit.skillId) {
      const skill = this.findSkillById(habit.skillId);
      if (skill) {
        this.setSkillWeights(
          addSkillWeight(this.slotModel().skillWeights, skill.slug),
        );
      }
      const cat = this.skillTree()?.categories.find((c) =>
        c.skills.some((s) => s.id === habit.skillId),
      );
      if (cat) {
        this.selectedCategory.set(cat.category);
      }
    }
    if (habit.wealthCents > 0) {
      this.slotModel.update((m) => ({
        ...m,
        wealthAmount: centsToInput(habit.wealthCents),
      }));
    }
    this.slotForm.effortLevel().value.set(habit.effortLevel || 5);
    this.slotForm.durationMinutes().value.set(
      Math.max(1, habit.durationMinutes || 45),
    );
  }

  private persistDefault(model: SlotFormModel, duration: number): void {
    const primary =
      this.findSkillBySlug(primarySkillSlug(model.skillWeights)) ??
      this.findSkillById(model.skillId);
    const payload = {
      name: model.title.trim(),
      icon: primary?.icon ?? '◆',
      skillId: primary?.id ?? model.skillId,
      skillWeights: model.skillWeights,
      habitId: model.habitId > 0 ? model.habitId : null,
      effortLevel: model.effortLevel,
      durationMinutes: duration,
      wealthCents: boostsWealth(model.skillWeights)
        ? parseMoneyToCents(model.wealthAmount)
        : 0,
    };
    const req =
      model.loadedTemplateId > 0
        ? this.dailiesService.updateTemplate(model.loadedTemplateId, payload)
        : this.dailiesService.createTemplate(payload);
    req.subscribe({
      next: () => {
        this.reloadTemplates();
        this.cancelEdit();
        this.timed.set('Task saved and stored as a default.');
        this.loadBoard(this.selectedDate(), false);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.cancelEdit();
        this.loadBoard(this.selectedDate(), false);
        this.timed.set(
          `Task saved, but the default was not: ${this.readError(err, 'save failed')}`,
        );
      },
    });
  }

  private reloadTemplates(): void {
    this.dailiesService.listTemplates().subscribe({
      next: (rows) => this.templates.set(rows),
    });
  }

  private setSkillWeights(rows: Array<{ slug: string; weight: number }>): void {
    const primary = this.findSkillBySlug(primarySkillSlug(rows));
    this.slotModel.update((model) => ({
      ...model,
      skillWeights: rows,
      skillId: primary?.id ?? 0,
    }));
  }

  private findSkillById(id: number): Skill | undefined {
    return this.allSkills().find((skill) => skill.id === id);
  }

  private findSkillBySlug(slug: string | null): Skill | undefined {
    if (!slug) {
      return undefined;
    }
    return this.allSkills().find((skill) => skill.slug === slug);
  }

  private skillName(slug: string): string {
    return this.findSkillBySlug(slug)?.name ?? slug;
  }

  private blankModel(): SlotFormModel {
    return {
      title: '',
      skillId: 0,
      skillWeights: [],
      habitId: 0,
      effortLevel: 5,
      durationMinutes: 45,
      saveAsDefault: false,
      loadedTemplateId: 0,
      wealthAmount: '',
    };
  }

  protected formatWealth(cents: number | null | undefined): string {
    const n = Math.round(Number(cents) || 0);
    return n > 0 ? formatMoney(n, this.character.currency()) : '';
  }

  protected formatElapsed(ms: number | null | undefined): string {
    const n = ms ?? 0;
    return n > 0 ? formatElapsedShort(n) : '—';
  }

  protected todayIso(): string {
    return this.character.todayIso();
  }

  private offsetIso(days: number, from = this.selectedDate()): string {
    const next = new Date(`${from}T12:00:00`);
    next.setDate(next.getDate() + days);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private readError(
    err: { error?: { message?: string | string[] } },
    fallback: string,
  ): string {
    const message = err.error?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    return message ?? fallback;
  }
}
