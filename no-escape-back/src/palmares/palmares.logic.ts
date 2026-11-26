export const UNITS = ['seconds', 'reps', 'kg', 'm'] as const;
export type PalmaresUnit = (typeof UNITS)[number];

/** XP for a logged attempt: first ever sets the baseline, a new PB pays more, reaching the target pays a bonus once. */
export const XP_FIRST = 10;
export const XP_PB = 25;
export const XP_TARGET = 40;

export function isBetter(value: number, best: number | null, higherIsBetter: boolean): boolean {
  if (best == null) return true;
  return higherIsBetter ? value > best : value < best;
}

export function bestOf(values: number[], higherIsBetter: boolean): number | null {
  if (values.length === 0) return null;
  return higherIsBetter ? Math.max(...values) : Math.min(...values);
}

export function meetsTarget(value: number | null, target: number | null, higherIsBetter: boolean): boolean {
  if (value == null || target == null) return false;
  return higherIsBetter ? value >= target : value <= target;
}

/** XP earned by a new attempt given the previous best. */
export function xpForAttempt(
  value: number,
  previousBest: number | null,
  target: number | null,
  higherIsBetter: boolean,
): { pb: boolean; xp: number; targetReached: boolean } {
  const pb = isBetter(value, previousBest, higherIsBetter);
  const targetReached =
    meetsTarget(value, target, higherIsBetter) && !meetsTarget(previousBest, target, higherIsBetter);
  let xp = 0;
  if (pb) xp += previousBest == null ? XP_FIRST : XP_PB;
  if (targetReached) xp += XP_TARGET;
  return { pb, xp, targetReached };
}
