import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-ui-confirm',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="veil" (click)="dismiss.emit()">
      <article
        class="card"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId()"
        [attr.aria-describedby]="bodyId()"
        (click)="$event.stopPropagation()"
      >
        @if (kicker()) {
          <p class="kicker">{{ kicker() }}</p>
        }
        <h2 [id]="titleId()">{{ title() }}</h2>
        <p [id]="bodyId()">{{ body() }}</p>
        @if (penalty() > 0) {
          <p class="penalty">−{{ penalty() | number }} Focus XP</p>
        }
        <div class="actions">
          <button type="button" class="ghost" (click)="secondary.emit()">
            {{ cancelLabel() }}
          </button>
          <button
            type="button"
            [class.danger]="tone() === 'danger'"
            [class.primary]="tone() === 'accent'"
            (click)="confirm.emit()"
            [disabled]="busy()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </article>
    </div>
  `,
  host: {
    '(document:keydown.escape)': 'dismiss.emit()',
  },
  styles: `
    :host {
      --ink: #f0e6c8;
      --muted: #b8a878;
      --gold: #d4a84b;
      --bright: #c6a85a;
      --danger: #c45c4a;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      --font-body: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .veil {
      position: fixed;
      inset: 0;
      z-index: 140;
      display: grid;
      place-items: center;
      padding: 1.25rem;
      background: rgba(8, 6, 3, 0.72);
    }
    .card {
      width: min(26rem, 100%);
      padding: 1.25rem 1.35rem 1.15rem;
      color: var(--ink);
      font-family: var(--font-body);
      border: 1px solid var(--bright);
      background:
        linear-gradient(180deg, rgba(74, 61, 40, 0.92), rgba(28, 22, 12, 0.96));
      box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, 0.4),
        0 18px 40px rgba(0, 0, 0, 0.45);
    }
    .kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
    }
    h2 {
      margin: 0.35rem 0 0;
      font-family: var(--font-display);
      font-size: 1.35rem;
      letter-spacing: 0.04em;
      color: var(--gold);
      font-weight: 500;
    }
    p {
      margin: 0.65rem 0 0;
      color: var(--ink);
      line-height: 1.45;
    }
    .penalty {
      color: var(--danger);
      font-family: var(--font-display);
      letter-spacing: 0.04em;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
      margin: 1.1rem 0 0;
    }
    .ghost,
    .danger,
    .primary {
      font-family: var(--font-display);
      font-size: 0.85rem;
      padding: 0.45rem 0.75rem;
      border: 1px solid var(--bright);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .ghost:hover,
    .ghost:focus-visible {
      color: var(--gold);
    }
    .primary {
      color: var(--ink);
      background: rgba(212, 168, 75, 0.16);
    }
    .danger {
      color: var(--ink);
      background: linear-gradient(180deg, #8a4034, #6a2c24);
      border-color: var(--danger);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
})
export class UiConfirm {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly kicker = input('Horologium');
  readonly cancelLabel = input('Cancel');
  readonly confirmLabel = input('Confirm');
  readonly penalty = input(0);
  readonly tone = input<'danger' | 'accent'>('danger');
  readonly busy = input(false);
  readonly titleId = input('ui-confirm-title');
  readonly bodyId = input('ui-confirm-body');
  readonly dismiss = output<void>();
  readonly secondary = output<void>();
  readonly confirm = output<void>();
}
