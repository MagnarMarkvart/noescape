import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { CharacterService } from '../character/character.service';
import {
  CalendarMarks,
  RuneCalendar,
} from './rune-calendar';
import { monthRange, shiftIsoDays } from './time';

@Component({
  selector: 'app-date-nav',
  imports: [RuneCalendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nav" role="group" aria-label="Day navigation">
      <button
        type="button"
        class="icon"
        (click)="shift(-1)"
        aria-label="Previous day"
      >
        ‹
      </button>
      <div class="picker">
        <button
          type="button"
          class="date-btn"
          (click)="toggleCal($event)"
          [attr.aria-expanded]="open()"
          aria-haspopup="dialog"
        >
          {{ label() }}
        </button>
        @if (open()) {
          <div class="pop">
            <app-rune-calendar
              [selected]="date()"
              [today]="today()"
              [viewMonth]="viewMonth()"
              [weekStartsOn]="character.weekStartsOn()"
              [marks]="marks()"
              (selectedChange)="pick($event)"
              (viewMonthChange)="setMonth($event)"
            />
          </div>
        }
      </div>
      <button
        type="button"
        class="icon"
        (click)="shift(1)"
        aria-label="Next day"
      >
        ›
      </button>
      @if (showToday() && date() !== today()) {
        <button type="button" class="ghost" (click)="go(today())">Today</button>
      }
      @if (showTomorrow() && date() !== tomorrow()) {
        <button type="button" class="ghost" (click)="go(tomorrow())">
          Tomorrow
        </button>
      }
      <ng-content />
    </div>
  `,
  host: {
    '(document:pointerdown)': 'onDoc($event)',
    '(document:keydown.escape)': 'close()',
  },
  styles: `
    :host {
      --dn-border: #8a7340;
      --dn-bright: #c6a85a;
      --dn-gold: #d4a84b;
      --dn-text: #f0e6c8;
      --dn-muted: #b8a878;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      display: block;
    }

    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
    }

    .picker {
      position: relative;
    }

    .date-btn,
    .icon,
    .ghost {
      font-family: var(--font-display);
      color: var(--dn-gold);
      background: rgba(20, 16, 10, 0.55);
      border: 1px solid var(--dn-border);
      cursor: pointer;
    }

    .date-btn {
      min-width: 9.5rem;
      padding: 0.45rem 0.7rem;
      letter-spacing: 0.04em;
    }

    .icon {
      width: 2.2rem;
      padding: 0.45rem 0;
      font-size: 1.25rem;
      line-height: 1;
      color: var(--dn-text);
    }

    .ghost {
      padding: 0.45rem 0.7rem;
      color: var(--dn-muted);
    }

    .date-btn:hover,
    .icon:hover,
    .ghost:hover,
    .date-btn:focus-visible,
    .icon:focus-visible,
    .ghost:focus-visible {
      border-color: var(--dn-bright);
      outline: none;
    }

    .pop {
      position: absolute;
      z-index: 40;
      top: calc(100% + 0.4rem);
      left: 0;
    }
  `,
})
export class DateNav implements OnInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly character = inject(CharacterService);

  readonly date = input.required<string>();
  readonly today = input.required<string>();
  readonly marks = input<CalendarMarks>({});
  readonly showToday = input(true);
  readonly showTomorrow = input(false);
  readonly dateChange = output<string>();
  readonly rangeChange = output<{ from: string; to: string }>();

  protected readonly open = signal(false);
  protected readonly viewMonth = signal('');

  ngOnInit(): void {
    this.viewMonth.set(this.date());
    this.emitRange(this.date());
  }

  protected label(): string {
    return this.character.formatDate(this.date());
  }

  protected tomorrow(): string {
    return shiftIsoDays(this.today(), 1);
  }

  protected shift(delta: number): void {
    this.go(shiftIsoDays(this.date(), delta));
  }

  protected go(iso: string): void {
    if (iso === this.date()) {
      return;
    }
    this.dateChange.emit(iso);
    this.viewMonth.set(iso);
    this.emitRange(iso);
  }

  protected pick(iso: string): void {
    this.go(iso);
    this.close();
  }

  protected toggleCal(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.close();
      return;
    }
    const month = this.date();
    this.viewMonth.set(month);
    this.open.set(true);
    this.emitRange(month);
  }

  protected setMonth(iso: string): void {
    this.viewMonth.set(iso);
    this.emitRange(iso);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onDoc(event: Event): void {
    if (!this.open()) {
      return;
    }
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) {
      return;
    }
    this.close();
  }

  private emitRange(iso: string): void {
    this.rangeChange.emit(monthRange(iso));
  }
}
