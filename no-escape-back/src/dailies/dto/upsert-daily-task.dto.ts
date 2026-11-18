import { TaskImportance } from '../../xp/daily-xp.util';

export class UpsertDailyTaskDto {
  date!: string;
  importance!: TaskImportance;
  slotIndex!: number;
  title!: string;
  skillId?: number;
  skillWeights?: Array<{ slug: string; weight: number }>;
  effortLevel!: number;
  durationMinutes!: number;
  habitId?: number | null;
  /** When set, completion uses this XP instead of the formula. */
  fixedXp?: number | null;
  /** Literal cash (cents) awarded on complete when Finance is among weights. */
  wealthCents?: number | null;
  /** Quest this daily was added from. Null means it is not quest-linked. */
  questId?: number | null;
  /** Set when bound to a specific subtask; null means the quest's daily-work slice. */
  questSubtaskId?: number | null;
}
