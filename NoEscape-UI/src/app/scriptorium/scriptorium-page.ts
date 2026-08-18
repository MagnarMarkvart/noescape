import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CharacterService } from '../character/character.service';
import { DURATION_PRESETS, EFFORT_LEVELS } from '../dailies/daily.model';
import { DEFAULT_HABIT_ICON, HABIT_ICON_GROUPS } from '../habits/habit-icons';
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
import { Skill } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import {
  DEFAULT_SCRIPTORIUM_ICON,
  durationLabel,
  emptyWorkDraft,
  SCRIPTORIUM_SORTS,
  SCRIPTORIUM_TIERS,
  ScriptoriumSortId,
  ScriptoriumTier,
  ScriptoriumWorkView,
} from './scriptorium.model';
import { ScriptoriumService } from './scriptorium.service';

@Component({
  selector: 'app-scriptorium-page',
  imports: [RouterLink, RuneCheck, SkillWeightList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scriptorium-page.html',
  styleUrl: './scriptorium-page.css',
})
export class ScriptoriumPage implements OnInit {
  private readonly api = inject(ScriptoriumService);
  private readonly skillsService = inject(SkillsService);
  private readonly character = inject(CharacterService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly works = signal<ScriptoriumWorkView[]>([]);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly query = signal('');
  protected readonly sortId = signal<ScriptoriumSortId>('due');
  protected readonly showArchived = signal(false);
  protected readonly selectedId = signal<number | 'new' | null>(null);
  protected readonly draft = signal(emptyWorkDraft());
  protected readonly subtaskDraft = signal('');
  protected readonly skillPick = signal('');
  protected readonly customDuration = signal('');
  protected readonly iconGroupId = signal(HABIT_ICON_GROUPS[4]?.id ?? HABIT_ICON_GROUPS[0].id);
  protected readonly busyKey = signal<string | null>(null);

  protected readonly tiers = SCRIPTORIUM_TIERS;
  protected readonly sorts = SCRIPTORIUM_SORTS;
  protected readonly effortLevels = EFFORT_LEVELS;
  protected readonly durationPresets = DURATION_PRESETS;
  protected readonly iconGroups = HABIT_ICON_GROUPS;
  protected readonly durationLabel = durationLabel;
  protected readonly defaultIcon = DEFAULT_SCRIPTORIUM_ICON;

  protected readonly todayIso = this.character.todayIso;

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sort = this.sortId();
    const rows = this.works().filter((w) => {
      if (!q) {
        return true;
      }
      const hay = [
        w.title,
        w.notes,
        w.tier,
        ...(w.subtasks.map((s) => s.title)),
        ...(w.skillShares.map((s) => s.name)),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    return [...rows].sort((a, b) => this.compareWorks(a, b, sort));
  });

  protected readonly columns = computed(() =>
    SCRIPTORIUM_TIERS.map((tier) => ({
      ...tier,
      works: this.filtered().filter((w) => w.tier === tier.id),
    })),
  );

  protected readonly selected = computed(() => {
    const id = this.selectedId();
    if (id === 'new' || id == null) {
      return null;
    }
    return this.works().find((w) => w.id === id) ?? null;
  });

  protected readonly inspectorOpen = computed(() => this.selectedId() !== null);

  protected readonly remainingWeights = computed(() =>
    skillWeightRemaining(this.draft().skillWeights),
  );

  protected readonly weightsOk = computed(() => {
    const rows = this.draft().skillWeights;
    return rows.length === 0 || skillWeightsValid(rows);
  });

  protected readonly availableSkills = computed(() => {
    const taken = new Set(this.draft().skillWeights.map((s) => s.slug));
    return this.skills().filter((s) => !taken.has(s.slug));
  });

  protected readonly activeIconGroup = computed(
    () =>
      this.iconGroups.find((g) => g.id === this.iconGroupId()) ??
      this.iconGroups[0],
  );

  protected readonly shares = computed(() =>
    this.draft().skillWeights.map((w) => ({
      slug: w.slug,
      name: this.skillName(w.slug),
      weight: w.weight,
    })),
  );

  ngOnInit(): void {
    this.skillsService.getAll().subscribe({
      next: (rows) => this.skills.set(rows),
    });
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.api.list(this.showArchived() ? 'all' : 'OPEN').subscribe({
      next: (rows) => {
        this.works.set(rows);
        this.loading.set(false);
        this.error.set(null);
        const id = this.selectedId();
        if (typeof id === 'number' && !rows.some((w) => w.id === id)) {
          this.selectedId.set(null);
        }
        this.openQueryWork(rows);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not open the Scriptorium. Is the backend running?');
      },
    });
  }

  protected setQuery(raw: string): void {
    this.query.set(raw);
  }

  protected setSort(raw: string): void {
    const next = this.sorts.find((s) => s.id === raw);
    if (next) {
      this.sortId.set(next.id);
    }
  }

  protected toggleArchived(): void {
    this.showArchived.update((v) => !v);
    this.reload();
  }

  protected inscribe(): void {
    this.selectedId.set('new');
    this.draft.set(emptyWorkDraft());
    this.subtaskDraft.set('');
    this.customDuration.set('');
  }

  protected selectWork(work: ScriptoriumWorkView): void {
    this.selectedId.set(work.id);
    this.draft.set({
      title: work.title,
      notes: work.notes,
      icon: work.icon || DEFAULT_SCRIPTORIUM_ICON,
      tier: work.tier,
      dueDate: work.dueDate ?? '',
      durationMinutes: work.durationMinutes,
      effort: work.effort,
      skillWeights: work.skillWeights.map((w) => ({ ...w })),
    });
    this.customDuration.set(
      work.durationMinutes != null &&
        !DURATION_PRESETS.includes(work.durationMinutes)
        ? String(work.durationMinutes)
        : '',
    );
  }

  protected closeInspector(): void {
    this.selectedId.set(null);
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

  protected clearDue(): void {
    this.draft.update((d) => ({ ...d, dueDate: '' }));
  }

  protected setEffort(n: number): void {
    this.draft.update((d) => ({ ...d, effort: n }));
  }

  protected setDuration(minutes: number | null): void {
    this.customDuration.set('');
    this.draft.update((d) => ({ ...d, durationMinutes: minutes }));
  }

  protected setCustomDuration(raw: string): void {
    this.customDuration.set(raw);
    const n = Math.round(Number(raw));
    this.draft.update((d) => ({
      ...d,
      durationMinutes: Number.isFinite(n) && n > 0 ? n : null,
    }));
  }

  protected setIconGroup(id: string): void {
    this.iconGroupId.set(id);
  }

  protected pickIcon(glyph: string): void {
    this.draft.update((d) => ({ ...d, icon: glyph || DEFAULT_HABIT_ICON }));
  }

  protected addSkill(): void {
    const slug = this.skillPick();
    if (!slug) {
      return;
    }
    this.draft.update((d) => ({
      ...d,
      skillWeights: addSkillWeight(d.skillWeights, slug),
    }));
    this.skillPick.set('');
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
    const payload = {
      title,
      notes: d.notes.trim(),
      icon: d.icon || DEFAULT_SCRIPTORIUM_ICON,
      tier: d.tier,
      dueDate: d.dueDate.trim() || null,
      durationMinutes: d.durationMinutes,
      effort: d.effort,
      skillWeights: d.skillWeights,
    };
    const id = this.selectedId();
    const req =
      id === 'new' || id == null
        ? this.api.create(payload)
        : this.api.update(id, payload);
    req.subscribe({
      next: (row) => {
        this.saving.set(false);
        this.upsertLocal(row);
        this.selectWork(row);
        this.timed.set(id === 'new' ? 'Inscribed.' : 'Work updated.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.timed.set(err.error?.message ?? 'Could not save.');
      },
    });
  }

  protected addSubtask(): void {
    const id = this.selectedId();
    const title = this.subtaskDraft().trim();
    if (typeof id !== 'number' || !title) {
      return;
    }
    this.busyKey.set('sub:add');
    this.api.addSubtask(id, title).subscribe({
      next: (row) => {
        this.busyKey.set(null);
        this.subtaskDraft.set('');
        this.upsertLocal(row);
      },
      error: () => {
        this.busyKey.set(null);
        this.timed.set('Could not add the subtask.');
      },
    });
  }

  protected toggleSubtask(subId: number, done: boolean): void {
    const id = this.selectedId();
    if (typeof id !== 'number') {
      return;
    }
    this.busyKey.set(`sub:${subId}`);
    this.api.updateSubtask(id, subId, { done }).subscribe({
      next: (row) => {
        this.busyKey.set(null);
        this.upsertLocal(row);
      },
      error: () => {
        this.busyKey.set(null);
        this.timed.set('Could not update the subtask.');
      },
    });
  }

  protected removeSubtask(subId: number): void {
    const id = this.selectedId();
    if (typeof id !== 'number') {
      return;
    }
    this.api.removeSubtask(id, subId).subscribe({
      next: (row) => this.upsertLocal(row),
      error: () => this.timed.set('Could not remove the subtask.'),
    });
  }

  protected archive(): void {
    const work = this.selected();
    if (!work) {
      return;
    }
    const next = work.status === 'ARCHIVED' ? 'OPEN' : 'ARCHIVED';
    this.api.update(work.id, { status: next }).subscribe({
      next: (row) => {
        if (next === 'ARCHIVED' && !this.showArchived()) {
          this.works.update((list) => list.filter((w) => w.id !== row.id));
          this.selectedId.set(null);
        } else {
          this.upsertLocal(row);
        }
        this.timed.set(next === 'ARCHIVED' ? 'Shelved.' : 'Restored.');
      },
    });
  }

  protected destroy(): void {
    const work = this.selected();
    if (!work) {
      return;
    }
    const ok = window.confirm(`Erase “${work.title}” from the Scriptorium?`);
    if (!ok) {
      return;
    }
    this.api.remove(work.id).subscribe({
      next: () => {
        this.works.update((list) => list.filter((w) => w.id !== work.id));
        this.selectedId.set(null);
        this.timed.set('Erased.');
      },
    });
  }

  protected forgeQuest(): void {
    const work = this.selected();
    if (!work) {
      return;
    }
    void this.router.navigate(['/quests/forge'], {
      queryParams: { scriptorium: work.id },
    });
  }

  protected openVigilia(): void {
    const work = this.selected();
    if (!work) {
      return;
    }
    void this.router.navigate(['/horologium'], {
      queryParams: { vigilia: work.id },
    });
  }

  protected dueLabel(iso: string | null): string {
    if (!iso) {
      return 'No due day';
    }
    const today = this.todayIso();
    const days = this.diffDays(today, iso);
    const pretty = this.character.formatDate(iso);
    if (days < 0) {
      return `Overdue · ${pretty}`;
    }
    if (days === 0) {
      return `Due today · ${pretty}`;
    }
    if (days === 1) {
      return `Due tomorrow · ${pretty}`;
    }
    return `Due ${pretty}`;
  }

  protected dueTone(iso: string | null): 'overdue' | 'today' | 'soon' | '' {
    if (!iso) {
      return '';
    }
    const days = this.diffDays(this.todayIso(), iso);
    if (days < 0) {
      return 'overdue';
    }
    if (days === 0) {
      return 'today';
    }
    if (days <= 3) {
      return 'soon';
    }
    return '';
  }

  protected skillName(slug: string): string {
    return this.skills().find((s) => s.slug === slug)?.name ?? slug;
  }

  protected setSkillPick(raw: string): void {
    this.skillPick.set(raw);
  }

  protected setSubtaskDraft(raw: string): void {
    this.subtaskDraft.set(raw);
  }

  private openQueryWork(rows: ScriptoriumWorkView[]): void {
    const raw = this.route.snapshot.queryParamMap.get('work');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    const work = rows.find((w) => w.id === id);
    if (work) {
      this.selectWork(work);
    }
  }

  private upsertLocal(row: ScriptoriumWorkView): void {
    this.works.update((list) => {
      const rest = list.filter((w) => w.id !== row.id);
      if (row.status === 'ARCHIVED' && !this.showArchived()) {
        return rest;
      }
      return [row, ...rest];
    });
  }

  private compareWorks(
    a: ScriptoriumWorkView,
    b: ScriptoriumWorkView,
    sort: ScriptoriumSortId,
  ): number {
    if (sort === 'title') {
      return a.title.localeCompare(b.title);
    }
    if (sort === 'effort') {
      return b.effort - a.effort || a.title.localeCompare(b.title);
    }
    if (sort === 'duration') {
      return (b.durationMinutes ?? -1) - (a.durationMinutes ?? -1);
    }
    if (sort === 'created') {
      return b.createdAt.localeCompare(a.createdAt);
    }
    const ad = a.dueDate ?? '9999-99-99';
    const bd = b.dueDate ?? '9999-99-99';
    return ad.localeCompare(bd) || a.title.localeCompare(b.title);
  }

  private diffDays(fromIso: string, toIso: string): number {
    const from = Date.parse(`${fromIso}T00:00:00Z`);
    const to = Date.parse(`${toIso}T00:00:00Z`);
    return Math.round((to - from) / 86_400_000);
  }
}
