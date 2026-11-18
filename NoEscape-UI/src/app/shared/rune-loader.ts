import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Full-screen medieval scribe overlay while a view or cover image loads. */
@Component({
  selector: 'app-rune-loader',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stage" role="status" aria-live="polite" aria-busy="true">
      <div class="glow" aria-hidden="true"></div>
      <div class="scroll">
        <span class="corner tl" aria-hidden="true"></span>
        <span class="corner tr" aria-hidden="true"></span>
        <span class="corner bl" aria-hidden="true"></span>
        <span class="corner br" aria-hidden="true"></span>
        <p class="kicker">Scriptorium</p>
        <div class="seal" aria-hidden="true">
          <span class="ring"></span>
          <span class="wax"></span>
          <span class="rune">✦</span>
        </div>
        <h1>Loading {{ label() }}</h1>
        <p class="hint">{{ hint() }}</p>
        <div class="ink" aria-hidden="true">
          <span></span>
        </div>
      </div>
      @if (backHref()) {
        <a class="escape" [routerLink]="backHref()" [attr.aria-label]="backLabel()">
          {{ backLabel() }}
        </a>
      }
    </div>
  `,
  styles: `
    :host {
      --ink: #f0e6c8;
      --muted: #b8a878;
      --gold: #d4a84b;
      --bright: #e0c06a;
      --border: #8a7340;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      --font-body: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      position: fixed;
      inset: 0;
      z-index: 200;
      display: block;
      color: var(--ink);
      font-family: var(--font-body);
    }

    .stage {
      position: relative;
      height: 100%;
      display: grid;
      place-items: center;
      padding: 1.25rem;
      overflow: hidden;
      background:
        radial-gradient(ellipse at 50% 30%, rgba(212, 168, 75, 0.16), transparent 46%),
        radial-gradient(ellipse at 80% 90%, rgba(138, 64, 48, 0.18), transparent 42%),
        repeating-linear-gradient(
          0deg,
          rgba(240, 230, 200, 0.015) 0 1px,
          transparent 1px 7px
        ),
        linear-gradient(180deg, #16120a, #0c0906 55%, #120e08);
    }

    .glow {
      position: absolute;
      top: 42%;
      left: 50%;
      width: min(22rem, 70vw);
      height: min(22rem, 70vw);
      border-radius: 50%;
      background: radial-gradient(circle, rgba(212, 168, 75, 0.18), transparent 68%);
      transform: translate(-50%, -50%);
      animation: pulse 2.8s ease-in-out infinite;
      pointer-events: none;
    }

    .scroll {
      position: relative;
      width: min(28rem, 100%);
      padding: 1.7rem 1.5rem 1.45rem;
      text-align: center;
      border: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(74, 61, 40, 0.55), rgba(22, 18, 10, 0.92));
      box-shadow:
        inset 0 0 0 1px rgba(18, 14, 8, 0.7),
        0 24px 48px rgba(0, 0, 0, 0.45);
    }

    .corner {
      position: absolute;
      width: 1.1rem;
      height: 1.1rem;
      border: 1px solid var(--gold);
      opacity: 0.7;
    }

    .tl { top: 0.4rem; left: 0.4rem; border-right: 0; border-bottom: 0; }
    .tr { top: 0.4rem; right: 0.4rem; border-left: 0; border-bottom: 0; }
    .bl { bottom: 0.4rem; left: 0.4rem; border-right: 0; border-top: 0; }
    .br { bottom: 0.4rem; right: 0.4rem; border-left: 0; border-top: 0; }

    .kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .seal {
      position: relative;
      width: 5.4rem;
      height: 5.4rem;
      margin: 1rem auto 0.85rem;
    }

    .ring,
    .wax {
      position: absolute;
      inset: 0;
      border-radius: 50%;
    }

    .ring {
      border: 1px solid var(--gold);
      box-shadow: 0 0 16px rgba(212, 168, 75, 0.28);
      animation: spin 8s linear infinite;
    }

    .ring::before,
    .ring::after {
      content: '';
      position: absolute;
      width: 0.38rem;
      height: 0.38rem;
      background: var(--gold);
      clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
    }

    .ring::before { top: -0.12rem; left: calc(50% - 0.19rem); }
    .ring::after { bottom: -0.12rem; left: calc(50% - 0.19rem); }

    .wax {
      inset: 0.45rem;
      background:
        radial-gradient(circle at 35% 30%, #e8b45a, #b43c32 58%, #6e2018);
      box-shadow: inset 0 1px 0 rgba(255, 230, 180, 0.35);
    }

    .rune {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font-size: 1.7rem;
      color: #1a1408;
      font-family: var(--font-display);
    }

    h1 {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(1.15rem, 3.4vw, 1.55rem);
      letter-spacing: 0.04em;
      color: var(--bright);
      font-weight: 500;
    }

    .hint {
      margin: 0.45rem 0 0;
      color: var(--muted);
      font-size: 0.88rem;
    }

    .ink {
      margin: 1.1rem auto 0;
      width: min(14rem, 80%);
      height: 2px;
      background: rgba(138, 115, 64, 0.35);
      overflow: hidden;
    }

    .ink span {
      display: block;
      width: 40%;
      height: 100%;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      animation: scribe 1.4s ease-in-out infinite;
    }

    .escape {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0.45rem 0.75rem;
      border: 1px solid var(--border);
      color: var(--muted);
      text-decoration: none;
      font-family: var(--font-display);
      font-size: 0.82rem;
      background: rgba(18, 14, 8, 0.7);
    }

    .escape:hover,
    .escape:focus-visible {
      color: var(--gold);
      border-color: var(--gold);
      outline: none;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(0.94); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.04); }
    }

    @keyframes scribe {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(280%); }
    }

    @media (max-width: 640px) {
      .scroll {
        padding: 1.35rem 1.05rem 1.2rem;
      }

      .seal {
        width: 4.4rem;
        height: 4.4rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .glow,
      .ring,
      .ink span {
        animation: none;
      }

      .glow {
        transform: translate(-50%, -50%);
      }
    }
  `,
})
export class RuneLoader {
  /** What is being fetched, e.g. "the quest briefing". */
  readonly label = input('the scroll');
  readonly hint = input('The scribe is fetching the parchment…');
  readonly backHref = input<string | null>('/quests');
  readonly backLabel = input('Leave');
}
