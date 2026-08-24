import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { CharacterService } from '../character/character.service';
import { formatElapsedShort } from './time';
import {
  clockKindLabel,
  WorkIntervalRecord,
  WorkIntervalTarget,
} from './work-interval.model';
import { WorkIntervalsService } from './work-intervals.service';

/**
 * Collapsible list of raw WorkInterval flushes for one target (a daily,
 * subtask, quest daily-work slice, Scriptorium work, or Vigilia watch).
 * Same log, reused everywhere Phase E needs to show "how this time was
 * tracked" — Horologium, dailies, quest run, Scriptorium.
 */
@Component({
  selector: 'app-work-interval-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasTarget()) {
      <div class="wil">
        <button type="button" class="wil-toggle" (click)="toggle()">
          {{ open() ? 'Hide log' : 'Show log' }}
          @if (!open() && total() > 0) {
            <span class="wil-total">· {{ totalLabel() }}</span>
          }
        </button>
        @if (open()) {
          @if (loading()) {
            <p class="wil-state">Loading…</p>
          } @else if (rows().length === 0) {
            <p class="wil-state">No tracked time yet.</p>
          } @else {
            <ul class="wil-list">
              @for (row of rows(); track row.id) {
                <li>
                  <span class="wil-kind">{{ clockKindLabel(row.clockKind) }}</span>
                  <span class="wil-span">{{ span(row) }}</span>
                  <span class="wil-ms">{{ formatElapsedShort(row.elapsedMs) }}</span>
                </li>
              }
            </ul>
            <p class="wil-total-line">Total {{ totalLabel() }}</p>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      max-width: 100%;
    }

    .wil-toggle {
      font-family: var(--font-display, inherit);
      font-size: 0.78rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--rs-muted, #b8a878);
      cursor: pointer;
      text-decoration: underline dotted;
    }

    .wil-toggle:hover {
      color: var(--rs-accent, #d4a84b);
    }

    .wil-total {
      text-decoration: none;
    }

    .wil-state {
      margin: 0.35rem 0 0;
      font-size: 0.78rem;
      color: var(--rs-muted, #b8a878);
    }

    .wil-list {
      list-style: none;
      margin: 0.35rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.25rem;
      max-height: 12rem;
      overflow-y: auto;
    }

    .wil-list li {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: baseline;
      font-size: 0.78rem;
      color: var(--rs-text, inherit);
      min-width: 0;
    }

    .wil-kind {
      flex: 0 0 auto;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--rs-muted, #b8a878);
      font-size: 0.68rem;
    }

    .wil-span {
      flex: 1 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .wil-ms {
      flex: 0 0 auto;
      white-space: nowrap;
      color: var(--rs-accent, #d4a84b);
    }

    .wil-total-line {
      margin: 0.35rem 0 0;
      font-size: 0.78rem;
      color: var(--rs-muted, #b8a878);
    }
  `,
})
export class WorkIntervalLog {
  private readonly service = inject(WorkIntervalsService);
  private readonly character = inject(CharacterService);

  readonly target = input<WorkIntervalTarget | null>(null);

  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly rows = signal<WorkIntervalRecord[]>([]);
  protected readonly clockKindLabel = clockKindLabel;
  protected readonly formatElapsedShort = formatElapsedShort;

  protected readonly hasTarget = computed(() => {
    const t = this.target();
    return !!(
      t &&
      (t.dailyTaskId != null ||
        t.questSubtaskId != null ||
        t.questId != null ||
        t.questRunId != null ||
        t.scriptoriumWorkId != null ||
        t.watchId != null)
    );
  });

  protected readonly total = computed(() =>
    this.rows().reduce((sum, row) => sum + row.elapsedMs, 0),
  );

  protected readonly totalLabel = computed(() => formatElapsedShort(this.total()));

  constructor() {
    effect(() => {
      this.target();
      this.open.set(false);
      this.rows.set([]);
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    this.load();
  }

  protected span(row: WorkIntervalRecord): string {
    return `${this.character.formatDateTime(row.startedAt)} → ${this.character.formatTime(row.endedAt)}`;
  }

  private load(): void {
    const t = this.target();
    if (!t) {
      return;
    }
    this.loading.set(true);
    this.service.list(t).subscribe({
      next: (rows) => {
        this.loading.set(false);
        this.rows.set(rows);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
}
