import { TaskImportance } from './daily.model';

/** Keep in sync with no-escape-back/src/xp/daily-xp.util.ts */

export const DAILY_DURATION_CAP_MINUTES = 8 * 60;

export function effortXpPerMinute(effortLevel: number): number {
  const effort = Math.min(10, Math.max(1, Math.round(effortLevel)));
  if (effort <= 5) {
    return 2 ** (effort - 1);
  }
  if (effort === 10) {
    return 100;
  }
  return 16 + 15 * (effort - 5);
}

export function billedDurationMinutes(durationMinutes: number): number {
  const minutes = Math.floor(Number(durationMinutes) || 0);
  return Math.min(DAILY_DURATION_CAP_MINUTES, Math.max(0, minutes));
}

export function calculateDailyTaskXp(input: {
  effortLevel: number;
  durationMinutes: number;
  importance?: TaskImportance;
}): number {
  return (
    billedDurationMinutes(input.durationMinutes) *
    effortXpPerMinute(input.effortLevel)
  );
}
