import { SkillCategory, SkillTree } from '../skills/skill.model';

export type TaskImportance = 'MOST_IMPORTANT' | 'IMPORTANT' | 'REGULAR';

export interface DailySkillRef {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
  level: number;
}

export interface DailyTaskSlot {
  id: number | null;
  date: string;
  importance: TaskImportance;
  slotIndex: number;
  title: string;
  skillId: number | null;
  skill: DailySkillRef | null;
  effortLevel: number;
  durationMinutes: number;
  completed: boolean;
  xpAwarded: number | null;
  completedAt: string | null;
  isFilled: boolean;
  isEmpty: boolean;
  projectedXp: number;
  breakdown: {
    base: number;
    effortMult: number;
    durationMult: number;
  } | null;
}

export interface DailyTier {
  importance: TaskImportance;
  label: string;
  baseXp: number;
  capacity: number;
  filled: number;
  completed: number;
  projectedXp: number;
  earnedXp: number;
  slots: DailyTaskSlot[];
}

export interface DailyBoard {
  date: string;
  requestedDate?: string;
  capacity: number;
  filledCount: number;
  completedCount: number;
  isEmpty: boolean;
  projectedXp: number;
  earnedXp: number;
  tiers: DailyTier[];
  isSealed: boolean;
  pendingSealDate: string | null;
  sealRequired: boolean;
  lastLogDate: string | null;
  canCopyIncomplete: boolean;
  incompleteInLastLog: number;
  isBaseFilled: boolean;
  canAddRegular: boolean;
}

export interface UpsertDailyTaskPayload {
  date: string;
  importance: TaskImportance;
  slotIndex: number;
  title: string;
  skillId: number;
  effortLevel: number;
  durationMinutes: number;
}

export interface DailyLogSummary {
  id: number;
  date: string;
  sealedAt: string;
  filledCount: number;
  completedCount: number;
  earnedXp: number;
  projectedXp: number;
}

export interface DailyLogDetail extends DailyLogSummary {
  snapshot: {
    board: Omit<
      DailyBoard,
      'isSealed' | 'lastLogDate' | 'canCopyIncomplete' | 'incompleteInLastLog'
    >;
    skillTree: SkillTree;
  };
}

export interface SlotFormModel {
  title: string;
  /** 0 = not selected */
  skillId: number;
  effortLevel: number;
  durationMinutes: number;
  /** When true, durationMinutes is driven by customDurationMinutes */
  customDuration: boolean;
  customDurationMinutes: number;
}

export type ParentSkillCategory = Pick<SkillCategory, 'category' | 'label' | 'icon'>;
