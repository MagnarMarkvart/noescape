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
  maxLength,
  min,
  required,
  submit,
} from '@angular/forms/signals';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import {
  DailyBoard,
  DailyTaskSlot,
  DailyTaskTemplate,
  DailyTier,
  SlotFormModel,
  TaskImportance,
} from './daily.model';
import { HabitsService, HabitView } from '../habits/habits.service';
import { TimedToast } from '../shared/timed-toast';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { CharacterService } from '../character/character.service';
import { formatElapsedShort } from '../shared/time';
import { DailiesService } from './dailies.service';

export const DURATION_PRESETS = Array.from({ length: 16 }, (_, i) => 15 * (i + 1));
export const EFFORT_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

@Component({
  selector: 'app-dailies-page',
  imports: [DecimalPipe, FormField, RouterLink],
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
  protected readonly effortLevels = EFFORT_LEVELS;

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

  protected readonly slotModel = signal<SlotFormModel>(this.blankModel());
  protected readonly slotForm = form(this.slotModel, (p) => {
    required(p.title, { message: 'Title is required' });
    maxLength(p.title, 120);
    min(p.skillId, 1, { message: 'Pick a skill' });
    min(p.effortLevel, 1);
    min(p.durationMinutes, 1);
    min(p.customDurationMinutes, 1);
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
      next: (rows) => this.habits.set(rows),
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

  protected shiftDate(delta: number): void {
    const next = new Date(`${this.selectedDate()}T12:00:00`);
    next.setDate(next.getDate() + delta);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    this.setDate(`${yyyy}-${mm}-${dd}`);
  }

  protected goToday(): void {
    this.setDate(this.todayIso());
  }

  protected goTomorrow(): void {
    this.setDate(this.offsetIso(1, this.todayIso()));
  }

  protected onDatePicked(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.setDate(value);
    }
  }

  protected startEdit(slot: DailyTaskSlot): void {
    if (slot.completed || !this.canMutate()) {
      return;
    }
    this.setupOpen.set(true);
    this.setupPinned = true;
    const custom = !DURATION_PRESETS.includes(slot.durationMinutes);
    this.slotModel.set({
      title: slot.title,
      skillId: slot.skillId ?? 0,
      habitId: slot.habitId ?? 0,
      fixedXp: slot.fixedXp ?? null,
      effortLevel: slot.effortLevel,
      durationMinutes: custom ? 45 : slot.durationMinutes,
      customDuration: custom,
      customDurationMinutes: slot.durationMinutes || 45,
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
    const currentSkill = this.slotModel().skillId;
    const stillValid = this.subskills().some((s) => s.id === currentSkill);
    if (!stillValid) {
      this.slotForm.skillId().value.set(0);
    }
  }

  protected selectSkill(skillId: number): void {
    this.slotForm.skillId().value.set(skillId);
    this.slotModel.update((m) => ({ ...m, fixedXp: null }));
  }

  protected applyTemplate(templateId: number): void {
    const t = this.templates().find((row) => row.id === templateId);
    if (!t) {
      return;
    }
    this.slotModel.update((m) => ({
      ...m,
      title: t.name,
      skillId: t.skillId,
      fixedXp: t.fixedXp,
      effortLevel: t.effortLevel,
      durationMinutes: t.durationMinutes,
      customDuration: !DURATION_PRESETS.includes(t.durationMinutes),
      customDurationMinutes: t.durationMinutes,
    }));
    this.selectedCategory.set(t.skill.category);
  }

  protected selectEffort(level: number): void {
    this.slotForm.effortLevel().value.set(level);
  }

  protected selectDurationPreset(minutes: number): void {
    this.slotForm.customDuration().value.set(false);
    this.slotForm.durationMinutes().value.set(minutes);
    this.slotForm.customDurationMinutes().value.set(minutes);
  }

  protected enableCustomDuration(): void {
    this.slotForm.customDuration().value.set(true);
  }

  protected saveSlot(): void {
    const slot = this.editingSlot();
    if (!slot) {
      return;
    }

    void submit(this.slotForm, async () => {
      const model = this.slotModel();
      const duration = model.customDuration
        ? model.customDurationMinutes
        : model.durationMinutes;

      if (!model.title.trim() || model.skillId < 1) {
        this.timed.set('Title and skill are required.');
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
          habitId: model.habitId > 0 ? model.habitId : null,
          fixedXp: model.fixedXp,
          effortLevel: model.effortLevel,
          durationMinutes: duration,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.cancelEdit();
            this.setupPinned = false;
            this.timed.set('Task saved.');
            this.loadBoard(this.selectedDate(), false);
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
        this.xpFeedback.publishAward(result.award);
        this.loadBoard(this.selectedDate(), false, true);
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
        if (result.reversal) {
          this.skillsService.invalidateTree();
          this.xpFeedback.publishReversal(result.reversal);
        }
        this.loadBoard(this.selectedDate(), false, true);
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
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
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

  protected onTemplateSelect(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    if (!raw) {
      return;
    }
    this.applyTemplate(Number(raw));
    (event.target as HTMLSelectElement).value = '';
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
    if (habit.skillId) {
      this.slotForm.skillId().value.set(habit.skillId);
      const cat = this.skillTree()?.categories.find((c) =>
        c.skills.some((s) => s.id === habit.skillId),
      );
      if (cat) {
        this.selectedCategory.set(cat.category);
      }
    }
  }

  private blankModel(): SlotFormModel {
    return {
      title: '',
      skillId: 0,
      habitId: 0,
      fixedXp: null,
      effortLevel: 5,
      durationMinutes: 45,
      customDuration: false,
      customDurationMinutes: 45,
    };
  }

  protected formatElapsed(ms: number | null | undefined): string {
    const n = ms ?? 0;
    return n > 0 ? formatElapsedShort(n) : '—';
  }

  private todayIso(): string {
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
