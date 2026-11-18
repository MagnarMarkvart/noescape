import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { DEFAULT_HABIT_ICON } from '../habits/habit-icons';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { SkillWeightList } from '../shared/skill-weight-list';
import { ForgeShell } from '../shared/ui/forge-shell';
import { ForgeRow, ForgeTable, ForgeTableColumn } from '../shared/ui/forge-table';
import { IconField } from '../shared/ui/icon-field';
import { EffortField } from '../shared/ui/effort-field';
import { IconPicker } from '../shared/ui/icon-picker';
import { NumberField } from '../shared/ui/number-field';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import {
  addSkillWeight,
  bumpSkillWeight,
  removeSkillWeight,
  SkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { TimedToast } from '../shared/timed-toast';
import { splitQuestXp } from '../quests/quest.model';
import { DEFAULT_ROUTINE_ICON } from './consuetudo-demo';
import { calculateConsuetudoXp } from './consuetudo-xp';
import { RoutinesService } from './routines.service';

type DraftStep = {
  id: number;
  title: string;
  icon: string;
  durationMinutes: number | null;
};

let nextDraftStepId = 1;
function draftStepId(): number {
  const id = nextDraftStepId;
  nextDraftStepId += 1;
  return id;
}
function noteDraftStepId(id: number): void {
  if (id >= nextDraftStepId) {
    nextDraftStepId = id + 1;
  }
}

@Component({
  selector: 'app-consuetudo-edit-page',
  imports: [
    RouterLink,
    FormField,
    SkillWeightList,
    ForgeShell,
    ForgeTable,
    ForgeRow,
    EffortField,
    IconField,
    IconPicker,
    NumberField,
    SkillTreePicker,
    UiIconBtn,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consuetudo-edit-page.html',
  styleUrl: './consuetudo-edit-page.css',
})
export class ConsuetudoEditPage implements OnInit {
  private readonly routines = inject(RoutinesService);
  private readonly skillsService = inject(SkillsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly creating = signal(false);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly skillWeights = signal<SkillWeight[]>([]);
  protected readonly steps = signal<DraftStep[]>([]);
  protected readonly editId = signal<number | null>(null);
  protected readonly canCreate = signal(true);

  protected readonly createModel = signal({
    name: '',
    icon: '',
    effortLevel: 3,
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
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
  protected readonly allSkills = computed(() =>
    this.categories().flatMap((c) => c.skills),
  );
  protected readonly weightShares = computed(() => {
    const xp = this.previewXp().totalXp;
    return splitQuestXp(xp, this.skillWeights()).map((share) => {
      const skill = this.allSkills().find((s) => s.slug === share.slug);
      return {
        ...share,
        name: skill?.name ?? share.slug,
        icon: skill?.icon,
      };
    });
  });
  protected readonly weightRemaining = computed(() =>
    skillWeightRemaining(this.skillWeights()),
  );
  protected readonly weightsValid = computed(() =>
    skillWeightsValid(this.skillWeights()),
  );
  protected readonly previewXp = computed(() => {
    const minutes = this.steps().reduce(
      (sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0),
      0,
    );
    return calculateConsuetudoXp({
      effortLevel: Number(this.createModel().effortLevel) || 3,
      completedPlannedMinutes: minutes,
      skippedCount: 0,
      totalSteps: this.steps().length,
    });
  });
  protected readonly heading = computed(() =>
    this.editId() ? 'Edit practice' : 'New practice',
  );
  protected readonly selectedSlugs = computed(() =>
    this.skillWeights().map((row) => row.slug),
  );

  protected readonly stepColumns: ForgeTableColumn[] = [
    { key: 'icon', label: 'Icon', width: '2.35rem' },
    { key: 'task', label: 'Task', width: 'minmax(0, 1fr)' },
    { key: 'time', label: 'Time (min)', width: '5.2rem' },
    { key: 'remove', label: '', width: '2.35rem' },
  ];

  ngOnInit(): void {
    const cached = this.skillsService.peekTree();
    if (cached) {
      this.skillTree.set(cached);
    }
    this.skillsService.getTree(!cached).subscribe({
      next: (tree) => this.skillTree.set(tree),
    });
    const rawId = this.route.snapshot.paramMap.get('id');
    if (rawId && rawId !== 'new') {
      const id = Number(rawId);
      if (Number.isFinite(id) && id > 0) {
        this.editId.set(id);
        this.routines.getOne(id).subscribe({
          next: (row) => {
            this.createModel.set({
              name: row.name,
              icon: row.icon || DEFAULT_ROUTINE_ICON,
              effortLevel: row.effortLevel,
            });
            this.skillWeights.set(row.skillWeights);
            this.steps.set(
              row.steps.map((s) => {
                const id = s.id > 0 ? s.id : draftStepId();
                noteDraftStepId(id);
                return {
                  id,
                  title: s.title,
                  icon: s.icon || DEFAULT_HABIT_ICON,
                  durationMinutes: s.durationMinutes,
                };
              }),
            );
          },
          error: (err: { error?: { message?: string } }) => {
            this.timed.set(err.error?.message ?? 'Could not load routine');
          },
        });
      }
    } else {
      this.routines.access().subscribe({
        next: (a) => {
          this.canCreate.set(a.canCreate);
          if (!a.canCreate) {
            this.timed.set(
              'Ordo Diei allows one Consuetudo until the quest is complete.',
            );
          }
        },
      });
    }
  }

  protected pickIcon(glyph: string): void {
    this.createModel.update((m) => ({ ...m, icon: glyph }));
  }

  protected setEffort(level: number): void {
    const effortLevel = Math.min(10, Math.max(1, Math.round(level || 3)));
    this.createModel.update((m) => ({ ...m, effortLevel }));
  }

  protected setStepIcon(id: number, glyph: string): void {
    this.steps.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, icon: glyph } : row)),
    );
  }

  protected setStepTitle(id: number, title: string): void {
    this.steps.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, title } : row)),
    );
  }

  protected setStepMinutes(id: number, durationMinutes: number): void {
    this.steps.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, durationMinutes } : row)),
    );
  }

  protected addStep(): void {
    this.steps.update((rows) => [
      ...rows,
      {
        id: draftStepId(),
        title: '',
        icon: '',
        durationMinutes: null,
      },
    ]);
  }

  protected removeStep(id: number): void {
    this.steps.update((rows) => rows.filter((row) => row.id !== id));
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

  protected removeWeight(slug: string): void {
    this.skillWeights.set(removeSkillWeight(this.skillWeights(), slug));
  }

  protected save(): void {
    void submit(this.createForm, async () => {
      if (!this.weightsValid()) {
        this.timed.set('Assign all 10 skill points');
        return;
      }
      const steps = this.steps()
        .map((s) => ({
          title: s.title.trim(),
          icon: s.icon.trim() || DEFAULT_ROUTINE_ICON,
          durationMinutes: Math.max(1, Math.round(s.durationMinutes || 1)),
        }))
        .filter((s) => s.title);
      if (steps.length === 0) {
        this.timed.set('Add at least one named step');
        return;
      }
      const m = this.createModel();
      const body = {
        name: m.name.trim(),
        icon: m.icon.trim() || DEFAULT_ROUTINE_ICON,
        effortLevel: Number(m.effortLevel) || 3,
        skillWeights: this.skillWeights(),
        steps,
      };
      this.creating.set(true);
      const id = this.editId();
      const req =
        id != null
          ? this.routines.update(id, body)
          : this.routines.create(body);
      req.subscribe({
        next: () => {
          this.creating.set(false);
          void this.router.navigate(['/consuetudo']);
        },
        error: (err: { error?: { message?: string } }) => {
          this.creating.set(false);
          this.timed.set(err.error?.message ?? 'Save failed');
        },
      });
    });
  }
}
