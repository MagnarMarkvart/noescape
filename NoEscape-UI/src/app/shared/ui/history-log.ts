import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { DateNav } from '../date-nav';
import { CalendarMarks } from '../rune-calendar';
import { UiIconBtn } from './ui-icon-btn';
import { UiScroll } from './ui-scroll';

@Component({
  selector: 'app-history-log',
  imports: [DateNav, UiIconBtn, UiScroll],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="log-shell">
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
          />
        }
      </header>

      <app-date-nav
        [date]="date()"
        [today]="today()"
        [marks]="marks()"
        (dateChange)="dateChange.emit($event)"
        (rangeChange)="rangeChange.emit($event)"
      />

      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (empty()) {
        <p class="muted">{{ emptyText() }}</p>
      } @else {
        <ng-content />
      }
    </section>

    @if (detailTitle(); as heading) {
      <app-ui-scroll
        [kicker]="detailKicker()"
        [title]="heading"
        [titleId]="detailTitleId()"
        (closed)="close.emit()"
      >
        <ng-content select="[scrollBody]" />
      </app-ui-scroll>
    }
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
      color: var(--rs-text);
      font-family: var(--font-body);
      background: linear-gradient(180deg, #1c1810, var(--rs-bg) 50%, #221c12);
    }
    .log-shell {
      width: min(72rem, 100%);
      margin: 0 auto;
      padding: 1.15rem 1.25rem 2.5rem;
      box-sizing: border-box;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: end;
      margin-bottom: 1.25rem;
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
      color: var(--rs-accent);
      font-size: clamp(1.7rem, 3vw, 2.4rem);
      letter-spacing: 0.05em;
    }
    .lede {
      margin: 0.35rem 0 0;
      color: var(--rs-muted);
      font-size: 0.95rem;
    }
    app-date-nav {
      display: block;
      margin-bottom: 1.15rem;
    }
    .muted {
      color: var(--rs-muted);
    }
    @media (max-width: 640px) {
      .log-shell {
        padding: 0.85rem 0.85rem 2rem;
      }
      .toolbar {
        align-items: start;
        flex-wrap: wrap;
      }
    }
    @media (min-width: 720px) {
      .log-shell {
        padding: 1.5rem 1.75rem 3rem;
      }
    }
  `,
})
export class HistoryLog {
  readonly kicker = input('Archive');
  readonly title = input.required<string>();
  readonly lede = input('');
  readonly backHref = input<string | null>(null);
  readonly backLabel = input('Back');
  readonly date = input.required<string>();
  readonly today = input.required<string>();
  readonly marks = input<CalendarMarks>({});
  readonly loading = input(false);
  readonly empty = input(false);
  readonly emptyText = input('Nothing logged on this day.');
  readonly detailTitle = input<string | null>(null);
  readonly detailKicker = input('');
  readonly detailTitleId = input('history-detail-title');
  readonly dateChange = output<string>();
  readonly rangeChange = output<{ from: string; to: string }>();
  readonly close = output<void>();
}
