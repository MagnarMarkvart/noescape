import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { SKILL_WEIGHT_TOTAL } from './skill-weights';

export interface SkillWeightShareView {
  slug: string;
  name: string;
  weight: number;
  xp?: number;
}

/** 10-point skill split editor used by dailies and defaults. */
@Component({
  selector: 'app-skill-weight-list',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shares().length) {
      <ul class="weight-list">
        @for (share of shares(); track share.slug) {
          <li>
            <span class="weight-name">{{ share.name }}</span>
            <span class="weight-controls">
              <button
                type="button"
                (click)="bump.emit({ slug: share.slug, delta: -1 })"
                [disabled]="share.weight <= 1"
                aria-label="Decrease weight"
              >
                −
              </button>
              <strong>{{ share.weight }}/{{ total }}</strong>
              <button
                type="button"
                (click)="bump.emit({ slug: share.slug, delta: 1 })"
                [disabled]="remaining() <= 0"
                aria-label="Increase weight"
              >
                +
              </button>
            </span>
            @if (share.xp != null) {
              <span class="weight-xp">{{ share.xp | number }} XP</span>
            }
            <button
              type="button"
              class="ghost"
              (click)="remove.emit(share.slug)"
              aria-label="Remove skill"
            >
              ×
            </button>
          </li>
        }
      </ul>
      <p class="commit" [class.warn]="!valid()">
        @if (valid()) {
          All {{ total }} points assigned
        } @else {
          {{ remaining() }} point{{ remaining() === 1 ? '' : 's' }} left to assign
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.45rem;
      width: 100%;
    }

    .commit {
      margin: 0;
      color: #b8a878;
      font-size: 0.82rem;
    }

    .commit {
      color: #d4a84b;
      font-family: Cinzel, 'Palatino Linotype', Palatino, serif;
    }

    .commit.warn {
      color: #d4a070;
    }

    .weight-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.4rem;
    }

    .weight-list li {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 0.5rem;
      align-items: center;
      padding: 0.4rem 0.5rem;
      border: 1px solid rgba(138, 115, 64, 0.45);
    }

    .weight-name {
      color: #f0e6c8;
    }

    .weight-controls {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-family: Cinzel, 'Palatino Linotype', Palatino, serif;
    }

    .weight-controls button,
    .ghost {
      width: 1.7rem;
      height: 1.7rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #f0e6c8;
      cursor: pointer;
    }

    .weight-controls button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .weight-xp {
      color: #8fbc7a;
      font-size: 0.85rem;
      white-space: nowrap;
    }
  `,
})
export class SkillWeightList {
  readonly shares = input<SkillWeightShareView[]>([]);
  readonly remaining = input(0);
  readonly valid = input(false);
  readonly bump = output<{ slug: string; delta: number }>();
  readonly remove = output<string>();
  protected readonly total = SKILL_WEIGHT_TOTAL;
}
