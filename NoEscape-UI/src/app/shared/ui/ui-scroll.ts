import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-ui-scroll',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="veil" [class.top]="layer() === 'top'" (click)="closed.emit()">
      <article
        class="scroll"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId()"
        (click)="$event.stopPropagation()"
      >
        <span class="corner tl" aria-hidden="true"></span>
        <span class="corner tr" aria-hidden="true"></span>
        <span class="corner bl" aria-hidden="true"></span>
        <span class="corner br" aria-hidden="true"></span>
        <header class="head">
          <div>
            @if (kicker()) {
              <p class="kicker">{{ kicker() }}</p>
            }
            <h2 [id]="titleId()">{{ title() }}</h2>
          </div>
          <button type="button" class="ghost" (click)="closed.emit()">Close</button>
        </header>
        <div class="body">
          <ng-content />
        </div>
      </article>
    </div>
  `,
  host: {
    '(document:keydown.escape)': 'closed.emit()',
  },
  styles: `
    :host {
      --ink: #f0e6c8;
      --muted: #b8a878;
      --gold: #d4a84b;
      --bright: #e0c06a;
      --border: #8a7340;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      --font-body: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .veil {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: grid;
      place-items: center;
      padding: 1.15rem;
      background: rgba(8, 6, 3, 0.78);
    }
    .veil.top {
      z-index: 130;
    }
    .scroll {
      position: relative;
      width: min(36rem, 100%);
      max-height: min(92dvh, 48rem);
      overflow: auto;
      padding: 1.45rem 1.4rem 1.3rem;
      color: var(--ink);
      font-family: var(--font-body);
      border: 1px solid var(--bright);
      background:
        radial-gradient(ellipse at 20% 0%, rgba(212, 168, 75, 0.16), transparent 46%),
        linear-gradient(180deg, rgba(74, 61, 40, 0.96), rgba(22, 18, 10, 0.98));
      box-shadow:
        inset 0 0 0 1px rgba(18, 14, 8, 0.7),
        0 24px 48px rgba(0, 0, 0, 0.5);
    }
    .corner {
      position: absolute;
      width: 1.05rem;
      height: 1.05rem;
      border: 1px solid var(--gold);
      opacity: 0.75;
      pointer-events: none;
    }
    .tl { top: 0.45rem; left: 0.45rem; border-right: 0; border-bottom: 0; }
    .tr { top: 0.45rem; right: 0.45rem; border-left: 0; border-bottom: 0; }
    .bl { bottom: 0.45rem; left: 0.45rem; border-right: 0; border-top: 0; }
    .br { bottom: 0.45rem; right: 0.45rem; border-left: 0; border-top: 0; }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: start;
    }
    .kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }
    h2 {
      margin: 0.25rem 0 0;
      font-family: var(--font-display);
      font-size: clamp(1.25rem, 3vw, 1.55rem);
      color: var(--gold);
      font-weight: 500;
    }
    .ghost {
      font-family: var(--font-display);
      font-size: 0.78rem;
      padding: 0.3rem 0.55rem;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .ghost:hover,
    .ghost:focus-visible {
      color: var(--gold);
      border-color: var(--bright);
    }
    .body {
      margin-top: 1rem;
    }
  `,
})
export class UiScroll {
  readonly title = input.required<string>();
  readonly kicker = input('');
  readonly titleId = input('ui-scroll-title');
  readonly layer = input<'base' | 'top'>('base');
  readonly closed = output<void>();
}
