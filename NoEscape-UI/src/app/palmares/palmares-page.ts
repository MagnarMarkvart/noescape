import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { onRemoteChange } from '../core/data-sync';
import { ConfirmService } from '../shared/ui/confirm-host';
import { IconField } from '../shared/ui/icon-field';
import { Skill } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import {
  AttemptResult,
  PalmaresRecord,
  PalmaresService,
  PalmaresUnit,
  RecordInput,
  UNIT_LABEL,
} from './palmares.service';

type Draft = {
  name: string;
  icon: string;
  unit: PalmaresUnit;
  higherIsBetter: boolean;
  target: string;
  skillSlug: string;
};

const EMPTY_DRAFT: Draft = { name: '', icon: '🏆', unit: 'seconds', higherIsBetter: true, target: '', skillSlug: '' };
const DEADHANG: Draft = { name: 'Deadhang', icon: '🧗', unit: 'seconds', higherIsBetter: true, target: '15', skillSlug: '' };

@Component({
  selector: 'app-palmares-page',
  imports: [DecimalPipe, IconField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../level-ups/level-ups-page.css',
  styles: `
    .lede { color: var(--rs-muted); font-size: 0.9rem; margin: 0 0 1rem; max-width: 42rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    button { font-family: var(--font-display); padding: 0.35rem 0.8rem; border: 1px solid var(--rs-border); background: rgba(20, 16, 10, 0.6); color: var(--rs-text); cursor: pointer; }
    button.primary { background: linear-gradient(#d4a84b, #a8822f); color: #1a140a; border-color: #d4a84b; }
    button.ghost { background: transparent; }
    button.danger { border-color: #c45c4a; color: #f0b4a8; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .form { border: 1px solid var(--rs-border); background: rgba(20, 16, 10, 0.5); padding: 0.8rem; display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); margin-bottom: 1rem; }
    .form label { display: grid; gap: 0.2rem; font-size: 0.78rem; color: var(--rs-muted); }
    .form input, .form select, .log input { background: rgba(12, 10, 6, 0.8); color: var(--rs-text); border: 1px solid var(--rs-border); padding: 0.35rem 0.45rem; font: inherit; min-width: 0; }
    .form .row-end { grid-column: 1 / -1; display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap; }
    .err { color: #f0b4a8; font-size: 0.85rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 0.8rem; }
    .card { border: 1px solid var(--rs-border); background: rgba(20, 16, 10, 0.55); padding: 0.8rem; display: grid; gap: 0.55rem; min-width: 0; position: relative; }
    .card.met { border-color: #d4a84b; box-shadow: 0 0 0 1px rgba(212, 168, 75, 0.35) inset; }
    .head { display: flex; gap: 0.5rem; align-items: center; }
    .head .icon { font-size: 1.5rem; }
    .head h2 { margin: 0; font-family: var(--font-display); font-size: 1.05rem; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .tools { display: flex; gap: 0.25rem; }
    .tools button { padding: 0.15rem 0.45rem; font-size: 0.8rem; }
    .best { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .best b { font-size: 1.9rem; color: var(--rs-accent); font-variant-numeric: tabular-nums; }
    .best small, .meta { color: var(--rs-muted); font-size: 0.78rem; }
    .bar { height: 6px; background: rgba(255, 255, 255, 0.08); border: 1px solid var(--rs-border); }
    .bar span { display: block; height: 100%; background: linear-gradient(90deg, #8a7340, #d4a84b); }
    .watch { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .watch .clock { font-size: 1.5rem; font-variant-numeric: tabular-nums; min-width: 5.5ch; }
    .watch .clock.beat { color: #8fbf88; }
    .log { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .log input { width: 6.5rem; }
    .pb { position: absolute; top: -0.7rem; right: 0.6rem; background: #d4a84b; color: #1a140a; font-family: var(--font-display); font-size: 0.75rem; padding: 0.15rem 0.5rem; letter-spacing: 0.08em; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; font-size: 0.82rem; }
    ol li { display: flex; gap: 0.5rem; align-items: center; }
    ol li .v { font-variant-numeric: tabular-nums; min-width: 4.5rem; }
    ol li .d { color: var(--rs-muted); flex: 1; }
    ol li .tag { color: #d4a84b; font-size: 0.72rem; }
    ol li button { padding: 0 0.35rem; font-size: 0.75rem; }
  `,
  template: `
    <section class="levelups-shell">
      <header class="toolbar">
        <div class="brand-block">
          <p class="kicker">Personal records</p>
          <h1>Palmares</h1>
        </div>
        <div class="actions">
          <button type="button" class="primary" (click)="openForm(null)">New record</button>
        </div>
      </header>
      <p class="lede">
        Track personal bests — a timed deadhang, max reps, a lift. Timed records have a built-in stopwatch.
        A new PB earns XP for the linked skill, and reaching the target pays a one-time bonus.
      </p>

      @if (formOpen()) {
        <form class="form" (submit)="$event.preventDefault(); save()">
          <label>Name <input name="name" [value]="draft().name" (input)="patch('name', $any($event.target).value)" maxlength="60" required /></label>
          <app-icon-field [value]="draft().icon" (valueChange)="patch('icon', $event)" />
          <label>Unit
            <select name="unit" [value]="draft().unit" (change)="patch('unit', $any($event.target).value)">
              <option value="seconds">Seconds (timed)</option>
              <option value="reps">Reps</option>
              <option value="kg">Kilograms</option>
              <option value="m">Metres</option>
            </select>
          </label>
          <label>Better is
            <select name="dir" [value]="draft().higherIsBetter ? 'up' : 'down'" (change)="patch('higherIsBetter', $any($event.target).value === 'up')">
              <option value="up">Higher</option>
              <option value="down">Lower (e.g. a run time)</option>
            </select>
          </label>
          <label>Target (optional) <input name="target" type="number" min="0" step="0.1" [value]="draft().target" (input)="patch('target', $any($event.target).value)" /></label>
          <label>Skill for PB XP (optional)
            <select name="skill" [value]="draft().skillSlug" (change)="patch('skillSlug', $any($event.target).value)">
              <option value="">— none —</option>
              @for (s of skills(); track s.id) {
                <option [value]="s.slug" [selected]="s.slug === draft().skillSlug">{{ s.name }}</option>
              }
            </select>
          </label>
          @if (formError()) { <p class="err">{{ formError() }}</p> }
          <div class="row-end">
            <button type="button" class="ghost" (click)="formOpen.set(false)">Cancel</button>
            <button type="submit" class="primary">{{ editingId() ? 'Save' : 'Create' }}</button>
          </div>
        </form>
      }

      @if (records() === null) {
        <p class="state-msg">Loading…</p>
      } @else if (records()!.length === 0 && !formOpen()) {
        <p class="lede">No records yet.</p>
        <div class="actions">
          <button type="button" class="primary" (click)="openPreset()">Start with “Deadhang · 15 s”</button>
        </div>
      } @else {
        <div class="cards">
          @for (r of records(); track r.id) {
            <article class="card" [class.met]="r.targetMet" [attr.data-record]="r.name">
              @if (flash()[r.id]; as f) { <span class="pb" role="status">{{ f }}</span> }
              <div class="head">
                <span class="icon" aria-hidden="true">{{ r.icon || '🏆' }}</span>
                <h2>{{ r.name }}</h2>
                <div class="tools">
                  <button type="button" class="ghost" (click)="openForm(r)" [attr.aria-label]="'Edit ' + r.name">✎</button>
                  <button type="button" class="ghost danger" (click)="removeRecord(r)" [attr.aria-label]="'Delete ' + r.name">✕</button>
                </div>
              </div>
              <div class="best">
                <b>{{ r.best == null ? '—' : (r.best | number: '1.0-2') }}</b>
                <small>{{ unit(r) }} PB @if (r.bestDate) { · {{ r.bestDate }} }</small>
                @if (r.target) { <small>· target {{ r.target | number: '1.0-2' }} {{ unit(r) }} @if (r.targetMet) { ✓ } </small> }
              </div>
              @if (r.target && r.higherIsBetter) {
                <div class="bar" aria-hidden="true"><span [style.width.%]="progress(r)"></span></div>
              }
              @if (r.unit === 'seconds') {
                <div class="watch">
                  <span class="clock" [class.beat]="runningId() === r.id && beats(r)">{{ runningId() === r.id ? (elapsed() | number: '1.1-1') : '0.0' }}</span>
                  @if (runningId() === r.id) {
                    <button type="button" class="primary" (click)="stop(r)">Stop &amp; log</button>
                    <button type="button" class="ghost" (click)="cancelWatch()">Cancel</button>
                  } @else {
                    <button type="button" (click)="start(r)" [disabled]="runningId() !== null">Start</button>
                  }
                </div>
              }
              <div class="log">
                <input type="number" min="0" step="0.1" [attr.aria-label]="'Value for ' + r.name" [placeholder]="unit(r)" #v (keydown.enter)="logManual(r, v)" />
                <button type="button" (click)="logManual(r, v)">Log</button>
              </div>
              <p class="meta">{{ r.attemptCount }} attempt{{ r.attemptCount === 1 ? '' : 's' }}@if (r.skillSlug) { · XP → {{ skillName(r.skillSlug) }} }</p>
              @if (r.attempts.length) {
                <ol>
                  @for (a of r.attempts.slice(0, 5); track a.id) {
                    <li>
                      <span class="v">{{ a.value | number: '1.0-2' }} {{ unit(r) }}</span>
                      <span class="d">{{ a.date }}</span>
                      @if (a.isPb) { <span class="tag">PB</span> }
                      @if (a.xpAwarded) { <span class="tag">+{{ a.xpAwarded }} XP</span> }
                      <button type="button" class="ghost" (click)="removeAttempt(a.id, r)" aria-label="Delete attempt">✕</button>
                    </li>
                  }
                </ol>
              }
            </article>
          }
        </div>
      }
      @if (error()) { <p class="err">{{ error() }}</p> }
    </section>
  `,
})
export class PalmaresPage implements OnInit {
  private readonly api = inject(PalmaresService);
  private readonly skillsApi = inject(SkillsService);
  private readonly confirm = inject(ConfirmService);
  private readonly xp = inject(XpFeedbackService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly records = signal<PalmaresRecord[] | null>(null);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly draft = signal<Draft>({ ...EMPTY_DRAFT });
  protected readonly formError = signal('');
  protected readonly error = signal('');
  protected readonly flash = signal<Record<number, string>>({});
  protected readonly runningId = signal<number | null>(null);
  protected readonly elapsed = signal(0);
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly remoteSync = onRemoteChange(['palmares'], () => this.load());

  protected readonly skillNames = computed(() => new Map(this.skills().map((s) => [s.slug, s.name])));

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  ngOnInit(): void {
    this.load();
    this.skillsApi.getAll().subscribe({ next: (s) => this.skills.set([...s].sort((a, b) => a.name.localeCompare(b.name))) });
  }

  protected unit(r: PalmaresRecord): string {
    return UNIT_LABEL[r.unit] ?? r.unit;
  }

  protected skillName(slug: string): string {
    return this.skillNames().get(slug) ?? slug;
  }

  protected progress(r: PalmaresRecord): number {
    if (!r.target || r.best == null) return 0;
    return Math.min(100, (r.best / r.target) * 100);
  }

  protected beats(r: PalmaresRecord): boolean {
    return r.best != null && this.elapsed() > r.best;
  }

  protected patch<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected openForm(r: PalmaresRecord | null): void {
    this.formError.set('');
    this.editingId.set(r?.id ?? null);
    this.draft.set(
      r
        ? { name: r.name, icon: r.icon ?? '🏆', unit: r.unit, higherIsBetter: r.higherIsBetter, target: r.target == null ? '' : String(r.target), skillSlug: r.skillSlug ?? '' }
        : { ...EMPTY_DRAFT },
    );
    this.formOpen.set(true);
  }

  protected openPreset(): void {
    this.openForm(null);
    const physical = this.skills().find((s) => /strength|fitness|athlet|physical|body/i.test(`${s.slug} ${s.name}`));
    this.draft.set({ ...DEADHANG, skillSlug: physical?.slug ?? '' });
  }

  protected save(): void {
    const d = this.draft();
    const input: RecordInput = {
      name: d.name.trim(),
      icon: d.icon || null,
      unit: d.unit,
      higherIsBetter: d.higherIsBetter,
      target: d.target === '' ? null : Number(d.target),
      skillSlug: d.skillSlug || null,
    };
    const id = this.editingId();
    const req = id ? this.api.update(id, input) : this.api.create(input);
    req.subscribe({
      next: () => {
        this.formOpen.set(false);
        this.load();
      },
      error: (e) => this.formError.set(this.msg(e, 'Could not save')),
    });
  }

  protected async removeRecord(r: PalmaresRecord): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete “${r.name}”?`,
      body: `All ${r.attemptCount} attempts are deleted too. XP already earned stays.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    this.api.remove(r.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(this.msg(e, 'Could not delete')) });
  }

  protected async removeAttempt(attemptId: number, r: PalmaresRecord): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Delete this attempt?', body: `From ${r.name}. XP already earned stays.`, confirmLabel: 'Delete' });
    if (!ok) return;
    this.api.removeAttempt(attemptId).subscribe({ next: (rec) => this.replace(rec), error: (e) => this.error.set(this.msg(e, 'Could not delete')) });
  }

  protected start(r: PalmaresRecord): void {
    this.clearTimer();
    this.runningId.set(r.id);
    this.startedAt = performance.now();
    this.elapsed.set(0);
    this.timer = setInterval(() => this.elapsed.set((performance.now() - this.startedAt) / 1000), 100);
  }

  protected stop(r: PalmaresRecord): void {
    const secs = Math.round(((performance.now() - this.startedAt) / 1000) * 10) / 10;
    this.cancelWatch();
    if (secs > 0) this.log(r, secs);
  }

  protected cancelWatch(): void {
    this.clearTimer();
    this.runningId.set(null);
    this.elapsed.set(0);
  }

  protected logManual(r: PalmaresRecord, input: HTMLInputElement): void {
    const v = Number(input.value);
    if (!Number.isFinite(v) || v <= 0) return;
    input.value = '';
    this.log(r, v);
  }

  private log(r: PalmaresRecord, value: number): void {
    this.error.set('');
    this.api.addAttempt(r.id, value).subscribe({
      next: (res) => this.afterAttempt(res),
      error: (e) => this.error.set(this.msg(e, 'Could not log attempt')),
    });
  }

  private afterAttempt(res: AttemptResult): void {
    this.replace(res.record);
    const label = res.targetReached ? 'TARGET REACHED' : res.pb && !res.firstAttempt ? 'NEW PB' : res.firstAttempt ? 'FIRST MARK' : '';
    if (label) {
      const id = res.record.id;
      this.flash.update((f) => ({ ...f, [id]: label }));
      setTimeout(() => this.flash.update((f) => { const n = { ...f }; delete n[id]; return n; }), 4000);
    }
    if (res.award) this.xp.publishAward(res.award as Parameters<XpFeedbackService['publishAward']>[0]);
  }

  private replace(rec: PalmaresRecord): void {
    this.records.update((list) => (list ?? []).map((r) => (r.id === rec.id ? rec : r)));
  }

  private load(): void {
    this.api.list().subscribe({
      next: (list) => this.records.set(list),
      error: (e) => {
        this.records.set([]);
        this.error.set(this.msg(e, 'Could not load records'));
      },
    });
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private msg(e: { error?: { message?: string | string[] } }, fallback: string): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(', ') : m || fallback;
  }
}
