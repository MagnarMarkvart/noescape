import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiIcon, UiIconName } from './ui-icon';

@Component({
  selector: 'app-ui-icon-btn',
  imports: [RouterLink, UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.round]': 'round()',
  },
  template: `
    @if (href()) {
      <a
        class="icon-btn"
        [routerLink]="href()!"
        [queryParams]="queryParams()"
        [attr.aria-label]="label()"
        [attr.title]="label()"
      >
        <app-ui-icon [name]="icon()" />
      </a>
    } @else {
      <button
        type="button"
        class="icon-btn"
        [attr.aria-label]="label()"
        [attr.title]="label()"
        [attr.aria-pressed]="pressed()"
        [attr.aria-expanded]="expanded()"
        [disabled]="disabled()"
        (click)="clicked.emit()"
      >
        <app-ui-icon [name]="icon()" />
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      box-sizing: border-box;
      width: 2.35rem;
      height: 2.35rem;
    }
    :host.round .icon-btn {
      border-radius: 50%;
    }
    :host.trail {
      width: 100%;
    }
    :host.trail .icon-btn {
      width: 100%;
    }
    @media (max-width: 600px) {
      :host,
      :host.trail {
        width: 2.35rem;
        height: 2.35rem;
        flex: 0 0 2.35rem;
      }
      :host.trail .icon-btn {
        width: 2.35rem;
        height: 2.35rem;
      }
    }
    .icon-btn {
      box-sizing: border-box;
      width: 2.35rem;
      height: 2.35rem;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid #8a7340;
      background: rgba(26, 20, 8, 0.55);
      color: #d4a84b;
      text-decoration: none;
      cursor: pointer;
      font: inherit;
    }
    .icon-btn:hover,
    .icon-btn:focus-visible {
      border-color: #c6a85a;
      color: #e0c06a;
      outline: none;
    }
    .icon-btn[aria-pressed='true'],
    .icon-btn[aria-expanded='true'] {
      background: rgba(212, 168, 75, 0.16);
      border-color: #c6a85a;
    }
    .icon-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    app-ui-icon {
      width: 1.2rem;
      height: 1.2rem;
    }
  `,
})
export class UiIconBtn {
  readonly icon = input.required<UiIconName>();
  readonly label = input.required<string>();
  readonly href = input<string | null>(null);
  readonly queryParams = input<Record<string, string>>({});
  readonly pressed = input<boolean | null>(null);
  readonly expanded = input<boolean | null>(null);
  readonly disabled = input(false);
  readonly round = input(false);
  readonly clicked = output<void>();
}
