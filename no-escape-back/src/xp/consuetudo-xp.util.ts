import { calculateDailyTaskXp } from './daily-xp.util';

/**
 * Finish-the-practice bonus. Skips shrink the bonus linearly;
 * more than half the steps skipped → no bonus.
 *
 *   skipRatio = skipped / total
 *   if skipRatio > 0.5: 0
 *   else: round(baseXp × 0.5 × (1 − skipRatio / 0.5))
 */
export function consuetudoBonusXp(
  baseXp: number,
  skippedCount: number,
  totalSteps: number,
): number {
  const total = Math.max(0, Math.round(totalSteps));
  if (total <= 0) {
    return 0;
  }
  const skipped = Math.max(0, Math.min(total, Math.round(skippedCount)));
  const ratio = skipped / total;
  if (ratio > 0.5) {
    return 0;
  }
  return Math.round(Math.max(0, baseXp) * 0.5 * (1 - ratio / 0.5));
}

/** Base XP uses the dailies formula on completed (non-skipped) planned minutes. */
export function calculateConsuetudoXp(input: {
  effortLevel: number;
  completedPlannedMinutes: number;
  skippedCount: number;
  totalSteps: number;
}): { baseXp: number; bonusXp: number; totalXp: number } {
  const baseXp = calculateDailyTaskXp({
    effortLevel: input.effortLevel,
    durationMinutes: input.completedPlannedMinutes,
  });
  const bonusXp = consuetudoBonusXp(
    baseXp,
    input.skippedCount,
    input.totalSteps,
  );
  return { baseXp, bonusXp, totalXp: baseXp + bonusXp };
}
