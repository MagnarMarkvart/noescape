import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { bandLabel, periodCaption, TabulaView } from './tabularium.model';

@Component({
  selector: 'app-tabula-clicker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="clicker"
      [class.compact]="compact()"
      [attr.data-tone]="row().tone"
    >
      <button
        type="button"
        class="hit"
        [disabled]="busy() || readonly()"
        [attr.aria-label]="'Mark ' + row().name"
        (click)="clicked.emit(row())"
      >
        <span class="glyph" aria-hidden="true">{{ row().icon || '◆' }}</span>
        <span class="meta">
          <strong>{{ row().name }}</strong>
          @if (!compact()) {
            <small>
              {{ row().windowLabel }}
              · {{ periodCaption(row()) }}
              · {{ bandLabel(row()) }}
              @if (row().questName) {
                · {{ row().questName }}
              }
            </small>
          }
        </span>
        <span class="count">{{ row().count }}</span>
      </button>
      @if (!compact()) {
        <button
          type="button"
          class="undo"
          [disabled]="busy() || readonly() || row().count <= 0"
          [attr.aria-label]="'Undo last mark on ' + row().name"
          (click)="undone.emit(row())"
        >
          −
        </button>
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .clicker {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem;
      align-items: stretch;
      padding: 0.2rem;
      border: 1px solid #8a7340;
      background: rgba(30, 24, 14, 0.72);
    }
    .clicker[data-tone='good'] {
      border-color: #6a9a58;
      box-shadow: inset 0 0 0 1px rgba(47, 143, 58, 0.35),
        0 0 18px rgba(47, 143, 58, 0.22);
      background:
        linear-gradient(180deg, rgba(47, 143, 58, 0.16), rgba(30, 24, 14, 0.72));
    }
    .clicker[data-tone='fair'] {
      border-color: #c6a85a;
      box-shadow: inset 0 0 0 1px rgba(212, 168, 75, 0.35),
        0 0 16px rgba(212, 168, 75, 0.2);
      background:
        linear-gradient(180deg, rgba(212, 168, 75, 0.16), rgba(30, 24, 14, 0.72));
    }
    .clicker[data-tone='poor'] {
      border-color: #c45c4a;
      box-shadow: inset 0 0 0 1px rgba(196, 92, 74, 0.4),
        0 0 16px rgba(196, 92, 74, 0.22);
      background:
        linear-gradient(180deg, rgba(196, 92, 74, 0.18), rgba(30, 24, 14, 0.72));
    }
    .hit {
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
      cursor: pointer;
    }
    .hit:disabled {
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
    .undo {
      width: 2.15rem;
      border: 1px solid #8a7340;
      background: rgba(18, 14, 8, 0.5);
      color: #f0e6c8;
      cursor: pointer;
      font-size: 1.15rem;
    }
    .undo:hover,
    .hit:hover,
    .undo:focus-visible,
    .hit:focus-visible {
      border-color: #c6a85a;
      outline: none;
    }
    .undo:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .clicker.compact {
      grid-template-columns: minmax(0, 1fr);
      padding: 0;
    }
    .clicker.compact .hit {
      padding: 0.4rem 0.5rem;
      gap: 0.4rem;
    }
    .clicker.compact .glyph {
      font-size: 1.15rem;
    }
    .clicker.compact .count {
      font-size: 1.2rem;
    }
    .clicker.compact .meta strong {
      font-size: 0.88rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class TabulaClicker {
  readonly row = input.required<TabulaView>();
  readonly compact = input(false);
  readonly busy = input(false);
  readonly readonly = input(false);
  readonly clicked = output<TabulaView>();
  readonly undone = output<TabulaView>();
  protected readonly periodCaption = periodCaption;
  protected readonly bandLabel = bandLabel;
}
