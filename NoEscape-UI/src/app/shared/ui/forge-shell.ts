import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UiIconBtn } from './ui-icon-btn';

@Component({
  selector: 'app-forge-shell',
  imports: [UiIconBtn],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.embedded]': 'embedded()',
  },
  template: `
    <section class="forge" [class.wide]="layout() === 'wide'">
      <header class="toolbar">
        <div>
          <p class="kicker">{{ kicker() }}</p>
          <h1>{{ title() }}</h1>
          @if (lede()) {
            <p class="lede">{{ lede() }}</p>
          }
        </div>
        @if (backHref()) {
          <app-ui-icon-btn
            icon="back"
            [label]="backLabel()"
            [href]="backHref()!"
            [queryParams]="backQuery()"
          />
        }
        <ng-content select="[forgeToolbar]" />
      </header>
      @if (toast()) {
        <p class="toast" role="status">{{ toast() }}</p>
      }
      <ng-content />
    </section>
  `,
  styles: `
    :host {
      --rs-bg: #2b2518;
      --rs-border: #8a7340;
      --rs-border-bright: #c6a85a;
      --rs-text: #f0e6c8;
      --rs-muted: #b8a878;
      --rs-accent: #d4a84b;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      --font-body: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: block;
      min-height: 100dvh;
      max-width: 100%;
      overflow-x: clip;
      color: var(--rs-text);
      font-family: var(--font-body);
      background:
        radial-gradient(ellipse at 70% 0%, rgba(212, 168, 75, 0.1), transparent 42%),
        linear-gradient(180deg, #1c1810 0%, var(--rs-bg) 45%, #221c12 100%);
    }
    :host.embedded {
      min-height: 0;
      background: none;
      overflow: visible;
    }
    .forge {
      width: min(32rem, 100%);
      max-width: 100%;
      min-width: 0;
      padding: 0.85rem 1rem 2rem;
      box-sizing: border-box;
    }
    .forge.wide {
      width: min(40rem, 100%);
    }
    :host.embedded .forge {
      width: 100%;
      padding: 0;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: start;
      margin-bottom: 1rem;
    }
    .kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }
    h1 {
      margin: 0.2rem 0 0;
      font-family: var(--font-display);
      font-size: clamp(1.5rem, 3vw, 2rem);
      color: var(--rs-accent);
      font-weight: 500;
    }
    .lede {
      margin: 0.4rem 0 0;
      color: var(--rs-muted);
      font-size: 0.9rem;
    }
    .toast {
      padding: 0.65rem 0.85rem;
      margin-bottom: 0.85rem;
      border: 1px solid var(--rs-border-bright);
      background: rgba(47, 143, 58, 0.16);
    }
    :host ::ng-deep form,
    :host ::ng-deep .create,
    :host ::ng-deep .forge-form {
      min-width: 0;
      max-width: 100%;
      width: 100%;
    }
    :host ::ng-deep form > fieldset,
    :host ::ng-deep .create > fieldset,
    :host ::ng-deep .forge-form > fieldset {
      margin: 0;
      padding: 0.9rem 1rem 1.05rem;
      border: 1px solid var(--rs-border);
      background: rgba(22, 18, 10, 0.42);
      display: grid;
      gap: 0.7rem;
      min-width: 0;
      min-inline-size: 0;
      max-width: 100%;
      box-sizing: border-box;
    }
    :host ::ng-deep form input,
    :host ::ng-deep form select,
    :host ::ng-deep form textarea,
    :host ::ng-deep .create input,
    :host ::ng-deep .create select,
    :host ::ng-deep .create textarea,
    :host ::ng-deep .forge-form input,
    :host ::ng-deep .forge-form select,
    :host ::ng-deep .forge-form textarea {
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-width: 0;
    }
    :host ::ng-deep form > fieldset > legend,
    :host ::ng-deep .create > fieldset > legend,
    :host ::ng-deep .forge-form > fieldset > legend {
      float: none;
      width: auto;
      margin: 0 0 0.15rem;
      padding: 0 0.4rem;
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1.25;
      color: var(--rs-accent);
    }
    :host ::ng-deep form > fieldset > label,
    :host ::ng-deep .forge-form > fieldset > label {
      display: grid;
      gap: 0.3rem;
      font-size: 0.82rem;
      color: var(--rs-muted);
    }
  `,
})
export class ForgeShell {
  readonly kicker = input.required<string>();
  readonly title = input.required<string>();
  readonly lede = input('');
  readonly backHref = input<string | null>(null);
  readonly backQuery = input<Record<string, string>>({});
  readonly backLabel = input('Back');
  readonly toast = input<string | null>(null);
  readonly layout = input<'narrow' | 'wide'>('narrow');
  readonly embedded = input(false);
}
