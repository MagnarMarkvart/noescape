import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiIconName =
  | 'wrench'
  | 'stopwatch'
  | 'back'
  | 'note'
  | 'chevron'
  | 'log'
  | 'close'
  | 'calendar'
  | 'check'
  | 'gate'
  | 'grip'
  | 'quest'
  | 'shelf';

@Component({
  selector: 'app-ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('wrench') {
          <path d="M14.7 6.3a4.5 4.5 0 0 0-6.2 6.2L3 18l3 3 5.5-5.5a4.5 4.5 0 0 0 6.2-6.2l-2.8 2.8-2.1-2.1z" />
        }
        @case ('stopwatch') {
          <circle cx="12" cy="14" r="8" />
          <path d="M12 14V10" />
          <path d="M10 3h4" />
          <path d="M12 3v2" />
          <path d="M19 8l1.5-1.5" />
        }
        @case ('back') {
          <path d="M15 6l-6 6 6 6" />
          <path d="M9 12h11" />
        }
        @case ('note') {
          <path d="M7 3h8l5 5v13H7z" />
          <path d="M15 3v5h5" />
          <path d="M10 13h6" />
          <path d="M10 17h4" />
        }
        @case ('chevron') {
          <path d="M6 9l6 6 6-6" />
        }
        @case ('log') {
          <path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 0-2 2V4z" />
          <path d="M6 4a2 2 0 0 0-2 2v14" />
          <path d="M10 9h6" />
          <path d="M10 13h5" />
        }
        @case ('close') {
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        }
        @case ('calendar') {
          <rect x="4" y="6" width="16" height="14" rx="1.5" />
          <path d="M8 4v4" />
          <path d="M16 4v4" />
          <path d="M4 11h16" />
        }
        @case ('check') {
          <path d="M5 13l4.2 4.2L19 7" />
        }
        @case ('gate') {
          <path class="body" d="M5 21V9.5A7 7 0 0 1 12 3a7 7 0 0 1 7 6.5V21H5z" />
          <path d="M8.5 21v-7" />
          <path d="M12 21v-9" />
          <path d="M15.5 21v-7" />
        }
        @case ('grip') {
          <circle cx="9" cy="6" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15" cy="6" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="9" cy="12" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="9" cy="18" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="15" cy="18" r="1.15" fill="currentColor" stroke="none" />
        }
        @case ('quest') {
          <path d="M8 20l2.2-7.2L18.5 4.5a2.1 2.1 0 0 1 3 3L13.2 15.8 6 18z" />
          <path d="M14.8 7.2l2 2" />
          <path d="M5.5 19.5l3-1" />
        }
        @case ('shelf') {
          <path d="M4 7h16v3.2H4z" />
          <path d="M6.2 10.2V19h11.6v-8.8" />
          <path d="M9.5 14.5h5" />
        }
      }
    </svg>
  `,
  host: {
    '[class.filled]': 'filled()',
  },
  styles: `
    :host {
      display: inline-flex;
      width: 1.15em;
      height: 1.15em;
      color: inherit;
      line-height: 0;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    :host.filled .body {
      fill: currentColor;
    }
  `,
})
export class UiIcon {
  readonly name = input.required<UiIconName>();
  readonly filled = input(false);
}
