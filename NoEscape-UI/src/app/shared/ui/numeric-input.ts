import { Directive } from '@angular/core';
import { digitsOnly } from './number-field';

/** Digit-only numeric keyboard on native inputs (including FormField). */
@Directive({
  selector: 'input[appNumeric]',
  host: {
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    autocomplete: 'off',
    enterkeyhint: 'done',
    '[class.numeric-input]': 'true',
    '(beforeinput)': 'onBefore($event)',
    '(paste)': 'onPaste($event)',
    '(input)': 'onInput($event)',
  },
})
export class NumericInput {
  protected onBefore(event: InputEvent): void {
    if (
      event.inputType.startsWith('delete') ||
      event.inputType === 'insertReplacementText'
    ) {
      return;
    }
    if (event.data && /\D/.test(event.data)) {
      event.preventDefault();
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const el = event.target as HTMLInputElement | null;
    if (!el) {
      return;
    }
    event.preventDefault();
    const digits = digitsOnly(event.clipboardData?.getData('text') ?? '');
    el.value = digits;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  protected onInput(event: Event): void {
    const el = event.target as HTMLInputElement | null;
    if (!el) {
      return;
    }
    const digits = digitsOnly(el.value);
    if (el.value !== digits) {
      el.value = digits;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
