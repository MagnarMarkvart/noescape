export interface SkillProgress {
  currentLevelXp: number;
  nextLevelXp: number;
  intoLevel: number;
  needed: number;
  percent: number;
}

export interface Skill {
  id: number;
  name: string;
  slug: string;
  category: string;
  level: number;
  xp: number;
  icon: string | null;
  xpSources: string;
  sortOrder: number;
  maxLevel: number;
  xpToNext: number;
  progress: SkillProgress;
}

export interface SkillCategory {
  category: string;
  label: string;
  icon: string;
  skills: Skill[];
  totalLevel: number;
}

export interface SkillTree {
  totalLevel: number;
  averageLevel: number;
  categories: SkillCategory[];
}

export type UnlockType = 'GEAR' | 'FEATURE' | 'COSMETIC' | 'RESOURCE';

export type RewardStatus =
  | 'unlocked'
  | 'available'
  | 'locked_level'
  | 'locked_requirements';

export interface Reward {
  id: number;
  skillId: number;
  levelReq: number;
  type: UnlockType;
  label: string;
  description: string;
  permissionKey: string | null;
  wealthLevelReq: number | null;
  questIds: string | null;
  orderIndex: number;
  icon: string;
  unlocked: boolean;
  claimedAt: string | null;
  status?: RewardStatus;
  missing?: string[];
}

export interface SkillGuideBracket {
  levelReq: number;
  rewards: Reward[];
}

export interface SkillGuide {
  skill: {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    category: string;
    level: number;
  };
  wealthLevel: number;
  brackets: SkillGuideBracket[];
  rewards: Reward[];
}

export interface LogActivityResponse {
  activity: {
    id: number;
    skillId: number;
    xpGained: number;
    duration: number | null;
    note: string | null;
    loggedAt: string;
  };
  skill: Skill;
  leveledUp: boolean;
  levelsGained: number;
  previousLevel: number;
  previousXp: number;
  previousProgress: SkillProgress;
  newUnlocks?: Reward[];
  newlyMetQuestReqs?: Array<{ questName: string; label: string }>;
}

export interface XpReversalResponse {
  skill: Skill;
  xpRemoved: number;
  leveledDown: boolean;
  levelsLost: number;
  previousLevel: number;
  previousXp: number;
  previousProgress: SkillProgress;
}
