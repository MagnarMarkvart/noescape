import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CharacterService } from '../../character/character.service';
import { RuneCalendar } from '../rune-calendar';
import { NumberField } from './number-field';
import { UiIcon } from './ui-icon';
import { UiPop } from './ui-pop';

@Component({
  selector: 'app-forge-line',
  imports: [RuneCalendar, NumberField, UiIcon, UiPop],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="line">
      <input
        type="text"
        class="title"
        [value]="title()"
        [placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        (input)="onTitle($event)"
        (keydown.enter)="$event.preventDefault(); tryCommit()"
      />
      <div class="ops">
        <app-ui-pop
          #datePop
          icon="calendar"
          [label]="dateLabel()"
          [active]="!!deadline()"
        >
          <app-rune-calendar
            [selected]="deadline() ?? ''"
            [today]="today()"
            [viewMonth]="calendarMonth()"
            [weekStartsOn]="character.weekStartsOn()"
            (selectedChange)="pickDate($event); datePop.close()"
            (viewMonthChange)="viewMonth.set($event)"
          />
          @if (deadline()) {
            <button type="button" class="ghost" (click)="pickDate(''); datePop.close()">
              Clear date
            </button>
          }
        </app-ui-pop>
        <app-ui-pop
          icon="stopwatch"
          [label]="timeLabel()"
          [active]="estimateMinutes() != null"
        >
          <p class="pop-kicker">Estimated time</p>
          <div class="hm">
            <label>
              Hours
              <app-number-field
                ariaLabel="Hours"
                [min]="0"
                [max]="maxHours()"
                [value]="hours()"
                (valueChange)="setHours($event)"
              />
            </label>
            <label>
              Minutes
              <app-number-field
                ariaLabel="Minutes"
                [min]="0"
                [max]="59"
                [value]="mins()"
                (valueChange)="setMins($event)"
              />
            </label>
          </div>
          @if (estimateMinutes() != null) {
            <button type="button" class="ghost" (click)="clearTime()">
              Unset
            </button>
          }
        </app-ui-pop>
        <button
          type="button"
          class="icon-btn"
          [class.on]="gates()"
          [attr.aria-pressed]="gates()"
          aria-label="Gate"
          title="Gate"
          (click)="gatesChange.emit(!gates())"
        >
          <app-ui-icon name="gate" [filled]="gates()" />
        </button>
        @if (action() === 'commit') {
          <button
            type="button"
            class="icon-btn"
            [disabled]="!canCommit()"
            aria-label="Add"
            title="Add"
            (click)="tryCommit()"
          >
            <app-ui-icon name="check" />
          </button>
        } @else {
          <app-ui-pop #removePop icon="close" label="Remove">
            <p class="pop-kicker">Remove this row?</p>
            <div class="confirm">
              <button type="button" class="ghost" (click)="removePop.close()">
                Cancel
              </button>
              <button type="button" class="danger" (click)="remove.emit()">
                Confirm
              </button>
            </div>
          </app-ui-pop>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
    }
    .title {
      box-sizing: border-box;
      flex: 1 1 auto;
      min-width: 0;
      height: 1.9rem;
      padding: 0.2rem 0.5rem;
      border: 1px solid #8a7340;
      background: #1a1610;
      color: #f0e6c8;
      font: inherit;
    }
    .title:focus-visible {
      border-color: #c6a85a;
      outline: none;
    }
    .ops {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.2rem;
    }
    .icon-btn {
      box-sizing: border-box;
      width: 1.9rem;
      height: 1.9rem;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid #8a7340;
      background: rgba(26, 20, 8, 0.55);
      color: #b8a878;
      cursor: pointer;
    }
    .icon-btn:hover,
    .icon-btn:focus-visible {
      border-color: #c6a85a;
      color: #e0c06a;
      outline: none;
    }
    .icon-btn.on {
      color: #d4a84b;
      border-color: #c6a85a;
      background: rgba(212, 168, 75, 0.18);
    }
    .icon-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .icon-btn app-ui-icon {
      width: 1.05rem;
      height: 1.05rem;
    }
    .pop-kicker {
      margin: 0 0 0.45rem;
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #b8a878;
    }
    .hm {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
    }
    .hm label {
      display: grid;
      gap: 0.2rem;
      font-size: 0.8rem;
      color: #b8a878;
    }
    .hm app-number-field {
      width: 4.2rem;
    }
    .ghost,
    .danger {
      margin-top: 0.5rem;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.75rem;
      padding: 0.28rem 0.5rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #b8a878;
      cursor: pointer;
    }
    .ghost:hover,
    .danger:hover,
    .ghost:focus-visible,
    .danger:focus-visible {
      border-color: #c6a85a;
      color: #d4a84b;
      outline: none;
    }
    .danger {
      color: #f0e6c8;
      border-color: #c45c4a;
      background: rgba(196, 92, 74, 0.18);
    }
    .confirm {
      display: flex;
      justify-content: flex-end;
      gap: 0.4rem;
    }
    .confirm .ghost,
    .confirm .danger {
      margin-top: 0;
    }
  `,
})
export class ForgeLine {
  protected readonly character = inject(CharacterService);

  readonly title = input('');
  readonly placeholder = input('Title');
  readonly deadline = input<string | null>(null);
  readonly estimateMinutes = input<number | null>(null);
  readonly gates = input(false);
  readonly action = input<'commit' | 'remove'>('remove');
  readonly maxHours = input(24);

  readonly titleChange = output<string>();
  readonly deadlineChange = output<string | null>();
  readonly estimateChange = output<number | null>();
  readonly gatesChange = output<boolean>();
  readonly commit = output<void>();
  readonly remove = output<void>();

  protected readonly today = computed(() => this.character.todayIso());
  protected readonly viewMonth = signal('');
  protected readonly calendarMonth = computed(
    () => this.viewMonth() || this.deadline() || this.today(),
  );
  protected readonly canCommit = computed(() => this.title().trim().length > 0);
  protected readonly hours = computed(() =>
    Math.floor(Math.max(0, this.estimateMinutes() ?? 0) / 60),
  );
  protected readonly mins = computed(() =>
    Math.max(0, this.estimateMinutes() ?? 0) % 60,
  );
  protected readonly dateLabel = computed(() => {
    const iso = this.deadline();
    return iso ? `Deadline ${this.character.formatDate(iso)}` : 'Deadline';
  });
  protected readonly timeLabel = computed(() => {
    const m = this.estimateMinutes();
    if (m == null || m <= 0) {
      return 'Estimated time';
    }
    if (m < 60) {
      return `Estimated ${m}m`;
    }
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `Estimated ${h}h ${rest}m` : `Estimated ${h}h`;
  });

  protected onTitle(event: Event): void {
    this.titleChange.emit((event.target as HTMLInputElement).value);
  }

  protected tryCommit(): void {
    if (this.action() === 'commit' && this.canCommit()) {
      this.commit.emit();
    }
  }

  protected pickDate(iso: string): void {
    const next = iso.trim();
    this.deadlineChange.emit(next || null);
    this.viewMonth.set(next || this.today());
  }

  protected setHours(hours: number): void {
    this.emitTime(hours, this.mins());
  }

  protected setMins(mins: number): void {
    this.emitTime(this.hours(), mins);
  }

  protected clearTime(): void {
    this.estimateChange.emit(null);
  }

  private emitTime(hours: number, mins: number): void {
    const cap = Math.max(1, this.maxHours() * 60);
    const total = Math.min(cap, Math.max(0, hours) * 60 + Math.max(0, mins));
    this.estimateChange.emit(total > 0 ? total : null);
  }
}
