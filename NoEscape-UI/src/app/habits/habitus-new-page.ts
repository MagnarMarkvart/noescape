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
import { Skill } from '../skills/skill.model';
import { DEFAULT_HABIT_ICON, HABIT_ICON_GROUPS } from './habit-icons';
import { HabitsService } from './habits.service';

@Component({
  selector: 'app-habitus-new-page',
  imports: [RouterLink, FormField],
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
  protected readonly iconGroups = HABIT_ICON_GROUPS;
  protected readonly iconGroupId = signal(HABIT_ICON_GROUPS[0].id);
  protected readonly creating = signal(false);
  protected readonly skills = signal<Skill[]>([]);

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

  protected readonly activeIconGroup = computed(
    () =>
      this.iconGroups.find((g) => g.id === this.iconGroupId()) ??
      this.iconGroups[0],
  );

  protected readonly selectedSkill = computed(() =>
    this.skills().find((s) => s.id === this.createModel().skillId) ?? null,
  );

  protected readonly showWealth = computed(
    () => this.selectedSkill()?.slug === FINANCE_SKILL_SLUG,
  );

  protected readonly currencyLabel = computed(() => this.character.currency());

  constructor() {
    this.skillsService.getTree().subscribe({
      next: (tree) =>
        this.skills.set(tree.categories.flatMap((c) => c.skills)),
    });
  }

  protected pickIcon(glyph: string): void {
    this.createModel.update((m) => ({ ...m, icon: glyph }));
  }

  protected setIconGroup(id: string): void {
    this.iconGroupId.set(id);
  }

  protected setSkill(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value) || 0;
    this.createModel.update((m) => ({ ...m, skillId: id }));
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
