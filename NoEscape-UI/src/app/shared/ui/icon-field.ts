import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { IconPicker } from './icon-picker';

const POP_PAD = 20;
const POP_MAX = 22 * 16;

@Component({
  selector: 'app-icon-field',
  imports: [IconPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field">
      <button
        type="button"
        class="trigger"
        [attr.aria-label]="label()"
        [attr.aria-expanded]="open()"
        aria-haspopup="dialog"
        (click)="toggle($event)"
      >
        {{ value() }}
      </button>
      @if (open()) {
        <div
          class="pop"
          [style.top.px]="popTop()"
          [style.left.px]="popLeft()"
          [style.width.px]="popWidth()"
          (pointerdown)="$event.stopPropagation()"
        >
          <app-icon-picker
            [compact]="true"
            [selected]="value()"
            (picked)="pick($event)"
          />
        </div>
      }
    </div>
  `,
  host: {
    '(document:pointerdown)': 'onDoc($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  styles: `
    :host {
      display: block;
      position: relative;
      box-sizing: border-box;
      width: 2.35rem;
      min-width: 2.35rem;
      height: 2.35rem;
    }
    .field {
      position: relative;
      width: 2.35rem;
      height: 2.35rem;
    }
    .trigger {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 2.35rem;
      height: 2.35rem;
      padding: 0;
      border: 1px solid #8a7340;
      background: #1a1610;
      color: #f0e6c8;
      font-size: 1.15rem;
      line-height: 1;
      cursor: pointer;
    }
    .trigger:hover,
    .trigger:focus-visible,
    .trigger[aria-expanded='true'] {
      border-color: #c6a85a;
      outline: none;
    }
    .pop {
      position: fixed;
      z-index: 40;
      box-sizing: border-box;
      max-width: calc(100vw - 40px);
      padding: 0.55rem 0.7rem 0.65rem 0.55rem;
      border: 1px solid #c6a85a;
      background: #1c1810;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
  `,
})
export class IconField {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  readonly value = input.required<string>();
  readonly label = input('Icon');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly popTop = signal(0);
  protected readonly popLeft = signal(POP_PAD);
  protected readonly popWidth = signal(280);

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.open.update((v) => !v);
    if (this.open()) {
      afterNextRender(() => {
        this.placePop();
        requestAnimationFrame(() => this.placePop());
      }, { injector: this.injector });
    }
  }

  protected pick(glyph: string): void {
    this.valueChange.emit(glyph);
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

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onViewport(): void {
    if (this.open()) {
      this.placePop();
    }
  }

  private placePop(): void {
    const trigger = this.host.nativeElement.querySelector('.trigger');
    const pop = this.host.nativeElement.querySelector('.pop');
    if (!(trigger instanceof HTMLElement) || !(pop instanceof HTMLElement)) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = Math.max(0, Math.min(POP_MAX, vw - POP_PAD * 2));
    this.popWidth.set(width);
    let left = rect.left;
    if (left + width > vw - POP_PAD) {
      left = vw - POP_PAD - width;
    }
    this.popLeft.set(Math.max(POP_PAD, left));
    let top = rect.bottom + 6;
    const height = pop.getBoundingClientRect().height;
    if (top + height > vh - POP_PAD && rect.top - 6 - height >= POP_PAD) {
      top = rect.top - 6 - height;
    } else if (top + height > vh - POP_PAD) {
      top = Math.max(POP_PAD, vh - POP_PAD - height);
    }
    this.popTop.set(top);
  }
}
