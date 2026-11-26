import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import { RuneCheck } from '../shared/rune-check';
import { TimedToast } from '../shared/timed-toast';
import { UiConfirm } from '../shared/ui/ui-confirm';

type LogKindRow = { kind: string; label: string; note: string; count: number };
type LogsSummary = {
  kinds: LogKindRow[];
  retention: { days: number | null; kinds: string[] };
};

const RETENTION_OPTIONS = [
  { days: 0, label: 'Keep forever' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
];

@Component({
  selector: 'app-settings-logs-page',
  imports: [RuneCheck, UiConfirm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './settings-pomodoro-page.css',
  styles: `
    .kind-row { display: grid; gap: 0.15rem; }
    .kind-row small { color: var(--rs-muted); font-size: 0.78rem; margin-left: 2rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .actions label { display: flex; gap: 0.4rem; align-items: center; color: var(--rs-muted); font-size: 0.85rem; }
    select, input[type='date'] {
      background: rgba(12, 10, 6, 0.8); color: var(--rs-text);
      border: 1px solid var(--rs-border); padding: 0.35rem 0.5rem;
    }
    button {
      font-family: var(--font-display); letter-spacing: 0.04em;
      padding: 0.45rem 0.9rem; border: 1px solid var(--rs-border);
      background: rgba(20, 16, 10, 0.6); color: var(--rs-text); cursor: pointer;
    }
    button.danger { border-color: var(--rs-danger); color: #f3c3b8; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
  `,
  template: `
    @if (toast()) {
      <p class="toast" role="status">{{ toast() }}</p>
    }
    <p class="lede">
      Export everything, clear out test runs, or let old logs expire. Skill XP,
      levels, quests, habits and tasks themselves are never removed here.
    </p>

    <fieldset class="option-group">
      <legend>Log kinds</legend>
      @for (row of rows(); track row.kind) {
        <div class="kind-row">
          <app-rune-check
            [label]="row.label + ' (' + row.count + ')'"
            [checked]="selected().has(row.kind)"
            (checkedChange)="toggle(row.kind, $event)"
          />
          <small>{{ row.note }}</small>
        </div>
      }
    </fieldset>

    <fieldset class="option-group">
      <legend>Export</legend>
      <p class="hint">Downloads all logs as one JSON file (always all kinds).</p>
      <div class="actions">
        <button type="button" (click)="exportAll()" [disabled]="busy()">Export JSON</button>
      </div>
    </fieldset>

    <fieldset class="option-group">
      <legend>Delete</legend>
      <div class="actions">
        <label>
          Only older than
          <input type="date" [value]="before()" (change)="before.set($any($event.target).value)" />
        </label>
        <button
          type="button"
          class="danger"
          [disabled]="busy() || selected().size === 0"
          (click)="confirmOpen.set(true)"
        >
          Delete selected logs
        </button>
      </div>
      <p class="hint">Leave the date empty to delete every entry of the checked kinds.</p>
    </fieldset>

    <fieldset class="option-group">
      <legend>Retention</legend>
      <div class="actions">
        <label>
          Keep checked kinds for
          <select [value]="'' + retentionDays()" (change)="retentionDays.set(+$any($event.target).value)">
            @for (o of retentionOptions; track o.days) {
              <option [value]="'' + o.days">{{ o.label }}</option>
            }
          </select>
        </label>
        <button type="button" (click)="saveRetention()" [disabled]="busy()">Save retention</button>
      </div>
      <p class="hint">
        @if (savedRetention().days) {
          Active: {{ savedRetention().days }} days for {{ savedRetention().kinds.join(', ') || 'no kinds' }}.
          Checked every 6 hours.
        } @else {
          Off — logs are kept forever.
        }
      </p>
    </fieldset>

    @if (confirmOpen()) {
      <app-ui-confirm
        kicker="Logs"
        [title]="before() ? 'Delete older log entries?' : 'Delete ' + selectedCount() + ' log entries?'"
        [body]="before()
          ? 'Entries older than ' + before() + ' in: ' + selectedLabels() + '. This cannot be undone — export first if unsure.'
          : 'Every entry in: ' + selectedLabels() + '. This cannot be undone — export first if unsure.'"
        confirmLabel="Delete"
        tone="danger"
        [busy]="busy()"
        (dismiss)="confirmOpen.set(false)"
        (secondary)="confirmOpen.set(false)"
        (confirm)="purge()"
      />
    }
  `,
})
export class SettingsLogsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly rows = signal<LogKindRow[]>([]);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly before = signal('');
  protected readonly busy = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly retentionDays = signal(0);
  protected readonly savedRetention = signal<{ days: number | null; kinds: string[] }>({
    days: null,
    kinds: [],
  });
  protected readonly retentionOptions = RETENTION_OPTIONS;

  protected readonly selectedCount = computed(() =>
    this.rows()
      .filter((r) => this.selected().has(r.kind))
      .reduce((n, r) => n + r.count, 0),
  );
  protected readonly selectedLabels = computed(() =>
    this.rows()
      .filter((r) => this.selected().has(r.kind))
      .map((r) => r.label)
      .join(', '),
  );

  ngOnInit(): void {
    this.load(true);
  }

  protected toggle(kind: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) {
      next.add(kind);
    } else {
      next.delete(kind);
    }
    this.selected.set(next);
  }

  protected exportAll(): void {
    this.busy.set(true);
    this.http.get(`${API_BASE_URL}/logs/export`).subscribe({
      next: (data) => {
        this.busy.set(false);
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `noescape-logs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.timed.set('Export downloaded');
      },
      error: () => {
        this.busy.set(false);
        this.timed.set('Export failed');
      },
    });
  }

  protected purge(): void {
    this.busy.set(true);
    this.http
      .post<{ deleted: Record<string, number> }>(`${API_BASE_URL}/logs/purge`, {
        kinds: [...this.selected()],
        before: this.before() || null,
        confirm: 'DELETE',
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.confirmOpen.set(false);
          const total = Object.values(res.deleted).reduce((n, v) => n + v, 0);
          this.timed.set(`Deleted ${total} log entries`);
          this.load(false);
        },
        error: (err: { error?: { message?: string } }) => {
          this.busy.set(false);
          this.confirmOpen.set(false);
          this.timed.set(err.error?.message ?? 'Delete failed');
        },
      });
  }

  protected saveRetention(): void {
    this.busy.set(true);
    this.http
      .put<LogsSummary>(`${API_BASE_URL}/logs/retention`, {
        days: this.retentionDays() || null,
        kinds: [...this.selected()],
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.apply(res, false);
          this.timed.set(res.retention.days ? 'Retention saved' : 'Retention off');
        },
        error: (err: { error?: { message?: string } }) => {
          this.busy.set(false);
          this.timed.set(err.error?.message ?? 'Could not save retention');
        },
      });
  }

  private load(initial: boolean): void {
    this.http.get<LogsSummary>(`${API_BASE_URL}/logs`).subscribe({
      next: (res) => this.apply(res, initial),
      error: () => this.timed.set('Could not load logs'),
    });
  }

  private apply(res: LogsSummary, initial: boolean): void {
    this.rows.set(res.kinds);
    this.savedRetention.set(res.retention);
    if (initial) {
      this.retentionDays.set(res.retention.days ?? 0);
      this.selected.set(new Set(res.retention.kinds));
    }
  }
}
