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
  skillWeights?: Array<{ slug: string; weight: number }>;
  skillShares?: Array<{
    slug: string;
    name: string;
    weight: number;
    xp: number;
  }>;
  habitId?: number | null;
  fixedXp?: number | null;
  effortLevel: number;
  durationMinutes: number;
  elapsedMs?: number;
  completed: boolean;
  xpAwarded: number | null;
  completedAt: string | null;
  isFilled: boolean;
  isEmpty: boolean;
  projectedXp: number;
  breakdown: {
    billedMinutes: number;
    xpPerMinute: number;
  } | null;
  wealthCents?: number;
  wealthAwardedCents?: number | null;
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
  /** Latest day that may still be edited (pending seal day, else today). */
  activeLogDate?: string;
  isEditable: boolean;
  readOnly: boolean;
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
  skillWeights?: Array<{ slug: string; weight: number }>;
  effortLevel: number;
  durationMinutes: number;
  habitId?: number | null;
  fixedXp?: number | null;
  wealthCents?: number | null;
}

export interface DailyHabitRef {
  id: number;
  name: string;
  icon: string | null;
}

export interface DailyTaskTemplate {
  id: number;
  name: string;
  icon: string | null;
  skillId: number;
  skill: DailySkillRef;
  skillWeights?: Array<{ slug: string; weight: number }>;
  skillShares?: Array<{
    slug: string;
    name: string;
    weight: number;
    xp: number;
  }>;
  habitId: number | null;
  habit: DailyHabitRef | null;
  effortLevel: number;
  durationMinutes: number;
  sortOrder: number;
  createdByUser: boolean;
  wealthCents?: number;
}

export interface UpsertDailyTemplatePayload {
  name: string;
  icon?: string;
  skillId: number;
  skillWeights?: Array<{ slug: string; weight: number }>;
  habitId?: number | null;
  effortLevel: number;
  durationMinutes: number;
  wealthCents?: number | null;
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

export interface DailyCalendarDay {
  date: string;
  status: 'sealed' | 'abandoned' | 'open';
}

export interface DailyLogDetail extends DailyLogSummary {
  snapshot: {
    board: Omit<
      DailyBoard,
      | 'isSealed'
      | 'lastLogDate'
      | 'canCopyIncomplete'
      | 'incompleteInLastLog'
      | 'activeLogDate'
      | 'isEditable'
      | 'readOnly'
    >;
    skillTree: SkillTree;
  };
}

export interface SlotFormModel {
  title: string;
  /** 0 = not selected */
  skillId: number;
  skillWeights: Array<{ slug: string; weight: number }>;
  /** 0 = no habit link */
  habitId: number;
  effortLevel: number;
  durationMinutes: number;
  /** Persist this form as a reusable default after save. */
  saveAsDefault: boolean;
  /** Template that was loaded into the form, if any. */
  loadedTemplateId: number;
  /** Major-unit amount when Finance is among skills. */
  wealthAmount: string;
}

export type ParentSkillCategory = Pick<SkillCategory, 'category' | 'label' | 'icon'>;

export const DURATION_PRESETS = Array.from({ length: 16 }, (_, i) => 15 * (i + 1));
export const EFFORT_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

export function dailySkillWeights(input: {
  skillWeights?: Array<{ slug: string; weight: number }> | null;
  skill?: { slug: string } | null;
}): Array<{ slug: string; weight: number }> {
  const rows = (input.skillWeights ?? [])
    .map((row) => ({
      slug: String(row.slug || '').trim(),
      weight: Math.round(Number(row.weight) || 0),
    }))
    .filter((row) => row.slug && row.weight > 0);
  if (rows.length) {
    return rows;
  }
  if (input.skill?.slug) {
    return [{ slug: input.skill.slug, weight: 10 }];
  }
  return [];
}

export function dailySkillLine(
  input: {
    skillShares?: Array<{ name: string }> | null;
    skill?: { name: string } | null;
  } | null | undefined,
): string {
  const names = (input?.skillShares ?? [])
    .map((row) => row.name)
    .filter(Boolean);
  if (names.length) {
    return names.join(' · ');
  }
  return input?.skill?.name ?? '';
}

export function formatTaskDuration(minutes: number): string {
  const n = Math.max(0, Math.round(Number(minutes) || 0));
  if (n < 60) {
    return `${n}m`;
  }
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface QuickTaskLog {
  id: number;
  date: string;
  title: string;
  icon: string | null;
  templateId: number | null;
  effortLevel: number;
  durationMinutes: number;
  xpAwarded: number;
  wealthCents: number;
  createdAt: string;
  skillWeights: Array<{ slug: string; weight: number }>;
  skillShares: Array<{
    slug: string;
    name: string;
    weight: number;
    xp: number;
    icon?: string | null;
  }>;
}

export interface LogQuickTaskPayload {
  title: string;
  skillId: number;
  skillWeights: Array<{ slug: string; weight: number }>;
  effortLevel: number;
  durationMinutes: number;
  templateId?: number | null;
  wealthCents?: number | null;
}
