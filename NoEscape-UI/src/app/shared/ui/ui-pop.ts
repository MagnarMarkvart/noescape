import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { UiIcon, UiIconName } from './ui-icon';

const POP_PAD = 12;

@Component({
  selector: 'app-ui-pop',
  imports: [UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="trigger"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-pressed]="active() ? true : null"
      [disabled]="disabled()"
      aria-haspopup="dialog"
      (click)="toggle($event)"
    >
      <app-ui-icon [name]="icon()" [filled]="filled()" />
    </button>
    @if (open()) {
      <div
        class="pop"
        role="dialog"
        [attr.aria-label]="label()"
        [style.top.px]="popTop()"
        [style.left.px]="popLeft()"
      >
        <ng-content />
      </div>
    }
  `,
  host: {
    '(document:pointerdown)': 'onDoc($event)',
    '(document:keydown.escape)': 'close()',
    '(window:resize)': 'onViewport()',
    '(window:scroll)': 'onViewport()',
  },
  styles: `
    :host {
      display: inline-flex;
      position: relative;
      box-sizing: border-box;
      width: 1.9rem;
      height: 1.9rem;
      flex: 0 0 1.9rem;
    }
    .trigger {
      box-sizing: border-box;
      width: 1.9rem;
      height: 1.9rem;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid #8a7340;
      background: rgba(26, 20, 8, 0.55);
      color: #b8a878;
      cursor: pointer;
    }
    .trigger:hover,
    .trigger:focus-visible,
    .trigger[aria-expanded='true'] {
      border-color: #c6a85a;
      color: #e0c06a;
      outline: none;
    }
    .trigger[aria-pressed='true'] {
      color: #d4a84b;
      border-color: #c6a85a;
      background: rgba(212, 168, 75, 0.18);
    }
    .trigger:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    app-ui-icon {
      width: 1.05rem;
      height: 1.05rem;
    }
    .pop {
      position: fixed;
      z-index: 50;
      box-sizing: border-box;
      min-width: 11rem;
      max-width: calc(100vw - 24px);
      padding: 0.65rem 0.7rem 0.7rem;
      border: 1px solid #c6a85a;
      background: #1c1810;
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.45);
      color: #f0e6c8;
    }
  `,
})
export class UiPop {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  readonly icon = input.required<UiIconName>();
  readonly label = input.required<string>();
  readonly active = input(false);
  readonly filled = input(false);
  readonly disabled = input(false);

  protected readonly open = signal(false);
  protected readonly popTop = signal(0);
  protected readonly popLeft = signal(0);

  protected toggle(event: Event): void {
    event.stopPropagation();
    if (this.disabled()) {
      return;
    }
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    afterNextRender(
      () => {
        this.placePop();
        requestAnimationFrame(() => this.placePop());
      },
      { injector: this.injector },
    );
  }

  close(): void {
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
    const width = pop.getBoundingClientRect().width;
    const height = pop.getBoundingClientRect().height;
    let left = rect.right - width;
    if (left < POP_PAD) {
      left = POP_PAD;
    }
    if (left + width > vw - POP_PAD) {
      left = Math.max(POP_PAD, vw - POP_PAD - width);
    }
    let top = rect.bottom + 6;
    if (top + height > vh - POP_PAD && rect.top - 6 - height >= POP_PAD) {
      top = rect.top - 6 - height;
    } else if (top + height > vh - POP_PAD) {
      top = Math.max(POP_PAD, vh - POP_PAD - height);
    }
    this.popLeft.set(left);
    this.popTop.set(top);
  }
}
