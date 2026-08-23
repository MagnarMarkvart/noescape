import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { UiIcon } from '../shared/ui/ui-icon';
import { XpFeedbackService } from './xp-feedback.service';

@Component({
  selector: 'app-xp-feedback',
  imports: [DecimalPipe, UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (questCeremony(); as quest) {
      <div
        class="xp-layer levelup-dim"
        aria-live="polite"
        (click)="onLayerClick()"
      >
        <div
          class="levelup-stage"
          [class.quest-complete]="quest.kind === 'completed'"
          role="dialog"
          [attr.aria-label]="quest.kind === 'started' ? 'Quest started' : 'Quest complete'"
        >
          <p class="levelup-kicker">
            {{ quest.kind === 'started' ? 'Quest started' : 'Quest complete' }}
          </p>
          <div class="levelup-icon" aria-hidden="true">
            {{ quest.kind === 'started' ? '⚔' : '✦' }}
          </div>
          <h2 class="levelup-title">{{ quest.name }}</h2>
          @if (quest.subtitle) {
            <p class="levelup-level">{{ quest.subtitle }}</p>
          }
        </div>
      </div>
    } @else if (current(); as event) {
      <div
        class="xp-layer"
        [class.levelup-dim]="levelUpActive()"
        [class.leveldown-dim]="levelDownActive()"
        aria-live="polite"
        (click)="onLayerClick()"
      >
        @if (dropActive()) {
          <div
            class="xp-drop"
            [class.loss]="event.direction === 'loss'"
            aria-hidden="true"
          >
            {{ event.direction === 'loss' ? '−' : '+' }}{{ event.xpAmount | number }} XP
          </div>
        }

        <div
          class="xp-orb"
          [class.visible]="dropActive() || levelUpActive() || levelDownActive()"
          [class.loss]="event.direction === 'loss'"
        >
          <button
            type="button"
            class="orb-hit"
            aria-label="Dismiss XP feedback"
            (click)="dismissQueued($event)"
          >
            <div
              class="orb-ring"
              [style.background]="orbRingStyle()"
            >
              <div class="orb-core">
                <span class="orb-icon" aria-hidden="true">{{ event.skill.icon || '◆' }}</span>
                <span class="orb-level">{{ orbLevelLabel() }}</span>
                <span class="orb-x" aria-hidden="true">
                  <app-ui-icon name="close" />
                </span>
              </div>
            </div>
          </button>
          <p class="orb-name">{{ event.skill.name }}</p>
        </div>

        @if (levelUpActive()) {
          <div
            class="levelup-stage"
            [class.with-grants]="hasGrants()"
            role="dialog"
            aria-label="Level up"
          >
            <p class="levelup-kicker">Level up</p>
            <div class="levelup-icon" aria-hidden="true">{{ event.skill.icon || '◆' }}</div>
            <h2 class="levelup-title">{{ event.skill.name }}</h2>
            <p class="levelup-level">
              Level {{ event.previousLevel }}
              <span aria-hidden="true">→</span>
              {{ event.skill.level }}
            </p>
            @if (event.levelsChanged > 1) {
              <p class="levelup-multi">+{{ event.levelsChanged }} levels</p>
            }
            @if (hasGrants()) {
              <ul class="levelup-grants">
                @for (u of event.unlocks; track u.label; let i = $index) {
                  <li class="grant unlock" [style.--delay]="grantDelay(i)">
                    <span class="grant-mark" aria-hidden="true">{{ u.icon || '🔓' }}</span>
                    <span>
                      <small>Unlocked</small>
                      <strong>{{ u.label }}</strong>
                    </span>
                  </li>
                }
                @for (q of event.questReqs; track q.questName + q.label; let i = $index) {
                  <li
                    class="grant quest"
                    [style.--delay]="grantDelay((event.unlocks?.length ?? 0) + i)"
                  >
                    <span class="grant-mark" aria-hidden="true">✓</span>
                    <span>
                      <small>Quest requirement met</small>
                      <strong>{{ q.questName }}</strong>
                      <em>{{ q.label }}</em>
                    </span>
                  </li>
                }
              </ul>
            }
          </div>
        }

        @if (levelDownActive()) {
          <div class="leveldown-stage" role="dialog" aria-label="Level down">
            <p class="leveldown-kicker">Level down</p>
            <div class="leveldown-icon" aria-hidden="true">{{ event.skill.icon || '◆' }}</div>
            <h2 class="leveldown-title">{{ event.skill.name }}</h2>
            <p class="leveldown-level">
              Level {{ event.previousLevel }}
              <span aria-hidden="true">→</span>
              {{ event.skill.level }}
            </p>
            @if (event.levelsChanged > 1) {
              <p class="leveldown-multi">−{{ event.levelsChanged }} levels</p>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
      --rs-text: #f0e6c8;
      --rs-accent: #d4a84b;
      --rs-muted: #b8a878;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
    }

    .xp-layer {
      position: fixed;
      inset: 0;
      z-index: 110;
      pointer-events: none;
      overflow: hidden;
    }

    .xp-layer.levelup-dim,
    .xp-layer.leveldown-dim {
      pointer-events: auto;
      cursor: pointer;
    }

    .xp-layer.levelup-dim {
      animation: dim-in-up 0.35s ease forwards;
    }

    .xp-layer.leveldown-dim {
      animation: dim-in-down 0.35s ease forwards;
    }

    .xp-drop {
      position: absolute;
      left: 50%;
      bottom: -2rem;
      transform: translateX(-50%);
      font-family: var(--font-display);
      font-size: clamp(1.4rem, 3vw, 2rem);
      color: #d8f5d4;
      text-shadow: 0 2px 0 #1a1408, 0 0 18px rgba(47, 143, 58, 0.55);
      animation: xp-fly 2.1s cubic-bezier(0.22, 0.82, 0.28, 1) forwards;
      white-space: nowrap;
    }

    .xp-drop.loss {
      color: #f0b4a8;
      text-shadow: 0 2px 0 #1a0c08, 0 0 18px rgba(180, 60, 48, 0.5);
      animation: xp-fly-out 2.1s cubic-bezier(0.22, 0.82, 0.28, 1) forwards;
      left: 3.6rem;
      bottom: 5.8rem;
    }

    .xp-orb {
      position: absolute;
      left: 1.25rem;
      bottom: 1.25rem;
      display: grid;
      justify-items: center;
      gap: 0.35rem;
      opacity: 0;
      transform: translateY(0.5rem) scale(0.92);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
    }

    .xp-orb.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .orb-hit {
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      border-radius: 50%;
    }

    .orb-hit:focus-visible {
      outline: 1px solid #c6a85a;
      outline-offset: 3px;
    }

    .orb-ring {
      width: 4.6rem;
      height: 4.6rem;
      border-radius: 50%;
      padding: 0.35rem;
      border: 1px solid #c6a85a;
      box-shadow: 0 0 0 3px rgba(26, 20, 8, 0.65);
      transition: background 0.9s ease;
    }

    .xp-orb.loss .orb-ring {
      border-color: #a86858;
    }

    .orb-core {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: grid;
      place-content: center;
      gap: 0.05rem;
      background: linear-gradient(180deg, #3a3120, #1c1810);
      border: 1px solid #5a4a2c;
      text-align: center;
      overflow: hidden;
    }

    .orb-x {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(14, 10, 6, 0.82);
      color: #f0e6c8;
      font-size: 1.55rem;
      opacity: 0;
      transition: opacity 0.16s ease;
      pointer-events: none;
    }

    .orb-hit:hover .orb-x,
    .orb-hit:focus-visible .orb-x {
      opacity: 1;
    }

    .orb-icon {
      font-size: 1.35rem;
      line-height: 1;
    }

    .orb-level {
      font-family: var(--font-display);
      font-size: 0.72rem;
      color: var(--rs-accent);
      letter-spacing: 0.04em;
    }

    .orb-name {
      margin: 0;
      font-family: var(--font-display);
      font-size: 0.78rem;
      color: var(--rs-text);
      letter-spacing: 0.04em;
    }

    .levelup-stage,
    .leveldown-stage {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.35rem;
      text-align: center;
      padding: 1rem;
    }

    .levelup-stage {
      animation: levelup-pop 5s ease forwards;
    }

    .levelup-stage.with-grants {
      animation-duration: 6.2s;
    }

    .leveldown-stage {
      animation: leveldown-sink 5s ease forwards;
    }

    .levelup-kicker,
    .leveldown-kicker {
      margin: 0;
      font-family: var(--font-display);
      letter-spacing: 0.28em;
      text-transform: uppercase;
      font-size: 0.85rem;
    }

    .levelup-kicker {
      color: var(--rs-accent);
    }

    .leveldown-kicker {
      color: #c45c4a;
    }

    .levelup-icon,
    .leveldown-icon {
      font-size: clamp(3.5rem, 10vw, 5.5rem);
      line-height: 1;
    }

    .levelup-icon {
      filter: drop-shadow(0 0 18px rgba(212, 168, 75, 0.45));
      animation: icon-pulse 5s ease forwards;
    }

    .leveldown-icon {
      filter: grayscale(0.55) drop-shadow(0 0 14px rgba(160, 50, 40, 0.4));
      animation: icon-droop 5s ease forwards;
    }

    .levelup-title,
    .leveldown-title {
      margin: 0.35rem 0 0;
      font-family: var(--font-display);
      font-size: clamp(1.8rem, 5vw, 2.8rem);
      letter-spacing: 0.06em;
    }

    .levelup-title {
      color: var(--rs-text);
    }

    .leveldown-title {
      color: #d8c4b0;
    }

    .levelup-level,
    .leveldown-level {
      margin: 0.2rem 0 0;
      font-family: var(--font-display);
      font-size: clamp(1.2rem, 3vw, 1.7rem);
      letter-spacing: 0.08em;
    }

    .levelup-level {
      color: #8fbc7a;
    }

    .leveldown-level {
      color: #c47a6a;
    }

    .levelup-multi,
    .leveldown-multi {
      margin: 0.15rem 0 0;
      color: var(--rs-muted);
      font-size: 0.9rem;
    }

    .levelup-grants {
      list-style: none;
      margin: 0.85rem 0 0;
      padding: 0;
      width: min(22rem, 100%);
      display: grid;
      gap: 0.4rem;
    }

    .grant {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.55rem;
      align-items: center;
      text-align: left;
      padding: 0.45rem 0.65rem;
      border: 1px solid rgba(198, 168, 90, 0.42);
      background: rgba(22, 18, 10, 0.62);
      opacity: 0;
      transform: translateY(0.35rem);
      animation: grant-in 0.45s ease forwards;
      animation-delay: var(--delay, 0.85s);
    }

    .grant.unlock {
      border-color: rgba(212, 168, 75, 0.55);
    }

    .grant.quest {
      border-color: rgba(143, 188, 122, 0.5);
    }

    .grant-mark {
      font-size: 1.15rem;
      line-height: 1;
      color: #8fbc7a;
    }

    .grant.unlock .grant-mark {
      color: var(--rs-accent);
    }

    .grant small {
      display: block;
      font-size: 0.68rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rs-muted);
    }

    .grant strong {
      display: block;
      margin-top: 0.12rem;
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--rs-text);
    }

    .grant em {
      display: block;
      margin-top: 0.08rem;
      font-style: normal;
      font-size: 0.78rem;
      color: #8fbc7a;
    }

    @keyframes xp-fly {
      0% {
        bottom: -2rem;
        opacity: 0;
        transform: translateX(-50%) scale(0.85);
      }
      12% {
        opacity: 1;
      }
      70% {
        opacity: 1;
      }
      100% {
        bottom: 5.8rem;
        right: auto;
        left: 3.6rem;
        opacity: 0;
        transform: translateX(-50%) scale(0.7);
      }
    }

    @keyframes xp-fly-out {
      0% {
        bottom: 5.8rem;
        left: 3.6rem;
        opacity: 0;
        transform: translateX(-50%) scale(0.75);
      }
      12% {
        opacity: 1;
      }
      55% {
        opacity: 1;
      }
      100% {
        bottom: -2.5rem;
        left: 50%;
        opacity: 0;
        transform: translateX(-50%) scale(0.9);
      }
    }

    @keyframes dim-in-up {
      from {
        background: rgba(8, 6, 3, 0);
      }
      to {
        background: rgba(8, 6, 3, 0.78);
      }
    }

    @keyframes dim-in-down {
      from {
        background: rgba(12, 4, 4, 0);
      }
      to {
        background: rgba(12, 4, 4, 0.82);
      }
    }

    @keyframes levelup-pop {
      0% {
        opacity: 0;
        transform: scale(0.88);
      }
      12% {
        opacity: 1;
        transform: scale(1.04);
      }
      22% {
        transform: scale(1);
      }
      82% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: scale(1.02);
      }
    }

    @keyframes leveldown-sink {
      0% {
        opacity: 0;
        transform: scale(1.06) translateY(-0.4rem);
      }
      14% {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      78% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: scale(0.94) translateY(0.55rem);
      }
    }

    @keyframes icon-pulse {
      0%,
      100% {
        transform: scale(1);
      }
      40% {
        transform: scale(1.12);
      }
      55% {
        transform: scale(1.02);
      }
    }

    @keyframes icon-droop {
      0% {
        transform: scale(1.08) rotate(-2deg);
      }
      30% {
        transform: scale(0.96) rotate(3deg);
      }
      55% {
        transform: scale(1) rotate(-1deg);
      }
      100% {
        transform: scale(0.92) rotate(0deg);
      }
    }

    @keyframes grant-in {
      from {
        opacity: 0;
        transform: translateY(0.4rem);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 640px) {
      .xp-orb {
        left: 0.75rem;
        bottom: 0.75rem;
      }
    }
  `,
})
export class XpFeedback {
  private readonly feedback = inject(XpFeedbackService);

  protected readonly current = this.feedback.current;
  protected readonly questCeremony = this.feedback.currentQuest;
  protected readonly dropActive = this.feedback.dropActive;
  protected readonly levelUpActive = this.feedback.levelUpActive;
  protected readonly levelDownActive = this.feedback.levelDownActive;
  protected readonly orbPercent = this.feedback.orbPercent;

  protected readonly orbRingStyle = computed(() => {
    const event = this.current();
    const pct = this.orbPercent();
    const fill = event?.direction === 'loss' ? '#a8483a' : '#2f8f3a';
    return `conic-gradient(${fill} ${pct}%, #1a1610 ${pct}%)`;
  });

  protected readonly orbLevelLabel = computed(() => {
    const event = this.current();
    if (!event) {
      return '';
    }
    if (this.levelUpActive() || this.levelDownActive()) {
      return `Lv ${event.skill.level}`;
    }
    return `Lv ${event.previousLevel}`;
  });

  protected readonly hasGrants = computed(() => {
    const event = this.current();
    if (!event) {
      return false;
    }
    return (event.unlocks?.length ?? 0) + (event.questReqs?.length ?? 0) > 0;
  });

  protected grantDelay(index: number): string {
    return `${0.85 + index * 0.22}s`;
  }

  protected dismissQueued(event: Event): void {
    event.stopPropagation();
    this.feedback.dismissQueuedVisuals();
  }

  protected onLayerClick(): void {
    this.feedback.skipLevelStage();
  }
}
