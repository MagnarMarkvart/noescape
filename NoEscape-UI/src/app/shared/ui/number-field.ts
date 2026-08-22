import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

export function digitsOnly(raw: string): string {
  return raw.replace(/\D+/g, '');
}

@Component({
  selector: 'app-number-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="off"
      enterkeyhint="done"
      [attr.aria-label]="ariaLabel()"
      [attr.min]="min()"
      [attr.max]="max()"
      [value]="shown()"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (beforeinput)="onBefore($event)"
      (paste)="onPaste($event)"
      (input)="onInput($any($event.target).value)"
    />
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    :host.trail {
      width: 100%;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 0.45rem 0.55rem;
      border: 1px solid #8a7340;
      background: #1a1610;
      color: #f0e6c8;
      font: inherit;
      appearance: textfield;
    }
    input:focus-visible {
      border-color: #c6a85a;
      outline: none;
    }
    @media (max-width: 600px) {
      :host.trail {
        width: 2.35rem;
        height: 2.35rem;
      }
      :host.trail input {
        width: 2.35rem;
        height: 2.35rem;
        padding: 0;
        text-align: center;
      }
    }
  `,
})
export class NumberField {
  readonly value = input<number | null>(null);
  readonly min = input(0);
  readonly max = input(99999);
  readonly ariaLabel = input('Number');
  readonly valueChange = output<number>();

  private readonly focused = signal(false);
  private readonly draft = signal('');

  protected readonly shown = computed(() => {
    if (this.focused()) {
      return this.draft();
    }
    const v = this.value();
    return v == null ? '' : String(v);
  });

  protected onFocus(): void {
    const v = this.value();
    this.draft.set(v == null ? '' : String(v));
    this.focused.set(true);
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.valueChange.emit(this.clamp(this.parse(this.draft())));
  }

  protected onBefore(event: InputEvent): void {
    if (event.inputType.startsWith('delete') || event.inputType === 'insertReplacementText') {
      return;
    }
    if (event.data && /\D/.test(event.data)) {
      event.preventDefault();
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const next = digitsOnly(event.clipboardData?.getData('text') ?? '');
    this.applyDraft(next);
  }

  protected onInput(raw: string): void {
    this.applyDraft(digitsOnly(raw));
  }

  private applyDraft(digits: string): void {
    this.draft.set(digits);
    if (digits === '') {
      return;
    }
    this.valueChange.emit(this.clamp(Number(digits)));
  }

  private parse(raw: string): number {
    if (!raw) {
      return this.min();
    }
    return Number(raw);
  }

  private clamp(n: number): number {
    if (!Number.isFinite(n)) {
      return this.min();
    }
    return Math.min(this.max(), Math.max(this.min(), Math.round(n)));
  }
}
