import { Skill, SkillProgress } from '../skills/skill.model';

export type XpFeedbackDirection = 'gain' | 'loss';

export interface XpUnlockGrant {
  icon: string;
  label: string;
  type?: string;
}

export interface XpQuestReqGrant {
  questName: string;
  label: string;
}

export interface XpFeedbackEvent {
  direction: XpFeedbackDirection;
  /** Always positive; sign comes from direction. */
  xpAmount: number;
  skill: Skill;
  leveledUp: boolean;
  leveledDown: boolean;
  levelsChanged: number;
  previousLevel: number;
  previousProgress: SkillProgress;
  unlocks?: XpUnlockGrant[];
  questReqs?: XpQuestReqGrant[];
}

/** @deprecated alias — prefer XpFeedbackEvent */
export type XpGainEvent = XpFeedbackEvent;

export type XpFeedbackPhase = 'idle' | 'drop' | 'levelup' | 'leveldown';

export const WORK_END_JINGLE = '/assets/jingles/Pomodoro.ogg';
export const REST_END_JINGLE = '/assets/jingles/rest-timer-end.ogg';
export const LEVEL_UP_JINGLE = '/assets/jingles/level-up.ogg';
export const NOPE_JINGLE = '/assets/jingles/' + encodeURIComponent('nope!.ogg');
/** Ordinary XP gain drop. */
export const XP_GAIN_SFX = '/assets/jingles/success.mp3';
/** Ordinary XP loss drop. */
export const XP_LOSS_SFX = '/assets/jingles/failiure.mp3';

export const XP_DROP_MS = 3000;
export const LEVEL_UP_MS = 3000;
export const LEVEL_UP_GRANT_MS = 5200;
export const LEVEL_DOWN_MS = 3000;

export function mockFocusSkill(overrides: Partial<Skill> = {}): Skill {
  const level = overrides.level ?? 12;
  const percent = overrides.progress?.percent ?? 42;
  return {
    id: 4,
    name: 'Focus',
    slug: 'focus',
    category: 'Mind',
    level,
    xp: 1200,
    icon: '🧠',
    xpSources: 'Horologium',
    sortOrder: 4,
    maxLevel: 99,
    xpToNext: 200,
    progress: {
      currentLevelXp: 1000,
      nextLevelXp: 1400,
      intoLevel: Math.round((percent / 100) * 400),
      needed: 400,
      percent,
      ...overrides.progress,
    },
    ...overrides,
  };
}
