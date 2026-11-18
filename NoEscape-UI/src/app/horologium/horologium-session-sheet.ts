import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CharacterService } from '../character/character.service';
import { UiScroll } from '../shared/ui/ui-scroll';
import {
  HorologiumSessionRecord,
  HorologiumSkillXp,
} from './horologium.model';

@Component({
  selector: 'app-horologium-session-sheet',
  imports: [DecimalPipe, RouterLink, UiScroll],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-scroll
      [kicker]="outcomeLabel()"
      [title]="formatDate(session().date)"
      titleId="horo-session-detail"
      (closed)="closed.emit()"
    >
      <div class="timeline" aria-label="Session span">
        <div>
          <p class="when-label">Start</p>
          <p class="when-clock">{{ clock(startIso()) }}</p>
          <p class="when-date">{{ stamp(startIso()) }}</p>
        </div>
        <span class="timeline-rule" aria-hidden="true"></span>
        <div>
          <p class="when-label">End</p>
          <p class="when-clock">{{ clock(session().completedAt) }}</p>
          <p class="when-date">{{ stamp(session().completedAt) }}</p>
        </div>
      </div>

      <dl class="facts">
        @if (session().kind === 'consuetudo') {
          <div>
            <dt>Practice</dt>
            <dd>{{ session().routineName || session().taskLabel || 'Consuetudo' }}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{{ minutesLabel(session().elapsedMinutes ?? session().durationMinutes) }}</dd>
          </div>
          <div>
            <dt>Planned</dt>
            <dd>{{ minutesLabel(session().workMinutes) }}</dd>
          </div>
          <div>
            <dt>Steps</dt>
            <dd>{{ session().iterations }}</dd>
          </div>
        } @else {
          <div>
            <dt>Work blocks</dt>
            <dd>{{ session().iterations }}</dd>
          </div>
          <div>
            <dt>Total work</dt>
            <dd>{{ minutesLabel(session().durationMinutes) }}</dd>
          </div>
          <div>
            <dt>Rest length</dt>
            <dd>{{ minutesLabel(session().restMinutes) }}</dd>
          </div>
          <div>
            <dt>Rest total</dt>
            <dd>{{ minutesLabel(restTotal()) }}</dd>
          </div>
        }
      </dl>

      @if (session().kind === 'consuetudo') {
        <section class="bind-row">
          <p class="kicker">Walk log</p>
          <a class="bind-name walk-link" routerLink="/consuetudo/log">Open walk log →</a>
        </section>
      }

      @if (session().watchName) {
        <section class="bind-row">
          <p class="kicker">Vigilia</p>
          <p class="bind-name">{{ session().watchName }}</p>
        </section>
      }

      @if (session().kind !== 'consuetudo' && session().taskLabel) {
        <section class="bind-row">
          <p class="kicker">Bound daily</p>
          <p class="bind-name">{{ session().taskLabel }}</p>
        </section>
      }

      @if (session().kind !== 'consuetudo') {
        <section class="xp-block" aria-label="XP by skill">
          <p class="kicker">XP by skill</p>
          @if (skillXp().length === 0) {
            <p class="muted">No skill XP on this entry.</p>
          } @else {
            <ul class="xp-list">
              @for (skill of skillXp(); track skill.slug) {
                <li [class.loss]="skill.xp < 0">
                  <span class="xp-skill">
                    <span aria-hidden="true">{{ skill.icon || '•' }}</span>
                    {{ skill.name }}
                  </span>
                  <span class="xp-amt">
                    {{ skill.xp >= 0 ? '+' : '−' }}{{ (skill.xp < 0 ? -skill.xp : skill.xp) | number }}
                  </span>
                </li>
              }
            </ul>
          }
        </section>
      }

      @if (session().kind !== 'consuetudo' && session().note) {
        <p class="detail-note">{{ session().note }}</p>
      }
    </app-ui-scroll>
  `,
  styles: `
    :host {
      --rs-border: #8a7340;
      --rs-border-bright: #c6a85a;
      --rs-text: #f0e6c8;
      --rs-muted: #b8a878;
      --rs-accent: #d4a84b;
      --rs-danger: #c45c4a;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
    }
    .timeline {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 0.75rem;
      align-items: center;
      padding: 0.85rem 0.9rem;
      border: 1px solid rgba(138, 115, 64, 0.55);
      background: rgba(16, 12, 8, 0.4);
    }
    .when-label {
      margin: 0;
      font-size: 0.68rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }
    .when-clock {
      margin: 0.2rem 0 0;
      font-family: var(--font-display);
      font-size: 1.7rem;
      letter-spacing: 0.04em;
      color: var(--rs-text);
      line-height: 1;
    }
    .when-date {
      margin: 0.35rem 0 0;
      color: var(--rs-muted);
      font-size: 0.78rem;
    }
    .timeline-rule {
      width: 2.4rem;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--rs-border-bright), transparent);
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.55rem;
      margin: 1rem 0 0;
    }
    .facts > div {
      padding: 0.7rem 0.75rem;
      border: 1px solid var(--rs-border);
      background: rgba(20, 16, 10, 0.45);
    }
    .facts dt {
      margin: 0;
      font-size: 0.68rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }
    .facts dd {
      margin: 0.25rem 0 0;
      font-family: var(--font-display);
      font-size: 1.2rem;
      color: var(--rs-accent);
    }
    .bind-row {
      margin: 0.85rem 0 0;
      padding: 0.7rem 0.8rem;
      border: 1px solid rgba(138, 115, 64, 0.55);
      background: rgba(20, 16, 10, 0.35);
    }
    .kicker {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }
    .bind-name {
      margin: 0.25rem 0 0;
      font-family: var(--font-display);
      font-size: 1.05rem;
    }
    a.bind-name {
      display: inline-block;
      color: var(--rs-accent);
      text-decoration: none;
    }
    a.bind-name:hover,
    a.bind-name:focus-visible {
      color: #e0c06a;
      outline: none;
    }
    .xp-block {
      margin: 1rem 0 0;
    }
    .muted {
      color: var(--rs-muted);
    }
    .xp-list {
      list-style: none;
      margin: 0.45rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.35rem;
    }
    .xp-list li {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid rgba(138, 115, 64, 0.45);
      background: rgba(20, 16, 10, 0.4);
    }
    .xp-skill {
      display: flex;
      gap: 0.45rem;
      align-items: center;
      font-family: var(--font-display);
    }
    .xp-amt {
      color: var(--rs-accent);
      font-family: var(--font-display);
    }
    .xp-list .loss .xp-amt {
      color: var(--rs-danger);
    }
    .detail-note {
      margin: 1rem 0 0;
      color: var(--rs-muted);
      font-size: 0.88rem;
      line-height: 1.45;
    }
    @media (max-width: 640px) {
      .timeline {
        grid-template-columns: 1fr;
        text-align: left;
      }
      .timeline-rule {
        width: 100%;
      }
      .when-clock {
        font-size: 1.4rem;
      }
    }
  `,
})
export class HorologiumSessionSheet {
  private readonly character = inject(CharacterService);

  readonly session = input.required<HorologiumSessionRecord>();
  readonly closed = output<void>();

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
  }

  protected clock(iso: string): string {
    return this.character.formatTime(iso);
  }

  protected stamp(iso: string): string {
    return this.character.formatDateTime(iso);
  }

  protected startIso(): string {
    const row = this.session();
    if (row.startedAt) {
      return row.startedAt;
    }
    const mins = Math.max(0, row.elapsedMinutes ?? row.durationMinutes ?? 0);
    return new Date(
      new Date(row.completedAt).getTime() - mins * 60_000,
    ).toISOString();
  }

  protected minutesLabel(mins: number): string {
    const n = Math.max(0, Math.round(mins) || 0);
    if (n < 1) {
      return 'under 1m';
    }
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (h > 0 && m > 0) {
      return `${h}h ${m}m`;
    }
    if (h > 0) {
      return `${h}h`;
    }
    return `${m}m`;
  }

  protected restTotal(): number {
    const row = this.session();
    if (row.restTotalMinutes != null) {
      return row.restTotalMinutes;
    }
    return row.restMinutes * Math.max(0, row.iterations - 1);
  }

  protected skillXp(): HorologiumSkillXp[] {
    const row = this.session();
    if (row.skillXp?.length) {
      return row.skillXp;
    }
    const out: HorologiumSkillXp[] = [];
    if (row.focusXpAwarded) {
      out.push({
        slug: 'focus',
        name: 'Focus',
        icon: row.skill?.slug === 'focus' ? row.skill.icon : '🎯',
        xp: row.focusXpAwarded,
      });
    }
    if (row.disciplineXpAwarded) {
      out.push({
        slug: 'discipline',
        name: 'Discipline',
        icon: row.skill?.slug === 'discipline' ? row.skill.icon : '⚖️',
        xp: row.disciplineXpAwarded,
      });
    }
    if (!out.length && row.skill) {
      out.push({
        slug: row.skill.slug,
        name: row.skill.name,
        icon: row.skill.icon,
        xp: row.xpAwarded,
      });
    }
    return out;
  }

  protected outcomeLabel(): string {
    const row = this.session();
    switch (row.outcome) {
      case 'block':
        return row.iterations > 1 ? 'Work block' : 'Track block';
      case 'goal':
        return 'Sessio complete';
      case 'abandon':
        return 'Stopped early';
      case 'task':
        return 'Task settled';
      case 'task_early':
        return 'Ended after task';
      case 'consuetudo':
        return 'Consuetudo';
      default:
        return row.endedEarly ? 'Ended early' : 'Session';
    }
  }
}
