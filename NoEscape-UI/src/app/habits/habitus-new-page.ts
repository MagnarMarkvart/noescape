import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { CharacterService } from '../character/character.service';
import { TimedToast } from '../shared/timed-toast';
import { FINANCE_SKILL_SLUG } from '../shared/skill-weights';
import { parseMoneyToCents } from '../shared/money';
import { SkillsService } from '../skills/skills.service';
import { Skill, SkillTree } from '../skills/skill.model';
import { ForgeShell } from '../shared/ui/forge-shell';
import { IconPicker } from '../shared/ui/icon-picker';
import { NumberField } from '../shared/ui/number-field';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import { DEFAULT_HABIT_ICON } from './habit-icons';
import { HabitsService } from './habits.service';

@Component({
  selector: 'app-habitus-new-page',
  imports: [RouterLink, FormField, ForgeShell, IconPicker, SkillTreePicker, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './habitus-new-page.html',
  styleUrl: './habitus-new-page.css',
})
export class HabitusNewPage {
  private readonly habitsService = inject(HabitsService);
  private readonly skillsService = inject(SkillsService);
  private readonly character = inject(CharacterService);
  private readonly router = inject(Router);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly creating = signal(false);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);

  protected readonly createModel = signal({
    name: '',
    icon: DEFAULT_HABIT_ICON,
    cadence: 'DAILY',
    everyNDays: 1,
    skillId: 0,
    wealthAmount: '',
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
    return this.categories().find((c) => c.category === category)?.skills ?? [];
  });
  protected readonly skills = computed(() =>
    this.categories().flatMap((c) => c.skills),
  );
  protected readonly selectedSlugs = computed(() => {
    const skill = this.selectedSkill();
    return skill ? [skill.slug] : [];
  });

  protected readonly selectedSkill = computed(() =>
    this.skills().find((s) => s.id === this.createModel().skillId) ?? null,
  );

  protected readonly showWealth = computed(
    () => this.selectedSkill()?.slug === FINANCE_SKILL_SLUG,
  );

  protected readonly currencyLabel = computed(() => this.character.currency());

  constructor() {
    this.skillsService.getTree().subscribe({
      next: (tree) => this.skillTree.set(tree),
    });
  }

  protected pickIcon(glyph: string): void {
    this.createModel.update((m) => ({ ...m, icon: glyph }));
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected pickSkill(skill: Skill): void {
    this.createModel.update((m) => ({
      ...m,
      skillId: m.skillId === skill.id ? 0 : skill.id,
    }));
  }

  protected setEveryNDays(n: number): void {
    this.createModel.update((m) => ({ ...m, everyNDays: n }));
  }

  protected setWealthAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.createModel.update((m) => ({ ...m, wealthAmount: value }));
  }

  protected create(): void {
    void submit(this.createForm, async () => {
      const m = this.createModel();
      this.creating.set(true);
      this.habitsService
        .create({
          name: m.name.trim(),
          icon: m.icon.trim() || DEFAULT_HABIT_ICON,
          cadence: m.cadence,
          everyNDays: Number(m.everyNDays) || 1,
          skillId: m.skillId > 0 ? m.skillId : undefined,
          wealthCents:
            this.selectedSkill()?.slug === FINANCE_SKILL_SLUG
              ? parseMoneyToCents(m.wealthAmount)
              : 0,
        })
        .subscribe({
          next: () => {
            this.creating.set(false);
            void this.router.navigate(['/habitus']);
          },
          error: (err: { error?: { message?: string } }) => {
            this.creating.set(false);
            this.timed.set(err.error?.message ?? 'Create failed');
          },
        });
    });
  }
}
