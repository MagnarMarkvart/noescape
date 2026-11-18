import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { DurationField } from './duration-field';

export const ELAPSED_MINUTE_PRESETS = [15, 30, 45, 60, 90, 120];

@Component({
  selector: 'app-elapsed-complete',
  imports: [DurationField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-duration-field
      legend="Time spent"
      [inset]="true"
      [allowUnset]="true"
      unsetLabel="None"
      [minutes]="minutes()"
      [presets]="presets"
      (minutesChange)="minutesChange.emit($event)"
    />
    <div class="actions">
      <button
        type="button"
        class="confirm"
        [disabled]="busy()"
        (click)="confirm.emit()"
      >
        {{ busy() ? '…' : confirmLabel() }}
      </button>
      <button
        type="button"
        class="ghost"
        [disabled]="busy()"
        (click)="cancel.emit()"
      >
        Cancel
      </button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.55rem;
      flex: 1 1 100%;
      min-width: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .confirm,
    .ghost {
      font: inherit;
      cursor: pointer;
    }
    .confirm {
      background: linear-gradient(180deg, #49a455, #2f8f3a);
      border: 1px solid #246b2d;
      color: #f3fff2;
      padding: 0.45rem 0.85rem;
    }
    .ghost {
      background: transparent;
      border: 1px solid #8a7340;
      color: #b8a878;
      padding: 0.45rem 0.85rem;
    }
    .confirm:disabled,
    .ghost:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `,
})
export class ElapsedComplete {
  readonly minutes = input<number | null>(null);
  readonly busy = input(false);
  readonly confirmLabel = input('Complete');
  readonly minutesChange = output<number | null>();
  readonly confirm = output<void>();
  readonly cancel = output<void>();
  protected readonly presets = ELAPSED_MINUTE_PRESETS;
}
