import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HabitView } from './habits.service';

@Component({
  selector: 'app-habit-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="card"
      [class.compact]="compact()"
      [class.tally]="habit().kind === 'tally'"
      [attr.data-tone]="habit().kind === 'tally' ? habit().tone : null"
    >
      @if (habit().kind === 'tally') {
        <button
          type="button"
          class="hit"
          [disabled]="busy() || readonly()"
          [attr.aria-label]="'Mark ' + habit().name"
          (click)="clicked.emit(habit())"
        >
          <span class="glyph" aria-hidden="true">{{ habit().icon || '◆' }}</span>
          <span class="meta">
            <strong>{{ habit().name }}</strong>
            @if (!compact()) {
              <small>
                {{ habit().windowLabel }}
                · {{ habit().period }}
                · {{ band() }}
                @if (habit().questName) {
                  · {{ habit().questName }}
                }
              </small>
            }
          </span>
          <span class="count">{{ habit().count }}</span>
        </button>
        @if (!compact()) {
          <button
            type="button"
            class="undo"
            [disabled]="busy() || readonly() || habit().count <= 0"
            [attr.aria-label]="'Undo last mark on ' + habit().name"
            (click)="undone.emit(habit())"
          >
            −
          </button>
        }
      } @else {
        <div class="check-row">
          <span class="glyph" aria-hidden="true">{{ habit().icon || '◆' }}</span>
          <span class="meta">
            <strong>{{ habit().name }}</strong>
            @if (!compact()) {
              <small>
                🔥 {{ habit().currentStreak }} · best {{ habit().bestStreak }}
                ·
                {{
                  habit().cadence === 'EVERY_N_DAYS'
                    ? 'Every ' + habit().everyNDays + 'd'
                    : 'Daily'
                }}
              </small>
            } @else {
              <small>🔥 {{ habit().currentStreak }}</small>
            }
          </span>
          @if (habit().doneToday) {
            <span class="done-flag">Done</span>
          } @else {
            <button
              type="button"
              class="done-btn"
              [disabled]="busy() || readonly()"
              (click)="completed.emit(habit())"
            >
              {{ busy() ? '…' : 'Done' }}
            </button>
          }
        </div>
      }
      @if (!compact() && !readonly()) {
        <a class="edit" [routerLink]="['/habitus', habit().id]">Edit</a>
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem;
      align-items: stretch;
      padding: 0.2rem;
      border: 1px solid #8a7340;
      background: rgba(30, 24, 14, 0.72);
    }
    .card.tally[data-tone='good'] {
      border-color: #6a9a58;
      box-shadow:
        inset 0 0 0 1px rgba(47, 143, 58, 0.35),
        0 0 18px rgba(47, 143, 58, 0.22);
      background: linear-gradient(
        180deg,
        rgba(47, 143, 58, 0.16),
        rgba(30, 24, 14, 0.72)
      );
    }
    .card.tally[data-tone='fair'] {
      border-color: #c6a85a;
      box-shadow:
        inset 0 0 0 1px rgba(212, 168, 75, 0.35),
        0 0 16px rgba(212, 168, 75, 0.2);
      background: linear-gradient(
        180deg,
        rgba(212, 168, 75, 0.16),
        rgba(30, 24, 14, 0.72)
      );
    }
    .card.tally[data-tone='poor'] {
      border-color: #c45c4a;
      box-shadow:
        inset 0 0 0 1px rgba(196, 92, 74, 0.4),
        0 0 16px rgba(196, 92, 74, 0.22);
      background: linear-gradient(
        180deg,
        rgba(196, 92, 74, 0.18),
        rgba(30, 24, 14, 0.72)
      );
    }
    .hit,
    .check-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.55rem;
      align-items: center;
      min-width: 0;
      padding: 0.55rem 0.65rem;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
    }
    .hit {
      cursor: pointer;
    }
    .hit:disabled,
    .done-btn:disabled {
      opacity: 0.55;
      cursor: wait;
    }
    .glyph {
      font-size: 1.45rem;
      line-height: 1;
    }
    .meta {
      min-width: 0;
    }
    .meta strong {
      display: block;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      color: #f0e6c8;
    }
    .meta small {
      display: block;
      margin-top: 0.12rem;
      color: #b8a878;
      font-size: 0.78rem;
    }
    .count {
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 1.55rem;
      color: #d4a84b;
      min-width: 1.6rem;
      text-align: right;
    }
    .undo,
    .done-btn {
      border: 1px solid #8a7340;
      background: rgba(18, 14, 8, 0.5);
      color: #f0e6c8;
      cursor: pointer;
      font: inherit;
    }
    .undo {
      width: 2.15rem;
      font-size: 1.15rem;
    }
    .done-btn {
      padding: 0.35rem 0.55rem;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.78rem;
    }
    .done-flag {
      color: #8fbc7a;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .edit {
      grid-column: 1 / -1;
      justify-self: end;
      padding: 0.15rem 0.45rem 0.35rem;
      color: #b8a878;
      font-size: 0.75rem;
      text-decoration: none;
    }
    .undo:hover,
    .hit:hover,
    .done-btn:hover,
    .edit:hover,
    .undo:focus-visible,
    .hit:focus-visible,
    .done-btn:focus-visible,
    .edit:focus-visible {
      border-color: #c6a85a;
      color: #d4a84b;
      outline: none;
    }
    .undo:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .card.compact {
      grid-template-columns: minmax(0, 1fr);
      padding: 0;
    }
    .card.compact .hit,
    .card.compact .check-row {
      padding: 0.4rem 0.5rem;
      gap: 0.4rem;
    }
    .card.compact .glyph {
      font-size: 1.15rem;
    }
    .card.compact .count {
      font-size: 1.2rem;
    }
    .card.compact .meta strong {
      font-size: 0.88rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class HabitCard {
  readonly habit = input.required<HabitView>();
  readonly compact = input(false);
  readonly busy = input(false);
  readonly readonly = input(false);
  readonly clicked = output<HabitView>();
  readonly undone = output<HabitView>();
  readonly completed = output<HabitView>();

  protected band(): string {
    const row = this.habit();
    if (row.normMin === row.normMax) {
      return `norm ${row.normMin}`;
    }
    return `norm ${row.normMin}–${row.normMax}`;
  }
}
