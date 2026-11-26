import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { LootService } from './loot';

@Component({
  selector: 'app-loot-toast',
  imports: [RouterLink, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (d of loot.toasts(); track d.id) {
        <a
          class="drop"
          [attr.data-tier]="d.tier"
          routerLink="/collectanea"
          (click)="loot.dismiss(d.id)"
        >
          <span class="icon" aria-hidden="true">{{ d.icon }}</span>
          <span class="text">
            <span class="name">{{ d.name }}</span>
            <span class="meta">
              {{ d.tier }} · roll {{ d.roll | number }}
              @if (d.firstFind) { · new! }
            </span>
          </span>
        </a>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed; right: 0.9rem; bottom: 0.9rem; z-index: 60;
      display: grid; gap: 0.4rem; justify-items: end; pointer-events: none;
    }
    .drop {
      pointer-events: auto; display: flex; gap: 0.55rem; align-items: center;
      padding: 0.4rem 0.75rem 0.4rem 0.5rem; text-decoration: none;
      background: rgba(18, 14, 8, 0.94); border: 1px solid #8a7340;
      color: #f0e6c8; font-family: 'Segoe UI', Tahoma, sans-serif;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
      animation: loot-in 0.35s ease-out;
    }
    .icon { font-size: 1.5rem; }
    .text { display: grid; }
    .name { font-family: 'Cinzel', Palatino, serif; font-size: 0.92rem; }
    .meta { font-size: 0.7rem; color: #b8a878; text-transform: uppercase; letter-spacing: 0.08em; }
    .drop[data-tier='uncommon'] { border-color: #5f9e5a; }
    .drop[data-tier='rare'] { border-color: #4f86c6; box-shadow: 0 0 14px rgba(79, 134, 198, 0.45); }
    .drop[data-tier='epic'] { border-color: #9a5fc6; box-shadow: 0 0 18px rgba(154, 95, 198, 0.55); }
    .drop[data-tier='legendary'], .drop[data-tier='mythic'], .drop[data-tier='unique'] {
      border-color: #e0b34a; box-shadow: 0 0 26px rgba(224, 179, 74, 0.7);
      padding: 0.7rem 1rem; transform-origin: right bottom;
    }
    .drop[data-tier='legendary'] .icon, .drop[data-tier='mythic'] .icon, .drop[data-tier='unique'] .icon { font-size: 2.2rem; }
    @keyframes loot-in { from { opacity: 0; transform: translateY(0.6rem); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .drop { animation: none; } }
  `,
})
export class LootToast {
  protected readonly loot = inject(LootService);
}
