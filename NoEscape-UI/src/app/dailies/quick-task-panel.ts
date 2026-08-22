import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CharacterService } from '../character/character.service';
import { calculateDailyTaskXp } from './daily-xp';
import {
  DailyTaskTemplate,
  DURATION_PRESETS,
  dailySkillLine,
  dailySkillWeights,
  formatTaskDuration,
  QuickTaskLog,
} from './daily.model';
import { DailiesService } from './dailies.service';
import { DefaultTaskPicker } from './default-task-picker';
import { splitQuestXp } from '../quests/quest.model';
import { SkillWeightList } from '../shared/skill-weight-list';
import {
  addSkillWeight,
  boostsWealth,
  bumpSkillWeight,
  primarySkillSlug,
  removeSkillWeight,
  skillWeightRemaining,
  skillWeightsValid,
} from '../shared/skill-weights';
import { centsToInput, parseMoneyToCents } from '../shared/money';
import { TimedToast } from '../shared/timed-toast';
import { DurationField } from '../shared/ui/duration-field';
import { EffortField } from '../shared/ui/effort-field';
import { UiIcon } from '../shared/ui/ui-icon';
import { SkillTreePicker } from '../shared/ui/skill-tree-picker';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';

@Component({
  selector: 'app-quick-task-panel',
  imports: [
    DecimalPipe,
    DefaultTaskPicker,
    SkillWeightList,
    SkillTreePicker,
    DurationField,
    EffortField,
    UiIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="quick" [class.compact]="compact()" [class.open]="open()">
      <header class="head">
        <button
          type="button"
          class="toggle"
          [attr.aria-expanded]="open()"
          (click)="toggleOpen()"
        >
          <h3>Log a task</h3>
          <app-ui-icon name="chevron" />
        </button>
      </header>

      @if (toast()) {
        <p class="toast" role="status">{{ toast() }}</p>
      }

      @if (open()) {
      <app-default-task-picker
        [templates]="templates()"
        (pick)="applyTemplate($event)"
      />

      <form class="forge-form" (submit)="$event.preventDefault(); log()">
        <fieldset>
          <legend>What I did</legend>
          <input
            type="text"
            maxlength="120"
            [value]="title()"
            (input)="title.set($any($event.target).value)"
            placeholder="10 push-ups"
          />
        </fieldset>

        <fieldset>
          <legend>Skills</legend>
          <app-skill-weight-list
            [shares]="weightShares()"
            [remaining]="weightRemaining()"
            [valid]="weightsValid()"
            (bump)="bumpSkillWeight($event)"
            (remove)="removeSkillWeight($event)"
          />
          <app-skill-tree-picker
            [showLevel]="true"
            [categories]="categories()"
            [skills]="subskills()"
            [selectedCategory]="selectedCategory()"
            [selectedSlugs]="selectedSlugs()"
            (categoryChange)="selectedCategory.set($event)"
            (skillPick)="pickSkill($event)"
          />
        </fieldset>

        <app-effort-field [value]="effortLevel()" (valueChange)="effortLevel.set($event)" />
        <app-duration-field
          legend="Duration"
          [presets]="durationPresets"
          [minutes]="durationMinutes()"
          [maxHours]="8"
          (minutesChange)="setDuration($event)"
        />

        @if (showWealth()) {
          <fieldset>
            <legend>Wealth gained</legend>
            <input
              type="text"
              inputmode="decimal"
              [value]="wealthAmount()"
              (input)="wealthAmount.set($any($event.target).value)"
              placeholder="0.00"
            />
          </fieldset>
        }

        <p class="xp-preview">≈ {{ previewXp() | number }} XP</p>
        <button type="submit" [disabled]="busy() || !canLog()">
          {{ busy() ? '…' : 'Log XP' }}
        </button>
      </form>

      @if (history().length) {
        <ul class="history" aria-label="Recent one-off tasks">
          @for (row of history(); track row.id) {
            <li>
              <span aria-hidden="true">{{ row.icon || '◆' }}</span>
              <div>
                <strong>{{ row.title }}</strong>
                <small>
                  {{ row.date === todayIso() ? 'Today' : formatDate(row.date) }}
                  · {{ skillLine(row) }}
                  · {{ formatDuration(row.durationMinutes) }}
                  · {{ row.xpAwarded | number }} XP
                </small>
              </div>
            </li>
          }
        </ul>
      }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      --rs-border: #8a7340;
      --rs-border-bright: #c6a85a;
      --rs-text: #f0e6c8;
      --rs-muted: #b8a878;
      --rs-accent: #d4a84b;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
    }
    .quick {
      display: grid;
      gap: 0.7rem;
      min-width: 0;
    }
    .head h3 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rs-accent);
    }
    .toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      width: 100%;
      margin: 0;
      padding: 0.15rem 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .toggle app-ui-icon {
      width: 0.95rem;
      height: 0.95rem;
      color: var(--rs-accent);
      transition: transform 0.15s ease;
    }
    .toggle[aria-expanded='true'] app-ui-icon {
      transform: rotate(180deg);
    }
    .toast {
      margin: 0;
      padding: 0.45rem 0.55rem;
      border: 1px solid var(--rs-border-bright);
      background: rgba(47, 143, 58, 0.16);
      font-size: 0.82rem;
    }
    .forge-form {
      display: grid;
      gap: 0.7rem;
      min-width: 0;
    }
    .forge-form > fieldset {
      margin: 0;
      padding: 0.75rem 0.85rem 0.9rem;
      border: 1px solid var(--rs-border);
      background: rgba(22, 18, 10, 0.42);
      display: grid;
      gap: 0.55rem;
      min-width: 0;
      min-inline-size: 0;
    }
    .forge-form > fieldset > legend {
      padding: 0 0.35rem;
      font-family: var(--font-display);
      font-size: 0.95rem;
      color: var(--rs-accent);
    }
    .forge-form input {
      box-sizing: border-box;
      width: 100%;
      padding: 0.45rem;
      border: 1px solid var(--rs-border);
      background: #1a1610;
      color: var(--rs-text);
      font: inherit;
    }
    .xp-preview {
      margin: 0;
      color: var(--rs-accent);
      font-size: 0.82rem;
    }
    .forge-form > button {
      justify-self: start;
      font-family: var(--font-display);
      padding: 0.5rem 0.85rem;
      border: 1px solid var(--rs-border-bright);
      background: rgba(212, 168, 75, 0.14);
      color: var(--rs-text);
      cursor: pointer;
    }
    .forge-form > button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .history {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.35rem;
    }
    .history li {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.45rem;
      align-items: start;
      padding: 0.4rem 0.45rem;
      border: 1px solid rgba(138, 115, 64, 0.45);
      background: rgba(18, 14, 8, 0.4);
    }
    .history strong {
      display: block;
      font-family: var(--font-display);
      font-size: 0.85rem;
    }
    .history small {
      color: var(--rs-muted);
      font-size: 0.75rem;
    }
    .compact .forge-form > fieldset {
      padding: 0.55rem 0.65rem 0.7rem;
    }
  `,
})
export class QuickTaskPanel implements OnInit {
  private readonly dailies = inject(DailiesService);
  private readonly skillsService = inject(SkillsService);
  private readonly character = inject(CharacterService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly timed = new TimedToast();

  readonly compact = input(false);
  readonly logged = output<void>();

  protected readonly toast = this.timed.value;
  protected readonly templates = signal<DailyTaskTemplate[]>([]);
  protected readonly history = signal<QuickTaskLog[]>([]);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly selectedCategory = signal<string | null>(null);
  protected readonly title = signal('');
  protected readonly skillWeights = signal<Array<{ slug: string; weight: number }>>([]);
  protected readonly effortLevel = signal(5);
  protected readonly durationMinutes = signal(5);
  protected readonly wealthAmount = signal('');
  protected readonly loadedTemplateId = signal(0);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly durationPresets = DURATION_PRESETS.slice(0, 8);
  protected readonly todayIso = this.character.todayIso;

  protected readonly categories = computed(
    () => this.skillTree()?.categories ?? [],
  );
  protected readonly allSkills = computed(() =>
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
  protected readonly previewXp = computed(() =>
    calculateDailyTaskXp({
      effortLevel: this.effortLevel(),
      durationMinutes: Math.max(1, this.durationMinutes()),
    }),
  );
  protected readonly weightShares = computed(() => {
    const xp = this.previewXp();
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
  protected readonly showWealth = computed(
    () =>
      boostsWealth(this.skillWeights()) ||
      parseMoneyToCents(this.wealthAmount()) > 0,
  );
  protected readonly canLog = computed(
    () => this.title().trim().length > 0 && this.weightsValid(),
  );

  ngOnInit(): void {
    this.dailies.listTemplates().subscribe({
      next: (rows) => this.templates.set(rows),
    });
    this.dailies.listQuick(8).subscribe({
      next: (rows) => this.history.set(rows),
    });
    this.skillsService.getTree().subscribe({
      next: (tree) => this.skillTree.set(tree),
    });
  }

  protected toggleOpen(): void {
    this.open.update((open) => !open);
  }

  protected applyTemplate(t: DailyTaskTemplate): void {
    this.title.set(t.name);
    this.skillWeights.set(dailySkillWeights(t));
    this.effortLevel.set(t.effortLevel);
    this.durationMinutes.set(Math.max(1, t.durationMinutes));
    this.loadedTemplateId.set(t.id);
    this.wealthAmount.set(centsToInput(t.wealthCents));
    this.selectedCategory.set(t.skill.category);
  }

  protected pickSkill(skill: Skill): void {
    this.setWeights(addSkillWeight(this.skillWeights(), skill.slug));
    this.selectedCategory.set(skill.category);
  }

  protected bumpSkillWeight(event: { slug: string; delta: number }): void {
    this.setWeights(
      bumpSkillWeight(this.skillWeights(), event.slug, event.delta),
    );
  }

  protected removeSkillWeight(slug: string): void {
    this.setWeights(removeSkillWeight(this.skillWeights(), slug));
  }

  protected setDuration(minutes: number | null): void {
    this.durationMinutes.set(Math.max(1, minutes ?? 5));
  }

  protected skillLine(row: QuickTaskLog): string {
    return dailySkillLine(row);
  }

  protected formatDuration(minutes: number): string {
    return formatTaskDuration(minutes);
  }

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
  }

  protected log(): void {
    if (!this.canLog() || this.busy()) {
      return;
    }
    const primary = this.allSkills().find(
      (s) => s.slug === primarySkillSlug(this.skillWeights()),
    );
    if (!primary) {
      this.timed.set('Pick skills first');
      return;
    }
    this.busy.set(true);
    this.dailies
      .logQuick({
        title: this.title().trim(),
        skillId: primary.id,
        skillWeights: this.skillWeights(),
        effortLevel: this.effortLevel(),
        durationMinutes: this.durationMinutes(),
        templateId: this.loadedTemplateId() || null,
        wealthCents: boostsWealth(this.skillWeights())
          ? parseMoneyToCents(this.wealthAmount())
          : 0,
      })
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.skillsService.invalidateTree();
          for (const award of result.awards ?? (result.award ? [result.award] : [])) {
            this.xpFeedback.publishAward(award);
          }
          this.history.update((rows) => [result.log, ...rows].slice(0, 8));
          this.resetForm();
          this.open.set(false);
          this.timed.set(`Logged · ${result.log.xpAwarded} XP`);
          this.logged.emit();
        },
        error: (err: { error?: { message?: string } }) => {
          this.busy.set(false);
          this.timed.set(err.error?.message ?? 'Could not log task');
        },
      });
  }

  private setWeights(rows: Array<{ slug: string; weight: number }>): void {
    this.skillWeights.set(rows);
  }

  private resetForm(): void {
    this.title.set('');
    this.skillWeights.set([]);
    this.effortLevel.set(5);
    this.durationMinutes.set(5);
    this.wealthAmount.set('');
    this.loadedTemplateId.set(0);
  }
}
