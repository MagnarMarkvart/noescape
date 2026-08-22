import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NumberField } from './number-field';

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

@Component({
  selector: 'app-duration-field',
  imports: [NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="duration">
      @if (legend()) {
        <legend>{{ legend() }}</legend>
      }
      <div class="picks">
        @if (allowUnset()) {
          <button
            type="button"
            class="chip"
            [class.selected]="minutes() == null && !custom()"
            (click)="unset()"
          >
            Unset
          </button>
        }
        @for (m of presets(); track m) {
          <button
            type="button"
            class="chip"
            [class.selected]="minutes() === m && !custom()"
            (click)="pickPreset(m)"
          >
            {{ labelOf(m) }}
          </button>
        }
        <button
          type="button"
          class="chip"
          [class.selected]="custom()"
          (click)="enableCustom()"
        >
          Custom
        </button>
      </div>
      @if (custom()) {
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
      }
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }
    .duration {
      display: grid;
      gap: 0.55rem;
      margin: 0;
      padding: 0.9rem 1rem 1.05rem;
      border: 1px solid #8a7340;
      background: rgba(22, 18, 10, 0.42);
      min-width: 0;
    }
    legend {
      padding: 0 0.4rem;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 1.05rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1.25;
      color: #d4a84b;
    }
    .picks {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .chip {
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.72rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #b8a878;
      cursor: pointer;
    }
    .chip.selected {
      border-color: #c6a85a;
      color: #d4a84b;
    }
    .hm {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
    }
    .hm label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.85rem;
      color: #b8a878;
    }
    .hm app-number-field {
      width: 4.5rem;
    }
  `,
})
export class DurationField {
  readonly minutes = input<number | null>(null);
  readonly presets = input<number[]>([]);
  readonly legend = input('Duration');
  readonly allowUnset = input(false);
  readonly maxHours = input(168);
  readonly minutesChange = output<number | null>();

  private readonly customOn = signal(false);

  protected readonly custom = computed(() => {
    if (this.customOn()) {
      return true;
    }
    const m = this.minutes();
    return m != null && !this.presets().includes(m);
  });

  protected readonly hours = computed(() =>
    Math.floor(Math.max(0, this.minutes() ?? 0) / 60),
  );
  protected readonly mins = computed(() => Math.max(0, this.minutes() ?? 0) % 60);

  protected labelOf(m: number): string {
    return formatMinutes(m);
  }

  protected unset(): void {
    this.customOn.set(false);
    this.minutesChange.emit(null);
  }

  protected pickPreset(m: number): void {
    this.customOn.set(false);
    this.minutesChange.emit(m);
  }

  protected enableCustom(): void {
    this.customOn.set(true);
    if (this.minutes() == null) {
      this.minutesChange.emit(45);
    }
  }

  protected setHours(hours: number): void {
    const cap = this.maxHours();
    const next = Math.min(cap, Math.max(0, hours));
    const mins = next >= cap ? 0 : this.mins();
    this.emitTotal(next * 60 + mins);
  }

  protected setMins(mins: number): void {
    this.emitTotal(this.hours() * 60 + Math.min(59, Math.max(0, mins)));
  }

  private emitTotal(total: number): void {
    const cap = Math.max(1, this.maxHours() * 60);
    this.customOn.set(true);
    this.minutesChange.emit(Math.max(1, Math.min(cap, total)));
  }
}
