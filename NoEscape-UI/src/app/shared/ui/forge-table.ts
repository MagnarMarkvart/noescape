import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ForgeTableColumn = {
  key: string;
  label: string;
  /** CSS grid track, e.g. `2.35rem` or `minmax(0, 1fr)`. */
  width: string;
};

@Component({
  selector: 'app-forge-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table" role="table">
      <div class="head" role="row">
        @for (col of columns(); track col.key) {
          <span class="h" role="columnheader" [class.blank]="!col.label">{{
            col.label
          }}</span>
        }
      </div>
      <div class="body">
        <ng-content />
      </div>
      @if (addLabel()) {
        <button type="button" class="add" (click)="add.emit()">
          {{ addLabel() }}
        </button>
      }
    </div>
  `,
  host: {
    '[style.--forge-cols]': 'colTracks()',
  },
  styles: `
    :host {
      display: block;
      min-width: 0;
      padding-top: 0.2rem;
    }
    .table {
      display: grid;
      gap: 0.45rem;
      min-width: 0;
    }
    .head {
      display: grid;
      grid-template-columns: var(--forge-cols);
      gap: 0.4rem 0.45rem;
      margin: 0.2rem 0 0;
      padding: 0.55rem 0.1rem 0.45rem;
      border-bottom: 1px solid rgba(138, 115, 64, 0.55);
      color: #b8a878;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .h {
      min-width: 0;
    }
    .h:empty,
    .h.blank {
      visibility: hidden;
    }
    .body {
      display: grid;
      min-width: 0;
    }
    .add {
      justify-self: start;
      margin-top: 0.25rem;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.72rem;
      padding: 0.25rem 0.45rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #b8a878;
      cursor: pointer;
    }
    @media (max-width: 600px) {
      .head {
        grid-template-columns: 2.35rem minmax(0, 1fr) 2.35rem 2.35rem;
        font-size: 0.55rem;
        letter-spacing: 0.04em;
      }
    }
  `,
})
export class ForgeTable {
  readonly columns = input.required<ForgeTableColumn[]>();
  readonly addLabel = input('');
  readonly add = output<void>();

  protected readonly colTracks = computed(() =>
    this.columns()
      .map((c) => c.width)
      .join(' '),
  );
}

@Component({
  selector: 'app-forge-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  styles: `
    :host {
      display: grid;
      grid-template-columns: var(--forge-cols);
      gap: 0.4rem 0.45rem;
      align-items: start;
      min-width: 0;
      padding: 0.2rem 0;
    }
    :host > * {
      min-width: 0;
    }
    @media (max-width: 600px) {
      :host {
        grid-template-columns: 2.35rem minmax(0, 1fr) 2.35rem 2.35rem;
        gap: 0.35rem;
        padding: 0.55rem 0;
        border-bottom: 1px solid rgba(138, 115, 64, 0.5);
        align-items: start;
      }
      :host > .trail {
        width: 2.35rem;
        max-width: 2.35rem;
      }
    }
  `,
})
export class ForgeRow {}
