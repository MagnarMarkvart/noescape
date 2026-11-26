import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DailyTaskSlot,
  DailyVerdict,
  TaskImportance,
  dailySkillLine,
  formatTaskDuration,
} from './daily.model';
import {
  DAY_TASK_GOAL,
  DAY_TIME_GOAL_MINUTES,
  actualTaskMinutes,
  actualTimeSummary,
  formatAssignedHours,
  formatTimeDelta,
} from './day-score';

const IMPORTANCE_LABEL: Record<TaskImportance, string> = {
  MOST_IMPORTANT: 'Most important',
  IMPORTANT: 'Important',
  REGULAR: 'Regular',
};

@Component({
  selector: 'app-daily-day-card',
  imports: [DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [attr.data-grade]="verdict().grade">
      <header class="head">
        <p class="kicker">
          {{ kicker() }}
          @if (verdict().weekend) {
            · Weekend
          }
        </p>
        <h2>{{ verdict().label }}</h2>
        <p class="score">{{ verdict().score }}</p>
      </header>
      <p class="summary">{{ verdict().summary }}</p>

      <dl class="facts">
        <div>
          <dt>Tasks set</dt>
          <dd>{{ verdict().filledCount }} / {{ verdict().taskGoal ?? taskGoal }}</dd>
        </div>
        <div>
          <dt>Timed</dt>
          <dd>{{ verdict().trackedCount }} / {{ verdict().filledCount }}</dd>
        </div>
        <div>
          <dt>Done</dt>
          <dd>{{ verdict().completedCount }} / {{ verdict().filledCount }}</dd>
        </div>
        <div>
          <dt>Assigned</dt>
          <dd>
            {{ formatHours(verdict().assignedMinutes) }}
            / {{ formatHours(verdict().timeGoalMinutes ?? timeGoal) }}
          </dd>
        </div>
        <div>
          <dt>Load</dt>
          <dd>{{ verdict().loadMet ? 'Bar met' : 'Light load' }}</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd>{{ earnedXp() | number }}</dd>
        </div>
      </dl>

      @if (tasks().length) {
        <section class="spent" aria-label="Time actually spent" [attr.data-state]="spentState()">
          <p class="spent-label">Time spent</p>
          <p class="spent-main">
            <strong>{{ formatHours(actual().actualMinutes) }}</strong>
            <span class="of">of {{ formatHours(actual().goalMinutes) }}</span>
            <span class="delta">— {{ goalDelta() }}</span>
          </p>
          <div class="spent-bar" aria-hidden="true">
            <span [style.width.%]="spentPercent()"></span>
          </div>
          <p class="spent-sub">
            Planned {{ formatHours(actual().plannedMinutes) }}
            · {{ plannedDelta() }}
            @if (actual().assumedCount > 0) {
              · {{ actual().assumedCount }} assumed at planned time
            }
          </p>
        </section>
      }

      @if (tasks().length) {
        <ul class="tasks">
          @for (slot of tasks(); track slot.importance + ':' + slot.slotIndex) {
            <li [class.done]="slot.completed" [class.miss]="!slot.completed">
              <span class="mark" aria-hidden="true">{{ slot.completed ? '✓' : '○' }}</span>
              <span class="body">
                <strong>{{ slot.title }}</strong>
                <span class="meta">
                  {{ importanceLabel(slot.importance) }}
                  @if (skillLine(slot); as skills) {
                    · {{ skills }}
                  }
                </span>
                <span class="time-row">
                  <span>Planned {{ formatDuration(slot.durationMinutes) }}</span>
                  @if (taskActual(slot); as spent) {
                    <span class="actual" [class.assumed]="spent.assumed">
                      Actual {{ spent.label }}{{ spent.assumed ? ' (assumed)' : '' }}
                    </span>
                  }
                </span>
              </span>
            </li>
          }
        </ul>
      }

      @if (showBoardLink() && date()) {
        <a class="board-link" routerLink="/dailies" [queryParams]="{ date: date() }">
          Open board →
        </a>
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
      --rs-border: #8a7340;
      --rs-text: #f0e6c8;
      --rs-muted: #b8a878;
      --rs-accent: #d4a84b;
      --rs-ok: #2f8f3a;
      --rs-warn: #d4893a;
      --rs-bad: #c45c4a;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
    }

    .card {
      padding: 1rem 1.1rem 1.15rem;
      border: 1px solid var(--rs-border);
      background:
        linear-gradient(180deg, rgba(74, 61, 40, 0.42), rgba(30, 24, 14, 0.78));
      color: var(--rs-text);
    }

    .card[data-grade='poor'] { border-color: var(--rs-bad); }
    .card[data-grade='average'] { border-color: var(--rs-warn); }
    .card[data-grade='strong'],
    .card[data-grade='peak'] { border-color: var(--rs-ok); }

    .head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.15rem 0.75rem;
      align-items: end;
    }

    .kicker {
      grid-column: 1;
      margin: 0;
      font-size: 0.7rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }

    h2 {
      grid-column: 1;
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.45rem;
      letter-spacing: 0.04em;
      color: var(--rs-accent);
    }

    .score {
      grid-column: 2;
      grid-row: 1 / span 2;
      margin: 0;
      font-family: var(--font-display);
      font-size: 2.1rem;
      line-height: 1;
      color: var(--rs-accent);
    }

    .card[data-grade='poor'] .score,
    .card[data-grade='poor'] h2 { color: var(--rs-bad); }
    .card[data-grade='average'] .score,
    .card[data-grade='average'] h2 { color: var(--rs-warn); }
    .card[data-grade='strong'] .score,
    .card[data-grade='strong'] h2,
    .card[data-grade='peak'] .score,
    .card[data-grade='peak'] h2 { color: #6ecf6a; }

    .summary {
      margin: 0.55rem 0 0;
      color: var(--rs-muted);
      font-size: 0.92rem;
      line-height: 1.45;
    }

    .facts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.55rem 0.7rem;
      margin: 0.9rem 0 0;
    }

    .facts div { margin: 0; }

    dt {
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }

    dd {
      margin: 0.15rem 0 0;
      font-family: var(--font-display);
      font-size: 1.05rem;
      color: var(--rs-accent);
    }

    .tasks {
      list-style: none;
      margin: 0.95rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.35rem;
    }

    .tasks li {
      display: grid;
      grid-template-columns: 1.1rem 1fr;
      gap: 0.45rem;
      align-items: start;
      padding: 0.35rem 0.45rem;
      border: 1px solid rgba(138, 115, 64, 0.35);
      background: rgba(16, 12, 8, 0.35);
    }

    .tasks li.done .mark { color: var(--rs-ok); }
    .tasks li.miss .mark { color: var(--rs-bad); }

    .body { display: grid; gap: 0.12rem; }
    .body strong { font-size: 0.92rem; }
    .meta { color: var(--rs-muted); font-size: 0.78rem; }

    .time-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.15rem 0.7rem;
      font-size: 0.78rem;
      color: var(--rs-muted);
    }
    .time-row .actual { color: var(--rs-accent); }
    .time-row .actual.assumed { color: var(--rs-muted); font-style: italic; }

    .spent {
      margin: 0.95rem 0 0;
      padding: 0.7rem 0.8rem;
      border: 1px solid rgba(212, 168, 75, 0.45);
      background: rgba(16, 12, 8, 0.45);
      min-width: 0;
    }
    .spent-label {
      margin: 0;
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }
    .spent-main {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.2rem 0.45rem;
      margin: 0.2rem 0 0;
      font-family: var(--font-display);
      color: var(--rs-accent);
    }
    .spent-main strong { font-size: 1.5rem; font-weight: 600; }
    .spent-main .of { font-size: 1rem; color: var(--rs-text); }
    .spent-main .delta { font-size: 0.95rem; }
    .spent[data-state='short'] .delta { color: var(--rs-bad); }
    .spent[data-state='met'] .delta { color: #6ecf6a; }
    .spent-bar {
      height: 6px;
      margin: 0.5rem 0 0;
      border: 1px solid rgba(138, 115, 64, 0.6);
      background: rgba(0, 0, 0, 0.35);
      overflow: hidden;
    }
    .spent-bar span {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #8a7340, var(--rs-accent));
    }
    .spent[data-state='met'] .spent-bar span {
      background: linear-gradient(90deg, #2f8f3a, #6ecf6a);
    }
    .spent-sub {
      margin: 0.45rem 0 0;
      font-size: 0.8rem;
      color: var(--rs-muted);
      line-height: 1.4;
    }

    .board-link {
      display: inline-block;
      margin-top: 0.85rem;
      color: var(--rs-accent);
      font-size: 0.88rem;
    }

    @media (max-width: 640px) {
      .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class DailyDayCard {
  readonly verdict = input.required<DailyVerdict>();
  readonly tasks = input<DailyTaskSlot[]>([]);
  readonly earnedXp = input(0);
  readonly date = input('');
  readonly showBoardLink = input(false);
  readonly kicker = input('Sealed day');

  protected readonly taskGoal = DAY_TASK_GOAL;
  protected readonly timeGoal = DAY_TIME_GOAL_MINUTES;
  protected readonly formatHours = formatAssignedHours;
  protected readonly formatDuration = formatTaskDuration;
  protected readonly skillLine = dailySkillLine;

  protected readonly actual = computed(() =>
    actualTimeSummary(
      this.tasks(),
      this.verdict().timeGoalMinutes ?? DAY_TIME_GOAL_MINUTES,
    ),
  );
  protected readonly goalDelta = computed(() =>
    formatTimeDelta(this.actual().deltaGoalMinutes),
  );
  protected readonly plannedDelta = computed(() => {
    const delta = this.actual().deltaPlannedMinutes;
    return delta === 0
      ? 'as planned'
      : formatTimeDelta(delta, 'under plan').replace(' over', ' over plan');
  });
  protected readonly spentState = computed(() =>
    this.actual().deltaGoalMinutes >= 0 ? 'met' : 'short',
  );
  protected readonly spentPercent = computed(() => {
    const { actualMinutes, goalMinutes } = this.actual();
    return goalMinutes > 0
      ? Math.min(100, Math.round((actualMinutes / goalMinutes) * 100))
      : 0;
  });

  protected taskActual(
    slot: DailyTaskSlot,
  ): { label: string; assumed: boolean } | null {
    const spent = actualTaskMinutes(slot);
    if (!slot.completed && spent.minutes === 0) {
      return null;
    }
    return { label: formatTaskDuration(spent.minutes), assumed: spent.assumed };
  }

  protected importanceLabel(importance: TaskImportance): string {
    return IMPORTANCE_LABEL[importance] ?? importance;
  }
}
