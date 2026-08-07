import { TaskImportance } from '../../xp/daily-xp.util';

export class UpsertDailyTaskDto {
  date!: string;
  importance!: TaskImportance;
  slotIndex!: number;
  title!: string;
  skillId!: number;
  effortLevel!: number;
  durationMinutes!: number;
  habitId?: number | null;
  /** When set, completion uses this XP instead of the formula. */
  fixedXp?: number | null;
}
