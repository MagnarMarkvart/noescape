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
      [class.done]="habit().successfulToday"
      [class.dragging]="draggable()"
      [attr.draggable]="draggable() ? 'true' : null"
      [attr.data-tone]="habit().kind === 'tally' ? habit().tone : null"
      (dragstart)="onDragStart($event)"
    >
      <div class="check-row">
        <span class="glyph" aria-hidden="true">{{ habit().icon || '◆' }}</span>
        <span class="meta">
          <strong>{{ habit().name }}</strong>
          @if (!compact()) {
            <small>
              @if (habit().kind === 'tally') {
                {{ habit().windowLabel }}
                · {{ habit().period }}
                · {{ band() }}
              } @else {
                🔥 {{ habit().currentStreak }} · best {{ habit().bestStreak }}
                ·
                {{
                  habit().cadence === 'EVERY_N_DAYS'
                    ? 'Every ' + habit().everyNDays + 'd'
                    : 'Daily'
                }}
              }
              @if (habit().questLink?.questName || habit().questName) {
                · {{ habit().questLink?.questName || habit().questName }}
              }
            </small>
          } @else if (habit().kind === 'check') {
            <small>🔥 {{ habit().currentStreak }}</small>
          }
        </span>
        @if (habit().kind === 'tally') {
          <span class="count">{{ habit().count }}</span>
        }
        <span class="steppers">
          @if (habit().kind === 'tally') {
            <button
              type="button"
              class="step"
              [disabled]="busy() || readonly() || habit().count <= 0"
              [attr.aria-label]="'Decrease ' + habit().name"
              (click)="minus.emit(habit())"
            >
              −
            </button>
            <button
              type="button"
              class="step"
              [disabled]="busy() || readonly()"
              [attr.aria-label]="'Increase ' + habit().name"
              (click)="plus.emit(habit())"
            >
              {{ busy() ? '…' : '+' }}
            </button>
          } @else if (habit().successfulToday) {
            <button
              type="button"
              class="step"
              [disabled]="busy() || readonly()"
              [attr.aria-label]="'Undo ' + habit().name"
              (click)="minus.emit(habit())"
            >
              {{ busy() ? '…' : '−' }}
            </button>
          } @else {
            <button
              type="button"
              class="step plus"
              [disabled]="busy() || readonly()"
              [attr.aria-label]="'Complete ' + habit().name"
              (click)="plus.emit(habit())"
            >
              {{ busy() ? '…' : '+' }}
            </button>
          }
        </span>
      </div>
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
      gap: 0.15rem;
      padding: 0.2rem;
      border: 1px solid #8a7340;
      background: rgba(30, 24, 14, 0.72);
    }
    .card.done {
      border-color: #6a9a58;
    }
    .card.dragging {
      cursor: grab;
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
    .check-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      gap: 0.55rem;
      align-items: center;
      min-width: 0;
      padding: 0.55rem 0.65rem;
    }
    .card.tally .check-row {
      grid-template-columns: auto minmax(0, 1fr) auto auto;
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
    .steppers {
      display: flex;
      gap: 0.25rem;
    }
    .step {
      width: 2.15rem;
      height: 2.15rem;
      border: 1px solid #8a7340;
      background: rgba(18, 14, 8, 0.5);
      color: #f0e6c8;
      cursor: pointer;
      font: inherit;
      font-size: 1.15rem;
    }
    .step:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .step:hover:not(:disabled),
    .step:focus-visible,
    .edit:hover,
    .edit:focus-visible {
      border-color: #c6a85a;
      color: #d4a84b;
      outline: none;
    }
    .edit {
      justify-self: end;
      padding: 0.15rem 0.45rem 0.35rem;
      color: #b8a878;
      font-size: 0.75rem;
      text-decoration: none;
    }
    .card.compact {
      padding: 0;
    }
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
    .card.compact .step {
      width: 1.85rem;
      height: 1.85rem;
    }
  `,
})
export class HabitCard {
  readonly habit = input.required<HabitView>();
  readonly compact = input(false);
  readonly busy = input(false);
  readonly readonly = input(false);
  readonly draggable = input(false);
  readonly plus = output<HabitView>();
  readonly minus = output<HabitView>();
  readonly dragStart = output<DragEvent>();

  protected band(): string {
    const row = this.habit();
    if (row.normMin === row.normMax) {
      return `norm ${row.normMin}`;
    }
    return `norm ${row.normMin}–${row.normMax}`;
  }

  protected onDragStart(event: DragEvent): void {
    if (!this.draggable()) {
      return;
    }
    event.dataTransfer?.setData('text/plain', String(this.habit().id));
    this.dragStart.emit(event);
  }
}
