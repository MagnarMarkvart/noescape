import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CharacterService } from '../../character/character.service';
import { RuneCalendar } from '../rune-calendar';

@Component({
  selector: 'app-date-field',
  imports: [RuneCalendar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field">
      @if (label()) {
        <span class="caption">{{ label() }}</span>
      }
      <div class="row">
        <div class="picker">
          <button
            type="button"
            class="date-btn"
            (click)="toggle($event)"
            [attr.aria-expanded]="open()"
            aria-haspopup="dialog"
          >
            {{ display() }}
          </button>
          @if (open()) {
            <div class="pop">
              <app-rune-calendar
                [selected]="value()"
                [today]="today()"
                [viewMonth]="viewMonth()"
                [weekStartsOn]="character.weekStartsOn()"
                (selectedChange)="pick($event)"
                (viewMonthChange)="viewMonth.set($event)"
              />
            </div>
          }
        </div>
        @if (allowClear() && value()) {
          <button type="button" class="ghost" (click)="clear()">
            {{ clearLabel() }}
          </button>
        }
      </div>
    </div>
  `,
  host: {
    '[class.compact]': 'compact()',
    '(document:pointerdown)': 'onDoc($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  styles: `
    :host {
      display: grid;
    }
    .field {
      display: grid;
      gap: 0.55rem;
      margin: 0;
      padding: 0.9rem 1rem 1.05rem;
      border: 1px solid #8a7340;
      background: rgba(22, 18, 10, 0.42);
      min-width: 0;
    }
    .caption {
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 1.05rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1.25;
      color: #d4a84b;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
    }
    .picker {
      position: relative;
    }
    .date-btn,
    .ghost {
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      color: #d4a84b;
      background: rgba(20, 16, 10, 0.55);
      border: 1px solid #8a7340;
      cursor: pointer;
    }
    .date-btn {
      min-width: 9.5rem;
      padding: 0.45rem 0.7rem;
      letter-spacing: 0.04em;
      text-align: left;
    }
    .ghost {
      padding: 0.45rem 0.7rem;
      color: #b8a878;
    }
    .date-btn:hover,
    .ghost:hover,
    .date-btn:focus-visible,
    .ghost:focus-visible {
      border-color: #c6a85a;
      outline: none;
    }
    .pop {
      position: absolute;
      z-index: 40;
      top: calc(100% + 0.4rem);
      left: 0;
    }
    :host.compact .field {
      gap: 0.2rem;
      padding: 0;
      border: 0;
      background: none;
    }
    :host.compact .date-btn {
      min-width: 8rem;
      padding: 0.35rem 0.55rem;
      font-size: 0.82rem;
    }
    :host.compact .ghost {
      padding: 0.35rem 0.5rem;
      font-size: 0.78rem;
    }
  `,
})
export class DateField {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly character = inject(CharacterService);

  readonly value = input('');
  readonly label = input('Date');
  readonly placeholder = input('None');
  readonly allowClear = input(true);
  readonly clearLabel = input('None');
  readonly compact = input(false);
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly viewMonth = signal('');
  protected readonly today = computed(() => this.character.todayIso());
  protected readonly display = computed(() => {
    const iso = this.value();
    return iso ? this.character.formatDate(iso) : this.placeholder();
  });

  protected toggle(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.viewMonth.set(this.value() || this.today());
    this.open.set(true);
  }

  protected pick(iso: string): void {
    this.valueChange.emit(iso);
    this.viewMonth.set(iso);
    this.open.set(false);
  }

  protected clear(): void {
    this.valueChange.emit('');
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
    this.open.set(false);
  }
}
