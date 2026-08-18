import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  monthGridLead,
  monthRange,
  shiftIsoMonths,
  WeekStart,
  weekdayNames,
} from './time';

export type CalendarDayStatus = 'sealed' | 'abandoned' | 'open';

export interface CalendarDayMark {
  stars?: number;
  status?: CalendarDayStatus;
}

export type CalendarMarks = Record<string, CalendarDayMark>;

export const CALENDAR_STAR_CAP = 5;

@Component({
  selector: 'app-rune-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal" role="dialog" aria-label="Choose a date">
      <div class="cal-nav">
        <button type="button" class="icon" (click)="shiftMonth(-1)" aria-label="Previous month">
          ‹
        </button>
        <p class="month-label">{{ monthLabel() }}</p>
        <button type="button" class="icon" (click)="shiftMonth(1)" aria-label="Next month">
          ›
        </button>
      </div>
      <div class="grid" role="grid">
        @for (wd of weekdays(); track wd) {
          <span class="wd">{{ wd }}</span>
        }
        @for (pad of pads(); track pad) {
          <span class="cell pad" aria-hidden="true"></span>
        }
        @for (day of days(); track day.iso) {
          <button
            type="button"
            class="cell"
            [class.selected]="day.iso === selected()"
            [class.today]="day.iso === today()"
            (click)="pick(day.iso)"
          >
            <span class="num">{{ day.n }}</span>
            @if (starCount(day.iso); as n) {
              <span class="stars" aria-hidden="true">
                @for (s of stars(n); track s) {
                  <i class="star"></i>
                }
              </span>
            } @else if (statusOf(day.iso); as st) {
              <span class="pip" [class]="st" aria-hidden="true"></span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      --rc-border: #8a7340;
      --rc-bright: #c6a85a;
      --rc-gold: #d4a84b;
      --rc-text: #f0e6c8;
      --rc-muted: #b8a878;
      --rc-ok: #2f8f3a;
      --rc-warn: #d4893a;
      --rc-bad: #c45c4a;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      display: block;
      width: min(20.5rem, 100vw - 2rem);
      padding: 0.7rem 0.75rem 0.8rem;
      border: 1px solid var(--rc-bright);
      background:
        radial-gradient(ellipse at 20% 0%, rgba(212, 168, 75, 0.12), transparent 50%),
        linear-gradient(180deg, #2a2316, #1a1610);
      box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, 0.35),
        0 16px 32px rgba(0, 0, 0, 0.45);
      color: var(--rc-text);
    }

    .cal-nav {
      display: grid;
      grid-template-columns: 2rem 1fr 2rem;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.55rem;
    }

    .month-label {
      margin: 0;
      text-align: center;
      font-family: var(--font-display);
      letter-spacing: 0.06em;
      color: var(--rc-gold);
      font-size: 0.92rem;
    }

    .icon {
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 1px solid var(--rc-border);
      background: transparent;
      color: var(--rc-text);
      cursor: pointer;
      font-size: 1.15rem;
      line-height: 1;
    }

    .icon:hover,
    .icon:focus-visible {
      border-color: var(--rc-bright);
      outline: none;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 0.22rem;
    }

    .wd {
      text-align: center;
      font-size: 0.62rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rc-muted);
      padding-bottom: 0.15rem;
    }

    .cell {
      min-height: 2.35rem;
      display: grid;
      place-items: center;
      gap: 0.12rem;
      padding: 0.18rem 0 0.22rem;
      border: 1px solid rgba(138, 115, 64, 0.4);
      background: rgba(16, 12, 8, 0.55);
      color: var(--rc-muted);
      cursor: pointer;
      font: inherit;
    }

    .cell.pad {
      border-color: transparent;
      background: transparent;
      cursor: default;
    }

    .cell:hover:not(.pad) {
      border-color: var(--rc-bright);
      color: var(--rc-text);
    }

    .cell.today {
      border-color: var(--rc-gold);
      color: var(--rc-gold);
    }

    .cell.selected {
      color: #1a1408;
      background: linear-gradient(180deg, #e0c06a, #d4a84b);
      border-color: #8a6a28;
    }

    .num {
      font-family: var(--font-display);
      font-size: 0.78rem;
      line-height: 1;
    }

    .stars {
      display: flex;
      justify-content: center;
      gap: 0.08rem;
      min-height: 0.38rem;
    }

    .star {
      display: block;
      width: 0.38rem;
      height: 0.38rem;
      background: var(--rc-gold);
      clip-path: polygon(
        50% 0,
        62% 38%,
        100% 50%,
        62% 62%,
        50% 100%,
        38% 62%,
        0 50%,
        38% 38%
      );
    }

    .cell.selected .star {
      background: #1a1408;
    }

    .pip {
      width: 0.38rem;
      height: 0.38rem;
      transform: rotate(45deg);
      border: 1px solid rgba(26, 20, 8, 0.45);
    }

    .pip.sealed {
      background: var(--rc-ok);
    }

    .pip.abandoned {
      background: var(--rc-warn);
    }

    .pip.open {
      background: var(--rc-bad);
    }

    @media (max-width: 899px) {
      .star:nth-child(n + 2) {
        display: none;
      }
    }
  `,
})
export class RuneCalendar {
  readonly selected = input.required<string>();
  readonly today = input.required<string>();
  readonly viewMonth = input.required<string>();
  readonly weekStartsOn = input<WeekStart>(1);
  readonly marks = input<CalendarMarks>({});
  readonly selectedChange = output<string>();
  readonly viewMonthChange = output<string>();

  protected readonly weekdays = computed(() =>
    weekdayNames(this.weekStartsOn()),
  );

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.viewMonth().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  protected readonly pads = computed(() => {
    const [y, m] = this.viewMonth().split('-').map(Number);
    const lead = monthGridLead(y, m, this.weekStartsOn());
    return Array.from({ length: lead }, (_, i) => i);
  });

  protected readonly days = computed(() => {
    const { from, to } = monthRange(this.viewMonth());
    const out: Array<{ iso: string; n: number }> = [];
    let cursor = from;
    while (cursor <= to) {
      out.push({ iso: cursor, n: Number(cursor.slice(-2)) });
      const d = new Date(`${cursor}T12:00:00`);
      d.setDate(d.getDate() + 1);
      cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return out;
  });

  protected starCount(iso: string): number | null {
    const n = this.marks()[iso]?.stars;
    if (!n || n < 1) {
      return null;
    }
    return Math.min(CALENDAR_STAR_CAP, n);
  }

  protected stars(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }

  protected statusOf(iso: string): CalendarDayStatus | null {
    return this.marks()[iso]?.status ?? null;
  }

  protected pick(iso: string): void {
    this.selectedChange.emit(iso);
  }

  protected shiftMonth(delta: number): void {
    this.viewMonthChange.emit(shiftIsoMonths(this.viewMonth(), delta));
  }
}
