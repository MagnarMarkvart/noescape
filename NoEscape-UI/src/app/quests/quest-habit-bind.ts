import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NumberField } from '../shared/ui/number-field';
import {
  HabitQuestRule,
  HabitView,
} from '../habits/habits.service';

@Component({
  selector: 'app-quest-habit-bind',
  imports: [NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      Habit
      <select
        [value]="habitId() ?? 0"
        (change)="onHabit($any($event.target).value)"
      >
        <option [value]="0">— none —</option>
        @for (h of choices(); track h.id) {
          <option [value]="h.id">{{ h.icon || '◆' }} {{ h.name }}</option>
        }
      </select>
    </label>
    @if (habitId()) {
      <p class="hint">
        Completion is counted from this habit’s logs. Pick count, streak, or window.
      </p>
      <div class="chip-row">
        <button
          type="button"
          class="chip"
          [class.selected]="rule() === 'COUNT'"
          (click)="ruleChange.emit('COUNT')"
        >
          Count
        </button>
        <button
          type="button"
          class="chip"
          [class.selected]="rule() === 'STREAK'"
          (click)="ruleChange.emit('STREAK')"
        >
          Streak
        </button>
        <button
          type="button"
          class="chip"
          [class.selected]="rule() === 'WINDOW'"
          (click)="ruleChange.emit('WINDOW')"
        >
          Window
        </button>
      </div>
      <div class="inline-add">
        <label>
          Need
          <app-number-field
            ariaLabel="Required successes"
            [min]="1"
            [max]="365"
            [value]="requiredCount()"
            (valueChange)="requiredCountChange.emit($event)"
          />
        </label>
        @if (rule() === 'WINDOW') {
          <label>
            Days
            <app-number-field
              ariaLabel="Window days"
              [min]="1"
              [max]="365"
              [value]="windowDays()"
              (valueChange)="windowDaysChange.emit($event)"
            />
          </label>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.55rem;
    }
    label {
      display: grid;
      gap: 0.3rem;
      color: #b8a878;
      font-size: 0.85rem;
    }
    select {
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      padding: 0.55rem 0.65rem;
      border: 1px solid #8a7340;
      background: #1a1610;
      color: #f0e6c8;
      font: inherit;
    }
    .hint {
      margin: 0;
      color: #b8a878;
      font-size: 0.82rem;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .chip {
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.75rem;
      padding: 0.28rem 0.55rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #b8a878;
      cursor: pointer;
    }
    .chip.selected {
      border-color: #c6a85a;
      color: #d4a84b;
    }
    .inline-add {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      align-items: end;
    }
  `,
})
export class QuestHabitBind {
  readonly habits = input<HabitView[]>([]);
  readonly takenIds = input<number[]>([]);
  readonly habitId = input<number | null>(null);
  readonly rule = input<HabitQuestRule>('COUNT');
  readonly requiredCount = input(1);
  readonly windowDays = input(7);

  readonly habitIdChange = output<number | null>();
  readonly ruleChange = output<HabitQuestRule>();
  readonly requiredCountChange = output<number>();
  readonly windowDaysChange = output<number>();

  protected readonly choices = computed(() => {
    const taken = new Set(this.takenIds());
    const current = this.habitId();
    return this.habits().filter((h) => h.id === current || !taken.has(h.id));
  });

  protected onHabit(raw: string): void {
    const id = Number(raw);
    this.habitIdChange.emit(Number.isFinite(id) && id > 0 ? id : null);
  }
}
