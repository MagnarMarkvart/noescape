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
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import {
  DailyBoard,
  DailyTaskSlot,
  DailyTier,
  SlotFormModel,
  TaskImportance,
} from './daily.model';
import { DailiesService } from './dailies.service';

export const DURATION_PRESETS = Array.from({ length: 16 }, (_, i) => 15 * (i + 1));
export const EFFORT_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

@Component({
  selector: 'app-dailies-page',
  imports: [DecimalPipe, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dailies-page.html',
  styleUrl: './dailies-page.css',
})
export class DailiesPage implements OnInit {
  private readonly dailiesService = inject(DailiesService);
  private readonly skillsService = inject(SkillsService);

  protected readonly durationPresets = DURATION_PRESETS;
  protected readonly effortLevels = EFFORT_LEVELS;

  protected readonly board = signal<DailyBoard | null>(null);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedDate = signal(this.todayIso());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
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
    this.skillsService.getTree().subscribe({
      next: (tree) => this.skillTree.set(tree),
      error: () => this.error.set('Could not load skills.'),
    });
    this.loadBoard(this.selectedDate());
  }

  protected slotKey(importance: TaskImportance, slotIndex: number): string {
    return `${importance}:${slotIndex}`;
  }

  protected isEditing(slot: DailyTaskSlot): boolean {
    return this.editingKey() === this.slotKey(slot.importance, slot.slotIndex);
  }

  protected toggleSetup(force?: boolean): void {
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
    if (slot.completed || this.board()?.isSealed) {
      return;
    }
    this.setupOpen.set(true);
    this.setupPinned = true;
    const custom = !DURATION_PRESETS.includes(slot.durationMinutes);
    this.slotModel.set({
      title: slot.title,
      skillId: slot.skillId ?? 0,
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
    this.toast.set(null);
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
        this.toast.set('Title and skill are required.');
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
          effortLevel: model.effortLevel,
          durationMinutes: duration,
        })
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.cancelEdit();
            this.setupPinned = false;
            this.toast.set('Task saved.');
            this.loadBoard(this.selectedDate(), false);
          },
          error: (err: { error?: { message?: string | string[] } }) => {
            this.saving.set(false);
            this.toast.set(this.readError(err, 'Failed to save task'));
          },
        });
    });
  }

  protected clearSlot(slot: DailyTaskSlot): void {
    if (!slot.id || slot.completed || this.board()?.isSealed) {
      return;
    }
    this.dailiesService.clearSlot(slot.id).subscribe({
      next: () => {
        this.toast.set('Slot cleared.');
        if (this.isEditing(slot)) {
          this.cancelEdit();
        }
        this.loadBoard(this.selectedDate(), false);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.toast.set(this.readError(err, 'Failed to clear slot'));
      },
    });
  }

  protected completeSlot(slot: DailyTaskSlot): void {
    if (!slot.id || slot.completed || this.board()?.isSealed) {
      return;
    }
    this.completingId.set(slot.id);
    this.dailiesService.complete(slot.id).subscribe({
      next: (result) => {
        this.completingId.set(null);
        const msg = result.award.leveledUp
          ? `+${result.award.activity.xpGained} XP — ${result.award.skill.name} leveled to ${result.award.skill.level}!`
          : `+${result.award.activity.xpGained} XP to ${result.award.skill.name}.`;
        this.toast.set(msg);
        this.loadBoard(this.selectedDate(), false);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.completingId.set(null);
        this.toast.set(this.readError(err, 'Failed to complete task'));
      },
    });
  }

  protected uncompleteSlot(slot: DailyTaskSlot): void {
    if (!slot.id || !slot.completed || this.board()?.isSealed) {
      return;
    }
    this.uncompletingId.set(slot.id);
    this.dailiesService.uncomplete(slot.id).subscribe({
      next: (result) => {
        this.uncompletingId.set(null);
        const removed = result.reversal?.xpRemoved ?? slot.xpAwarded ?? 0;
        this.toast.set(`Completion undone (−${removed} XP).`);
        this.loadBoard(this.selectedDate(), false);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.uncompletingId.set(null);
        this.toast.set(this.readError(err, 'Failed to undo completion'));
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
    if (!slot?.id || slot.completed || this.board()?.isSealed) {
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
        this.toast.set(`Moved to ${result.toDate}.`);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.postponingId.set(null);
        this.toast.set(this.readError(err, 'Postpone failed'));
      },
    });
  }

  protected addRegularSlot(): void {
    this.dailiesService.addRegularSlot(this.selectedDate()).subscribe({
      next: (board) => {
        this.board.set(board);
        this.setupOpen.set(true);
        this.setupPinned = true;
        this.toast.set('Regular slot added.');
        const empty = board.tiers
          .find((t) => t.importance === 'REGULAR')
          ?.slots.find((s) => s.isEmpty);
        if (empty) {
          this.startEdit(empty);
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.toast.set(this.readError(err, 'Could not add Regular slot'));
      },
    });
  }

  protected copyIncomplete(): void {
    this.dailiesService.copyIncomplete(this.selectedDate()).subscribe({
      next: (result) => {
        this.applyBoard(result.board);
        this.toast.set(
          `Copied ${result.copied} incomplete dailies from ${result.sourceDate}.`,
        );
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.toast.set(this.readError(err, 'Copy failed'));
      },
    });
  }

  protected sealDay(): void {
    const sealing = this.selectedDate();
    const wasRequired = this.board()?.sealRequired ?? false;
    this.dailiesService.sealDay(sealing).subscribe({
      next: () => {
        this.toast.set(`Sealed ${sealing}.`);
        if (wasRequired) {
          this.goToday();
        } else {
          this.loadBoard(sealing, false);
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.toast.set(this.readError(err, 'Seal failed'));
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
    this.selectedDate.set(date);
    this.loadBoard(date);
  }

  private loadBoard(date: string, showLoading = true): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.dailiesService.getBoard(date).subscribe({
      next: (board) => {
        this.applyBoard(board);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(
          'Could not reach the Dailies server. Is the backend running?',
        );
      },
    });
  }

  private applyBoard(board: DailyBoard): void {
    this.board.set(board);
    this.selectedDate.set(board.date);
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

  private blankModel(): SlotFormModel {
    return {
      title: '',
      skillId: 0,
      effortLevel: 5,
      durationMinutes: 45,
      customDuration: false,
      customDurationMinutes: 45,
    };
  }

  private todayIso(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
