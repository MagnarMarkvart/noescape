import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DailyTaskSlot } from './daily.model';

export type PlanChange = { id: number; plannedStart: string | null };

type PlanRow = {
  slot: DailyTaskSlot;
  start: number | null;
  end: number | null;
  overlaps: boolean;
};

const TIER_RANK: Record<string, number> = { MOST_IMPORTANT: 0, IMPORTANT: 1, REGULAR: 2 };

export function toMinutes(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function fromMinutes(total: number): string {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/**
 * Place untimed tasks one after another from `from`, in board order, skipping
 * over tasks that already have a fixed start (e.g. "shave at 07:30").
 */
export function autoPlan(
  slots: Array<{ id: number; start: number | null; duration: number }>,
  from: number,
): Map<number, number> {
  const fixed = slots
    .filter((s) => s.start != null)
    .map((s) => ({ a: s.start!, b: s.start! + s.duration }))
    .sort((x, y) => x.a - y.a);
  const out = new Map<number, number>();
  let cursor = from;
  for (const s of slots) {
    if (s.start != null) {
      continue;
    }
    let moved = true;
    while (moved) {
      moved = false;
      for (const f of fixed) {
        if (cursor < f.b && cursor + s.duration > f.a) {
          cursor = f.b;
          moved = true;
        }
      }
    }
    out.set(s.id, cursor);
    fixed.push({ a: cursor, b: cursor + s.duration });
    cursor += s.duration;
  }
  return out;
}

@Component({
  selector: 'app-daily-time-plan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="plan" aria-label="Time plan">
      <header>
        <h2>Time plan</h2>
        @if (canEdit()) {
          <div class="auto">
            <label>
              Plan the rest from
              <input type="time" [value]="autoFrom()" (change)="autoFrom.set($any($event.target).value)" />
            </label>
            <button type="button" (click)="runAuto()" [disabled]="untimedCount() === 0">Fill</button>
            <button type="button" class="ghost" (click)="clearAll()" [disabled]="timedCount() === 0">Clear</button>
          </div>
        }
      </header>
      <ol>
        @for (row of rows(); track row.slot.id) {
          <li [class.done]="row.slot.completed" [class.overlap]="row.overlaps" [class.untimed]="row.start == null">
            @if (canEdit() && !row.slot.completed) {
              <input
                type="time"
                [value]="row.start == null ? '' : fmt(row.start)"
                (change)="set(row.slot, $any($event.target).value)"
                [attr.aria-label]="'Start of ' + row.slot.title"
              />
            } @else {
              <span class="time">{{ row.start == null ? '—' : fmt(row.start) }}</span>
            }
            <span class="span">
              @if (row.end != null) { → {{ fmt(row.end) }} }
            </span>
            <span class="title">{{ row.slot.title }}</span>
            <span class="dur">{{ row.slot.durationMinutes }}m</span>
            @if (row.overlaps) { <span class="warn">overlap</span> }
          </li>
        }
      </ol>
      <p class="hint">
        Planned {{ plannedMinutes() }}m of {{ totalMinutes() }}m open.
        @if (lastEnd() != null) { Ends around {{ fmt(lastEnd()!) }}. }
        Untimed tasks stay in board order below.
      </p>
    </section>
  `,
  styles: `
    .plan { border: 1px solid #8a7340; background: rgba(20, 16, 10, 0.5); padding: 0.75rem 0.9rem; margin: 0 0 1rem; color: #f0e6c8; }
    header { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: space-between; align-items: center; }
    h2 { margin: 0; font-family: 'Cinzel', Palatino, serif; font-size: 1rem; color: #d4a84b; }
    .auto { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; font-size: 0.82rem; color: #b8a878; }
    .auto label { display: flex; gap: 0.35rem; align-items: center; }
    ol { list-style: none; margin: 0.6rem 0 0; padding: 0; display: grid; gap: 0.3rem; }
    li { display: grid; grid-template-columns: 7.6rem 4.2rem minmax(0, 1fr) auto auto; gap: 0.5rem; align-items: center; padding: 0.3rem 0.4rem; border-left: 3px solid #8a7340; background: rgba(12, 10, 6, 0.45); }
    li.untimed { border-left-color: #4a3d28; opacity: 0.85; }
    li.done .title { text-decoration: line-through; color: #8fbf88; }
    li.overlap { border-left-color: #c45c4a; }
    .title { overflow-wrap: anywhere; }
    .dur, .span, .time { color: #b8a878; font-size: 0.82rem; font-variant-numeric: tabular-nums; }
    .warn { color: #f0b4a8; font-size: 0.72rem; text-transform: uppercase; }
    input[type='time'] { background: rgba(12, 10, 6, 0.8); color: #f0e6c8; border: 1px solid #8a7340; padding: 0.2rem 0.3rem; width: 100%; }
    button { font-family: 'Cinzel', Palatino, serif; padding: 0.3rem 0.7rem; border: 1px solid #8a7340; background: rgba(20, 16, 10, 0.6); color: #f0e6c8; cursor: pointer; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .hint { margin: 0.5rem 0 0; font-size: 0.78rem; color: #b8a878; }
    @media (max-width: 560px) {
      li { grid-template-columns: 5.6rem minmax(0, 1fr) auto; }
      li .span, li .warn { display: none; }
    }
  `,
})
export class DailyTimePlan {
  readonly tasks = input.required<DailyTaskSlot[]>();
  readonly canEdit = input(false);
  readonly planned = output<PlanChange[]>();
  protected readonly autoFrom = signal('08:00');

  protected readonly rows = computed<PlanRow[]>(() => {
    const base = this.tasks()
      .filter((s) => s.id != null)
      .map((slot) => {
        const start = toMinutes(slot.plannedStart);
        return { slot, start, end: start == null ? null : start + (slot.durationMinutes || 0), overlaps: false };
      });
    const timed = base.filter((r) => r.start != null).sort((a, b) => a.start! - b.start!);
    for (let i = 1; i < timed.length; i++) {
      if (timed[i].start! < timed[i - 1].end!) {
        timed[i].overlaps = true;
        timed[i - 1].overlaps = true;
      }
    }
    const untimed = base
      .filter((r) => r.start == null)
      .sort((a, b) => (TIER_RANK[a.slot.importance] - TIER_RANK[b.slot.importance]) || a.slot.slotIndex - b.slot.slotIndex);
    return [...timed, ...untimed];
  });

  protected readonly timedCount = computed(() => this.rows().filter((r) => r.start != null).length);
  protected readonly untimedCount = computed(() => this.rows().filter((r) => r.start == null && !r.slot.completed).length);
  protected readonly totalMinutes = computed(() => this.rows().filter((r) => !r.slot.completed).reduce((n, r) => n + (r.slot.durationMinutes || 0), 0));
  protected readonly plannedMinutes = computed(() =>
    this.rows().filter((r) => r.start != null).reduce((n, r) => n + (r.slot.durationMinutes || 0), 0),
  );
  protected readonly lastEnd = computed(() => {
    const ends = this.rows().map((r) => r.end).filter((e): e is number => e != null);
    return ends.length ? Math.max(...ends) : null;
  });

  protected fmt(m: number): string {
    return fromMinutes(m);
  }

  protected set(slot: DailyTaskSlot, value: string): void {
    if (slot.id == null) return;
    this.planned.emit([{ id: slot.id, plannedStart: value || null }]);
  }

  protected runAuto(): void {
    const from = toMinutes(this.autoFrom()) ?? 480;
    const rows = this.rows().filter((r) => !r.slot.completed || r.start != null);
    const plan = autoPlan(
      rows.map((r) => ({ id: r.slot.id!, start: r.start, duration: r.slot.durationMinutes || 0 })),
      from,
    );
    this.planned.emit([...plan.entries()].map(([id, m]) => ({ id, plannedStart: fromMinutes(m) })));
  }

  protected clearAll(): void {
    this.planned.emit(
      this.rows().filter((r) => r.start != null && !r.slot.completed).map((r) => ({ id: r.slot.id!, plannedStart: null })),
    );
  }
}
