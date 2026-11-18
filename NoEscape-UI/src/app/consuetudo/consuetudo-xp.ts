/** Keep in sync with no-escape-back/src/xp/consuetudo-xp.util.ts */
import { calculateDailyTaskXp } from '../dailies/daily-xp';

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

export function formatClockMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatSignedDelta(deltaMs: number): string {
  if (deltaMs === 0) {
    return '±00:00';
  }
  const sign = deltaMs > 0 ? '+' : '−';
  return `${sign}${formatClockMs(Math.abs(deltaMs))}`;
}
