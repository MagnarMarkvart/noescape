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
}
