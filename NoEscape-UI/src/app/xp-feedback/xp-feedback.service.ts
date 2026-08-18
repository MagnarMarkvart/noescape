import { Injectable, inject, signal } from '@angular/core';
import { SkillsService } from '../skills/skills.service';
import { SoundSettingsService } from '../shared/sound-settings.service';
import {
  LEVEL_DOWN_MS,
  LEVEL_UP_JINGLE,
  LEVEL_UP_MS,
  mockFocusSkill,
  NOPE_JINGLE,
  XP_DROP_MS,
  XP_GAIN_SFX,
  XP_LOSS_SFX,
  XpFeedbackEvent,
  XpFeedbackPhase,
} from './xp-feedback.model';
import { Skill } from '../skills/skill.model';

@Injectable({ providedIn: 'root' })
export class XpFeedbackService {
  private readonly skills = inject(SkillsService);
  private readonly sound = inject(SoundSettingsService);
  private readonly queue: XpFeedbackEvent[] = [];
  private busy = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private levelUpAudio: HTMLAudioElement | null = null;
  private nopeAudio: HTMLAudioElement | null = null;
  private xpGainAudio: HTMLAudioElement | null = null;
  private xpLossAudio: HTMLAudioElement | null = null;

  readonly phase = signal<XpFeedbackPhase>('idle');
  readonly current = signal<XpFeedbackEvent | null>(null);
  /** 0–100 fill shown on the orb (animates from previous → new). */
  readonly orbPercent = signal(0);
  readonly dropActive = signal(false);
  readonly levelUpActive = signal(false);
  readonly levelDownActive = signal(false);

  publish(event: XpFeedbackEvent): void {
    if (!event.xpAmount || event.xpAmount <= 0) {
      return;
    }
    this.queue.push(event);
    void this.pump();
  }

  /** Convenience for award-shaped API payloads. */
  publishAward(award: {
    activity: { xpGained: number };
    skill: Skill;
    leveledUp: boolean;
    levelsGained: number;
    previousLevel?: number;
    previousProgress?: Skill['progress'];
  }): void {
    const previousLevel =
      award.previousLevel ?? award.skill.level - (award.levelsGained || 0);
    const previousProgress = award.previousProgress ?? {
      currentLevelXp: 0,
      nextLevelXp: 0,
      intoLevel: 0,
      needed: 1,
      percent: Math.max(0, award.skill.progress.percent - 8),
    };
    this.publish({
      direction: 'gain',
      xpAmount: award.activity.xpGained,
      skill: award.skill,
      leveledUp: award.leveledUp,
      leveledDown: false,
      levelsChanged: award.levelsGained,
      previousLevel,
      previousProgress,
    });
    if (award.leveledUp) {
      this.skills.noteLevelUp();
    }
  }

  /** Convenience for reverse/uncomplete payloads. */
  publishReversal(reversal: {
    skill: Skill;
    xpRemoved: number;
    leveledDown: boolean;
    levelsLost?: number;
    previousLevel?: number;
    previousProgress?: Skill['progress'];
  }): void {
    const previousLevel = reversal.previousLevel ?? reversal.skill.level + (reversal.levelsLost || (reversal.leveledDown ? 1 : 0));
    const previousProgress = reversal.previousProgress ?? {
      currentLevelXp: 0,
      nextLevelXp: 0,
      intoLevel: 0,
      needed: 1,
      percent: Math.min(100, reversal.skill.progress.percent + 12),
    };
    this.publish({
      direction: 'loss',
      xpAmount: reversal.xpRemoved,
      skill: reversal.skill,
      leveledUp: false,
      leveledDown: reversal.leveledDown,
      levelsChanged: reversal.levelsLost ?? (reversal.leveledDown ? Math.max(1, previousLevel - reversal.skill.level) : 0),
      previousLevel,
      previousProgress,
    });
  }

  /** Demo helpers — no server calls. */
  mockXpGain(): void {
    const after = mockFocusSkill({
      level: 12,
      progress: { currentLevelXp: 0, nextLevelXp: 0, intoLevel: 0, needed: 1, percent: 58 },
    });
    this.publish({
      direction: 'gain',
      xpAmount: 34,
      skill: after,
      leveledUp: false,
      leveledDown: false,
      levelsChanged: 0,
      previousLevel: 12,
      previousProgress: {
        currentLevelXp: 0,
        nextLevelXp: 0,
        intoLevel: 0,
        needed: 1,
        percent: 42,
      },
    });
  }

  mockLevelUp(): void {
    const after = mockFocusSkill({
      level: 13,
      progress: { currentLevelXp: 0, nextLevelXp: 0, intoLevel: 0, needed: 1, percent: 8 },
    });
    this.publish({
      direction: 'gain',
      xpAmount: 120,
      skill: after,
      leveledUp: true,
      leveledDown: false,
      levelsChanged: 1,
      previousLevel: 12,
      previousProgress: {
        currentLevelXp: 0,
        nextLevelXp: 0,
        intoLevel: 0,
        needed: 1,
        percent: 88,
      },
    });
  }

  mockXpLoss(): void {
    const after = mockFocusSkill({
      level: 12,
      progress: { currentLevelXp: 0, nextLevelXp: 0, intoLevel: 0, needed: 1, percent: 30 },
    });
    this.publish({
      direction: 'loss',
      xpAmount: 34,
      skill: after,
      leveledUp: false,
      leveledDown: false,
      levelsChanged: 0,
      previousLevel: 12,
      previousProgress: {
        currentLevelXp: 0,
        nextLevelXp: 0,
        intoLevel: 0,
        needed: 1,
        percent: 58,
      },
    });
  }

  mockLevelDown(): void {
    const after = mockFocusSkill({
      level: 11,
      progress: { currentLevelXp: 0, nextLevelXp: 0, intoLevel: 0, needed: 1, percent: 92 },
    });
    this.publish({
      direction: 'loss',
      xpAmount: 120,
      skill: after,
      leveledUp: false,
      leveledDown: true,
      levelsChanged: 1,
      previousLevel: 12,
      previousProgress: {
        currentLevelXp: 0,
        nextLevelXp: 0,
        intoLevel: 0,
        needed: 1,
        percent: 18,
      },
    });
  }

  private async pump(): Promise<void> {
    if (this.busy) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    this.busy = true;
    this.current.set(next);
    this.orbPercent.set(next.previousProgress.percent);
    this.phase.set('drop');
    this.dropActive.set(true);
    this.playSfx(next.direction === 'gain' ? 'gain' : 'loss');

    await this.wait(80);
    if (next.direction === 'gain') {
      this.orbPercent.set(next.leveledUp ? 100 : next.skill.progress.percent);
    } else {
      this.orbPercent.set(next.leveledDown ? 0 : next.skill.progress.percent);
    }

    await this.wait(XP_DROP_MS);
    this.dropActive.set(false);

    if (next.direction === 'gain' && next.leveledUp) {
      this.phase.set('levelup');
      this.levelUpActive.set(true);
      this.playSfx('levelup');
      await this.wait(LEVEL_UP_MS);
      this.levelUpActive.set(false);
      this.orbPercent.set(next.skill.progress.percent);
    } else if (next.direction === 'loss' && next.leveledDown) {
      this.phase.set('leveldown');
      this.levelDownActive.set(true);
      this.playSfx('leveldown');
      await this.wait(LEVEL_DOWN_MS);
      this.levelDownActive.set(false);
      this.orbPercent.set(next.skill.progress.percent);
    }

    this.phase.set('idle');
    this.current.set(null);
    this.busy = false;
    void this.pump();
  }

  private playSfx(kind: 'gain' | 'loss' | 'levelup' | 'leveldown'): void {
    const gain = this.sound.playbackGain();
    if (gain == null || typeof Audio === 'undefined') {
      return;
    }
    let audio: HTMLAudioElement;
    switch (kind) {
      case 'gain':
        audio = this.xpGainAudio ??= new Audio(XP_GAIN_SFX);
        break;
      case 'loss':
        audio = this.xpLossAudio ??= new Audio(XP_LOSS_SFX);
        break;
      case 'levelup':
        audio = this.levelUpAudio ??= new Audio(LEVEL_UP_JINGLE);
        break;
      case 'leveldown':
        audio = this.nopeAudio ??= new Audio(NOPE_JINGLE);
        break;
    }
    try {
      audio.volume = gain;
      audio.currentTime = 0;
      void audio.play();
    } catch {
      // Autoplay may be blocked until user gesture.
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this.timers = this.timers.filter((t) => t !== id);
        resolve();
      }, ms);
      this.timers.push(id);
    });
  }
}
