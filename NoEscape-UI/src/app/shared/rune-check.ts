import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/** Ancient-tablet checkbox used across No Escape (Remember, gates, settings). */
@Component({
  selector: 'app-rune-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="rune-check">
      <input
        type="checkbox"
        [checked]="checked()"
        [disabled]="disabled()"
        (change)="onChange($event)"
      />
      <span class="seal" aria-hidden="true"></span>
      <span class="caption">
        @if (label()) {
          {{ label() }}
        }
        <ng-content />
      </span>
    </label>
  `,
  host: {
    '[class.is-disabled]': 'disabled()',
  },
  styles: `
    :host {
      --rc-border: #8a7340;
      --rc-bright: #c6a85a;
      --rc-gold: #d4a84b;
      --rc-ink: #1a1408;
      --rc-muted: #b8a878;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }

    :host.is-disabled {
      opacity: 0.55;
      pointer-events: none;
    }

    .rune-check {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      user-select: none;
    }

    input {
      position: absolute;
      inset: 0 auto 0 0;
      width: 1.2rem;
      height: 1.2rem;
      margin: 0;
      opacity: 0;
      cursor: pointer;
    }

    .seal {
      flex: 0 0 auto;
      width: 1.15rem;
      height: 1.15rem;
      border: 1px solid var(--rc-border);
      background:
        linear-gradient(180deg, rgba(212, 168, 75, 0.16), rgba(18, 14, 8, 0.92));
      box-shadow:
        inset 0 1px 0 rgba(240, 230, 200, 0.12),
        inset 0 0 0 1px rgba(26, 20, 8, 0.55),
        0 0 0 1px rgba(138, 115, 64, 0.2);
      position: relative;
    }

    .seal::before {
      content: '';
      position: absolute;
      inset: 3px;
      border: 1px solid rgba(138, 115, 64, 0.35);
      pointer-events: none;
    }

    .seal::after {
      content: '';
      position: absolute;
      left: 0.28rem;
      top: 0.08rem;
      width: 0.28rem;
      height: 0.55rem;
      border: solid transparent;
      border-width: 0 2px 2px 0;
      transform: rotate(40deg);
      opacity: 0;
    }

    input:checked + .seal {
      border-color: var(--rc-bright);
      background: linear-gradient(180deg, #e8cc78, var(--rc-gold) 55%, #b88830);
      box-shadow:
        inset 0 1px 0 rgba(255, 244, 210, 0.45),
        0 0 8px rgba(212, 168, 75, 0.35);
    }

    input:checked + .seal::after {
      border-color: var(--rc-ink);
      opacity: 1;
    }

    input:focus-visible + .seal {
      outline: 1px solid var(--rc-bright);
      outline-offset: 2px;
    }

    .caption {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem 0.45rem;
      color: var(--rc-muted);
      font-family: var(--font-display);
      font-size: 0.82rem;
      letter-spacing: 0.06em;
    }
  `,
})
export class RuneCheck {
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly label = input('');
  readonly checkedChange = output<boolean>();

  protected onChange(event: Event): void {
    this.checkedChange.emit((event.target as HTMLInputElement).checked);
  }
}
