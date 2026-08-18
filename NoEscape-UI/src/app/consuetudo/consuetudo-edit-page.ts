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
import { DEFAULT_HABIT_ICON, HABIT_ICON_GROUPS } from '../habits/habit-icons';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { SkillWeightList } from '../shared/skill-weight-list';
import {
  addSkillWeight,
  bumpSkillWeight,
  removeSkillWeight,
  SkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { TimedToast } from '../shared/timed-toast';
import { EFFORT_LEVELS } from '../dailies/daily.model';
import { splitQuestXp } from '../quests/quest.model';
import {
  CONSUETUDO_DEMO_ROUTINE,
  DEFAULT_ROUTINE_ICON,
  SAMPLE_MORNING_STEPS,
} from './consuetudo-demo';
import { calculateConsuetudoXp } from './consuetudo-xp';
import { RoutinesService } from './routines.service';

type DraftStep = {
  title: string;
  icon: string;
  durationMinutes: number;
};

@Component({
  selector: 'app-consuetudo-edit-page',
  imports: [RouterLink, FormField, SkillWeightList],
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
  protected readonly iconGroups = HABIT_ICON_GROUPS;
  protected readonly iconGroupId = signal(HABIT_ICON_GROUPS[2].id);
  protected readonly stepIconGroupId = signal(HABIT_ICON_GROUPS[2].id);
  protected readonly stepIconIndex = signal<number | null>(null);
  protected readonly creating = signal(false);
  protected readonly effortLevels = EFFORT_LEVELS;
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly skillWeights = signal<SkillWeight[]>([]);
  protected readonly steps = signal<DraftStep[]>(
    SAMPLE_MORNING_STEPS.map((s) => ({ ...s })),
  );
  protected readonly editId = signal<number | null>(null);
  protected readonly canCreate = signal(true);

  protected readonly createModel = signal({
    name: 'Morning Routine',
    icon: DEFAULT_ROUTINE_ICON,
    effortLevel: 3,
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
  });

  protected readonly activeIconGroup = computed(
    () =>
      this.iconGroups.find((g) => g.id === this.iconGroupId()) ??
      this.iconGroups[0],
  );
  protected readonly activeStepIconGroup = computed(
    () =>
      this.iconGroups.find((g) => g.id === this.stepIconGroupId()) ??
      this.iconGroups[0],
  );
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
    return splitQuestXp(xp, this.skillWeights()).map((share) => ({
      ...share,
      name:
        this.allSkills().find((s) => s.slug === share.slug)?.name ?? share.slug,
    }));
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
              row.steps.map((s) => ({
                title: s.title,
                icon: s.icon || DEFAULT_HABIT_ICON,
                durationMinutes: s.durationMinutes,
              })),
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
      this.skillWeights.set(CONSUETUDO_DEMO_ROUTINE.skillWeights);
    }
  }

  protected pickIcon(glyph: string): void {
    this.createModel.update((m) => ({ ...m, icon: glyph }));
  }

  protected setEffort(raw: string): void {
    const effortLevel = Math.min(10, Math.max(1, Math.round(Number(raw) || 3)));
    this.createModel.update((m) => ({ ...m, effortLevel }));
  }

  protected setIconGroup(id: string): void {
    this.iconGroupId.set(id);
  }

  protected setStepIconGroup(id: string): void {
    this.stepIconGroupId.set(id);
  }

  protected toggleStepIcon(index: number): void {
    this.stepIconIndex.update((cur) => (cur === index ? null : index));
  }

  protected pickStepIcon(index: number, glyph: string): void {
    this.steps.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, icon: glyph } : row)),
    );
  }

  protected setStepTitle(index: number, title: string): void {
    this.steps.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, title } : row)),
    );
  }

  protected setStepMinutes(index: number, raw: string): void {
    const durationMinutes = Math.max(1, Math.round(Number(raw) || 1));
    this.steps.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, durationMinutes } : row)),
    );
  }

  protected addStep(): void {
    this.steps.update((rows) => [
      ...rows,
      { title: '', icon: DEFAULT_ROUTINE_ICON, durationMinutes: 5 },
    ]);
  }

  protected removeStep(index: number): void {
    this.steps.update((rows) => rows.filter((_, i) => i !== index));
    if (this.stepIconIndex() === index) {
      this.stepIconIndex.set(null);
    }
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected selectSkill(skillId: number): void {
    const skill = this.allSkills().find((s) => s.id === skillId);
    if (!skill) {
      return;
    }
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

  protected hasSkill(skillId: number): boolean {
    const skill = this.allSkills().find((s) => s.id === skillId);
    return Boolean(
      skill && this.skillWeights().some((row) => row.slug === skill.slug),
    );
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
