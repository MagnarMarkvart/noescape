import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-effort-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="effort">
      @if (legend()) {
        <legend>{{ legend() }}</legend>
      }
      <label class="dial">
        <span class="readout">
          <strong>{{ clamped() }}</strong>
          <span class="of">/ 10</span>
        </span>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          [value]="clamped()"
          [attr.aria-label]="legend() || 'Effort level'"
          [attr.aria-valuemin]="1"
          [attr.aria-valuemax]="10"
          [attr.aria-valuenow]="clamped()"
          [style.--fill]="fillPct() + '%'"
          (input)="onInput($event)"
        />
        <span class="ends" aria-hidden="true">
          <span>1</span>
          <span>10</span>
        </span>
      </label>
      <ng-content />
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }
    .effort {
      display: grid;
      gap: 0.55rem;
      margin: 0;
      padding: 0.9rem 1rem 1.05rem;
      border: 1px solid #8a7340;
      background: rgba(22, 18, 10, 0.42);
      min-width: 0;
      min-inline-size: 0;
    }
    legend {
      padding: 0 0.4rem;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 1.05rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1.25;
      color: #d4a84b;
    }
    .dial {
      display: grid;
      gap: 0.45rem;
      min-width: 0;
    }
    .readout {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 0.25rem;
      color: #d4a84b;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      line-height: 1;
    }
    .readout strong {
      font-size: 1.85rem;
      font-weight: 500;
      letter-spacing: 0.04em;
    }
    .readout .of {
      color: #b8a878;
      font-size: 0.85rem;
      letter-spacing: 0.08em;
    }
    input[type='range'] {
      --fill: 44.444%;
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 0.55rem;
      margin: 0.45rem 0;
      border-radius: 999px;
      border: 1px solid #8a7340;
      background: linear-gradient(
        90deg,
        #d4a84b 0%,
        #d4a84b var(--fill),
        rgba(18, 14, 8, 0.72) var(--fill),
        rgba(18, 14, 8, 0.72) 100%
      );
      outline: none;
      cursor: grab;
      accent-color: #d4a84b;
      touch-action: none;
    }
    input[type='range']:active {
      cursor: grabbing;
    }
    input[type='range']:focus-visible {
      border-color: #c6a85a;
      box-shadow: 0 0 0 1px #d4a84b;
    }
    input[type='range']::-webkit-slider-runnable-track {
      height: 0.55rem;
      border-radius: 999px;
      background: transparent;
    }
    input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 1.35rem;
      height: 1.35rem;
      margin-top: calc((0.55rem - 1.35rem) / 2);
      border-radius: 50%;
      border: 1px solid #e0c06a;
      background:
        radial-gradient(circle at 35% 30%, #f0e6c8, #d4a84b 55%, #8a7340);
      box-shadow: 0 0 0 3px rgba(26, 20, 8, 0.55);
      cursor: grab;
    }
    input[type='range']:active::-webkit-slider-thumb {
      cursor: grabbing;
    }
    input[type='range']::-moz-range-track {
      height: 0.55rem;
      border-radius: 999px;
      background: transparent;
      border: 0;
    }
    input[type='range']::-moz-range-thumb {
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 50%;
      border: 1px solid #e0c06a;
      background:
        radial-gradient(circle at 35% 30%, #f0e6c8, #d4a84b 55%, #8a7340);
      box-shadow: 0 0 0 3px rgba(26, 20, 8, 0.55);
      cursor: grab;
    }
    .ends {
      display: flex;
      justify-content: space-between;
      color: #b8a878;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
    }
  `,
})
export class EffortField {
  readonly value = input.required<number>();
  readonly legend = input('Effort');
  readonly valueChange = output<number>();

  protected readonly clamped = computed(() =>
    Math.min(10, Math.max(1, Math.round(Number(this.value()) || 1))),
  );
  protected readonly fillPct = computed(
    () => ((this.clamped() - 1) / 9) * 100,
  );

  protected onInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    this.valueChange.emit(Math.min(10, Math.max(1, Math.round(raw || 1))));
  }
}
