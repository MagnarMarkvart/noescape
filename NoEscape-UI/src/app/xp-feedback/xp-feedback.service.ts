import { Injectable, inject, signal } from '@angular/core';
import { SkillsService } from '../skills/skills.service';
import { SoundSettingsService } from '../shared/sound-settings.service';
import {
  LEVEL_DOWN_MS,
  LEVEL_UP_GRANT_MS,
  LEVEL_UP_JINGLE,
  LEVEL_UP_MS,
  mockFocusSkill,
  NOPE_JINGLE,
  QUEST_CEREMONY_MS,
  QuestCeremony,
  XP_DROP_MS,
  XP_GAIN_SFX,
  XP_LOSS_SFX,
  XpFeedbackEvent,
  XpFeedbackPhase,
} from './xp-feedback.model';
import { Reward, Skill } from '../skills/skill.model';

@Injectable({ providedIn: 'root' })
export class XpFeedbackService {
  private readonly skills = inject(SkillsService);
  private readonly sound = inject(SoundSettingsService);
  private readonly queue: XpFeedbackEvent[] = [];
  private readonly questQueue: QuestCeremony[] = [];
  private busy = false;
  private generation = 0;
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
  readonly questActive = signal(false);
  readonly currentQuest = signal<QuestCeremony | null>(null);

  publish(event: XpFeedbackEvent): void {
    if (!event.xpAmount || event.xpAmount <= 0) {
      return;
    }
    this.queue.push({
      ...event,
      unlocks: event.unlocks ?? [],
      questReqs: event.questReqs ?? [],
    });
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
    newUnlocks?: Reward[];
    newlyMetQuestReqs?: Array<{ questName: string; label: string }>;
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
      unlocks: (award.newUnlocks ?? []).map((u) => ({
        icon: u.icon || '🔓',
        label: u.label,
        type: u.type,
      })),
      questReqs: award.newlyMetQuestReqs ?? [],
    });
    if (award.leveledUp) {
      this.skills.noteLevelUp();
    }
  }

  publishQuest(ceremony: QuestCeremony): void {
    const name = ceremony.name.trim();
    if (!name) {
      return;
    }
    this.questQueue.push({
      kind: ceremony.kind,
      name,
      subtitle: ceremony.subtitle?.trim() || undefined,
    });
    void this.pump();
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

  mockLevelUpUnlock(): void {
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
      unlocks: [
        { icon: '🪙', label: 'Focus Token', type: 'FEATURE' },
        { icon: '📜', label: 'Scriptorium folio slot', type: 'FEATURE' },
      ],
      questReqs: [
        { questName: 'Night Watch', label: 'Focus Lv 13' },
        { questName: 'Custodia Mentis', label: 'Focus Lv 13' },
      ],
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

  mockQuestStarted(): void {
    this.publishQuest({
      kind: 'started',
      name: 'Night Watch',
      subtitle: 'The path is open',
    });
  }

  mockQuestCompleted(): void {
    this.publishQuest({
      kind: 'completed',
      name: 'Custodia Mentis',
      subtitle: 'Destination reached',
    });
  }

  /** Drop the queue and hide every XP/level overlay. Jingles keep playing. */
  dismissQueuedVisuals(): void {
    if (!this.current() && !this.currentQuest() && this.queue.length === 0 && this.questQueue.length === 0) {
      return;
    }
    this.generation += 1;
    this.queue.length = 0;
    this.questQueue.length = 0;
    this.resetStage();
  }

  /** Close the current level-up / level-down / quest overlay and continue the queue. */
  skipLevelStage(): void {
    if (!this.levelUpActive() && !this.levelDownActive() && !this.questActive()) {
      return;
    }
    this.generation += 1;
    this.resetStage();
    void this.pump();
  }

  private resetStage(): void {
    this.dropActive.set(false);
    this.levelUpActive.set(false);
    this.levelDownActive.set(false);
    this.questActive.set(false);
    this.phase.set('idle');
    this.current.set(null);
    this.currentQuest.set(null);
    this.busy = false;
  }

  private async pump(): Promise<void> {
    if (this.busy) {
      return;
    }
    const ceremony = this.questQueue.shift();
    if (ceremony) {
      const gen = this.generation;
      this.busy = true;
      this.currentQuest.set(ceremony);
      this.questActive.set(true);
      this.phase.set('quest');
      this.playSfx(ceremony.kind === 'started' ? 'gain' : 'levelup');
      if (!(await this.wait(QUEST_CEREMONY_MS, gen))) {
        return;
      }
      if (gen !== this.generation) {
        return;
      }
      this.questActive.set(false);
      this.currentQuest.set(null);
      this.phase.set('idle');
      this.busy = false;
      void this.pump();
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    const gen = this.generation;
    this.busy = true;
    this.current.set(next);
    this.orbPercent.set(next.previousProgress.percent);
    this.phase.set('drop');
    this.dropActive.set(true);
    this.playSfx(next.direction === 'gain' ? 'gain' : 'loss');

    if (!(await this.wait(80, gen))) {
      return;
    }
    if (next.direction === 'gain') {
      this.orbPercent.set(next.leveledUp ? 100 : next.skill.progress.percent);
    } else {
      this.orbPercent.set(next.leveledDown ? 0 : next.skill.progress.percent);
    }

    if (!(await this.wait(XP_DROP_MS, gen))) {
      return;
    }
    this.dropActive.set(false);

    if (next.direction === 'gain' && next.leveledUp) {
      this.phase.set('levelup');
      this.levelUpActive.set(true);
      this.playSfx('levelup');
      const grants =
        (next.unlocks?.length ?? 0) + (next.questReqs?.length ?? 0);
      if (!(await this.wait(grants > 0 ? LEVEL_UP_GRANT_MS : LEVEL_UP_MS, gen))) {
        return;
      }
      this.levelUpActive.set(false);
      this.orbPercent.set(next.skill.progress.percent);
    } else if (next.direction === 'loss' && next.leveledDown) {
      this.phase.set('leveldown');
      this.levelDownActive.set(true);
      this.playSfx('leveldown');
      if (!(await this.wait(LEVEL_DOWN_MS, gen))) {
        return;
      }
      this.levelDownActive.set(false);
      this.orbPercent.set(next.skill.progress.percent);
    }

    if (gen !== this.generation) {
      return;
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

  private wait(ms: number, gen: number): Promise<boolean> {
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this.timers = this.timers.filter((t) => t !== id);
        resolve(gen === this.generation);
      }, ms);
      this.timers.push(id);
    });
  }
}
