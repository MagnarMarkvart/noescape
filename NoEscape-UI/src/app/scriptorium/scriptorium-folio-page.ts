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
import { DURATION_PRESETS } from '../dailies/daily.model';
import { RuneCheck } from '../shared/rune-check';
import { SkillWeightList } from '../shared/skill-weight-list';
import {
  addSkillWeight,
  bumpSkillWeight,
  removeSkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { TimedToast } from '../shared/timed-toast';
import { DateField } from '../shared/ui/date-field';
import { DurationField } from '../shared/ui/duration-field';
import { EffortField } from '../shared/ui/effort-field';
import { ForgeShell } from '../shared/ui/forge-shell';
import { IconPicker } from '../shared/ui/icon-picker';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import {
  DEFAULT_SCRIPTORIUM_ICON,
  emptyWorkDraft,
  SCRIPTORIUM_TIERS,
  ScriptoriumTier,
  ScriptoriumWorkView,
  workLocked,
} from './scriptorium.model';
import { ScriptoriumService } from './scriptorium.service';
import { WorkIntervalLog } from '../shared/work-interval-log';
import {
  DragGrip,
  DragItem,
  DragSortDrop,
  DropGroup,
  DropList,
  moveIndex,
} from '../shared/ui/drag-sort';

@Component({
  selector: 'app-scriptorium-folio-page',
  imports: [
    RouterLink,
    RuneCheck,
    SkillWeightList,
    DateField,
    DurationField,
    EffortField,
    ForgeShell,
    IconPicker,
    SkillTreePicker,
    WorkIntervalLog,
    DropGroup,
    DropList,
    DragItem,
    DragGrip,
    UiConfirm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scriptorium-folio-page.html',
  styleUrl: './scriptorium-folio-page.css',
})
export class ScriptoriumFolioPage implements OnInit {
  private readonly api = inject(ScriptoriumService);
  private readonly skillsService = inject(SkillsService);
  private readonly character = inject(CharacterService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly xpFeedback = inject(XpFeedbackService);
  protected readonly vigiliaLogVisible = this.character.vigiliaTrackScriptorium;
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly saving = signal(false);
  protected readonly editId = signal<number | null>(null);
  protected readonly work = signal<ScriptoriumWorkView | null>(null);
  protected readonly draft = signal(emptyWorkDraft());
  protected readonly subtaskDraft = signal('');
  protected readonly pendingSubtasks = signal<string[]>([]);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly busyKey = signal<string | null>(null);
  protected readonly pendingConfirm = signal<'erase' | 'complete' | null>(null);

  protected readonly tiers = SCRIPTORIUM_TIERS;
  protected readonly durationPresets = DURATION_PRESETS;

  protected readonly heading = computed(() =>
    this.editId() ? 'Edit folio' : 'New folio',
  );
  protected readonly locked = computed(() => {
    const current = this.work();
    return current ? workLocked(current) : false;
  });
  protected readonly assignedStamp = computed(() => {
    const current = this.work();
    if (!current) {
      return '';
    }
    if (current.assignedKind === 'quest' || current.questId) {
      return current.questName
        ? `Assigned to quest “${current.questName}”.`
        : 'Assigned to a quest.';
    }
    if (current.assignedKind === 'daily') {
      return 'Assigned to a daily. Complete that daily to shelf this folio.';
    }
    return '';
  });

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
    this.draft().skillWeights.map((row) => row.slug),
  );
  protected readonly remainingWeights = computed(() =>
    skillWeightRemaining(this.draft().skillWeights),
  );
  protected readonly weightsOk = computed(() => {
    const rows = this.draft().skillWeights;
    return rows.length === 0 || skillWeightsValid(rows);
  });
  protected readonly shares = computed(() =>
    this.draft().skillWeights.map((w) => {
      const skill = this.skills().find((s) => s.slug === w.slug);
      return {
        slug: w.slug,
        name: skill?.name ?? w.slug,
        weight: w.weight,
        icon: skill?.icon,
      };
    }),
  );

  ngOnInit(): void {
    this.skillsService.getTree().subscribe({
      next: (tree) => this.skillTree.set(tree),
    });
    const raw = this.route.snapshot.paramMap.get('id');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    this.editId.set(id);
    this.api.getOne(id).subscribe({
      next: (row) => this.applyWork(row),
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Could not open the folio.');
      },
    });
  }

  protected setDraftTitle(raw: string): void {
    this.draft.update((d) => ({ ...d, title: raw }));
  }

  protected setDraftNotes(raw: string): void {
    this.draft.update((d) => ({ ...d, notes: raw }));
  }

  protected setDraftTier(tier: ScriptoriumTier): void {
    this.draft.update((d) => ({ ...d, tier }));
  }

  protected setDraftDue(raw: string): void {
    this.draft.update((d) => ({ ...d, dueDate: raw }));
  }

  protected setEffort(n: number): void {
    this.draft.update((d) => ({ ...d, effort: n }));
  }

  protected setDuration(minutes: number | null): void {
    this.draft.update((d) => ({ ...d, durationMinutes: minutes }));
  }

  protected pickIcon(glyph: string): void {
    this.draft.update((d) => ({ ...d, icon: glyph || DEFAULT_SCRIPTORIUM_ICON }));
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected pickSkill(skill: Skill): void {
    this.draft.update((d) => ({
      ...d,
      skillWeights: addSkillWeight(d.skillWeights, skill.slug),
    }));
  }

  protected bumpWeight(slug: string, delta: number): void {
    this.draft.update((d) => ({
      ...d,
      skillWeights: bumpSkillWeight(d.skillWeights, slug, delta),
    }));
  }

  protected removeSkill(slug: string): void {
    this.draft.update((d) => ({
      ...d,
      skillWeights: removeSkillWeight(d.skillWeights, slug),
    }));
  }

  protected save(): void {
    if (this.locked()) {
      this.timed.set('Assigned folios cannot be edited.');
      return;
    }
    const d = this.draft();
    const title = d.title.trim();
    if (!title) {
      this.timed.set('Give the work a name first.');
      return;
    }
    if (!this.weightsOk()) {
      this.timed.set('Assign all 10 skill points, or clear the skills.');
      return;
    }
    this.saving.set(true);
    const id = this.editId();
    const wasNew = id == null;
    const typed = this.subtaskDraft().trim();
    const pending = wasNew
      ? [
          ...this.pendingSubtasks(),
          ...(typed ? [typed] : []),
        ]
      : undefined;
    const payload = {
      title,
      notes: d.notes.trim(),
      icon: d.icon || DEFAULT_SCRIPTORIUM_ICON,
      tier: d.tier,
      dueDate: d.dueDate.trim() || null,
      durationMinutes: d.durationMinutes,
      effort: d.effort,
      skillWeights: d.skillWeights,
      subtasks: pending,
    };
    const req = wasNew ? this.api.create(payload) : this.api.update(id, payload);
    req.subscribe({
      next: (row) => {
        this.saving.set(false);
        if (wasNew) {
          void this.router.navigate(['/scriptorium']);
          return;
        }
        this.applyWork(row);
        this.timed.set('Work updated.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.timed.set(err.error?.message ?? 'Could not save.');
      },
    });
  }

  protected setSubtaskDraft(raw: string): void {
    this.subtaskDraft.set(raw);
  }

  protected addSubtask(): void {
    const title = this.subtaskDraft().trim();
    if (!title) {
      return;
    }
    const id = this.editId();
    if (id == null) {
      this.pendingSubtasks.update((rows) => [...rows, title]);
      this.subtaskDraft.set('');
      return;
    }
    this.busyKey.set('sub:add');
    this.api.addSubtask(id, title).subscribe({
      next: (row) => {
        this.busyKey.set(null);
        this.subtaskDraft.set('');
        this.applyWork(row);
      },
      error: () => {
        this.busyKey.set(null);
        this.timed.set('Could not add the subtask.');
      },
    });
  }

  protected removePendingSubtask(index: number): void {
    this.pendingSubtasks.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected onSubtaskDrop(event: DragSortDrop): void {
    if (event.fromList !== event.toList) {
      return;
    }
    if (event.fromList === 'pending') {
      this.pendingSubtasks.update((rows) =>
        moveIndex(rows, event.fromIndex, event.toIndex),
      );
      return;
    }
    const current = this.work();
    const id = this.editId();
    if (!current || id == null) {
      return;
    }
    const ids = moveIndex(
      current.subtasks.map((s) => s.id),
      event.fromIndex,
      event.toIndex,
    );
    this.work.update((row) =>
      row
        ? {
            ...row,
            subtasks: moveIndex(row.subtasks, event.fromIndex, event.toIndex),
          }
        : row,
    );
    this.api.reorderSubtasks(id, ids).subscribe({
      next: (row) => this.applyWork(row),
      error: () => this.timed.set('Could not reorder subtasks.'),
    });
  }

  protected toggleSubtask(subId: number, done: boolean): void {
    const id = this.editId();
    if (id == null) {
      return;
    }
    this.busyKey.set(`sub:${subId}`);
    this.api.updateSubtask(id, subId, { done }).subscribe({
      next: (row) => {
        this.busyKey.set(null);
        this.applyWork(row);
      },
      error: () => {
        this.busyKey.set(null);
        this.timed.set('Could not update the subtask.');
      },
    });
  }

  protected removeSubtask(subId: number): void {
    const id = this.editId();
    if (id == null) {
      return;
    }
    this.api.removeSubtask(id, subId).subscribe({
      next: (row) => this.applyWork(row),
      error: () => this.timed.set('Could not remove the subtask.'),
    });
  }

  protected archive(): void {
    const work = this.work();
    if (!work) {
      return;
    }
    if (this.locked() && work.status !== 'ARCHIVED') {
      this.timed.set('Assigned folios cannot be shelved.');
      return;
    }
    const next = work.status === 'ARCHIVED' ? 'OPEN' : 'ARCHIVED';
    this.api.update(work.id, { status: next }).subscribe({
      next: (row) => {
        this.applyWork(row);
        this.timed.set(next === 'ARCHIVED' ? 'Shelved.' : 'Restored.');
      },
    });
  }

  protected destroy(): void {
    if (!this.work()) {
      return;
    }
    this.pendingConfirm.set('erase');
  }

  protected askComplete(): void {
    const work = this.work();
    if (!work || this.locked() || work.status === 'ARCHIVED') {
      return;
    }
    this.pendingConfirm.set('complete');
  }

  protected cancelConfirm(): void {
    this.pendingConfirm.set(null);
  }

  protected runConfirm(): void {
    const kind = this.pendingConfirm();
    const work = this.work();
    if (!kind || !work) {
      return;
    }
    if (kind === 'complete') {
      this.completeWork(work);
      return;
    }
    this.eraseWork(work);
  }

  protected forgeQuest(): void {
    const work = this.work();
    if (!work || this.locked()) {
      return;
    }
    void this.router.navigate(['/quests/forge'], {
      queryParams: { scriptorium: work.id },
    });
  }

  protected assignDaily(): void {
    const work = this.work();
    if (!work || this.locked()) {
      return;
    }
    void this.router.navigate(['/dailies'], {
      queryParams: { scriptorium: work.id },
    });
  }

  protected openVigilia(): void {
    const work = this.work();
    if (!work) {
      return;
    }
    void this.router.navigate(['/horologium'], {
      queryParams: { vigilia: work.id },
    });
  }

  private completeWork(work: ScriptoriumWorkView): void {
    this.saving.set(true);
    this.api.complete(work.id).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.pendingConfirm.set(null);
        for (const award of result.awards ?? []) {
          this.xpFeedback.publishAward(award);
        }
        this.applyWork(result.work);
        this.timed.set('Completed and shelved.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.pendingConfirm.set(null);
        this.timed.set(err.error?.message ?? 'Could not complete the folio.');
      },
    });
  }

  private eraseWork(work: ScriptoriumWorkView): void {
    this.saving.set(true);
    this.api.remove(work.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.pendingConfirm.set(null);
        void this.router.navigate(['/scriptorium']);
      },
      error: () => {
        this.saving.set(false);
        this.pendingConfirm.set(null);
        this.timed.set('Could not erase the folio.');
      },
    });
  }

  private applyWork(row: ScriptoriumWorkView): void {
    this.editId.set(row.id);
    this.work.set(row);
    this.pendingSubtasks.set([]);
    this.subtaskDraft.set('');
    this.draft.set({
      title: row.title,
      notes: row.notes,
      icon: row.icon || DEFAULT_SCRIPTORIUM_ICON,
      tier: row.tier,
      dueDate: row.dueDate ?? '',
      durationMinutes: row.durationMinutes,
      effort: row.effort,
      skillWeights: row.skillWeights.map((w) => ({ ...w })),
    });
  }
}
