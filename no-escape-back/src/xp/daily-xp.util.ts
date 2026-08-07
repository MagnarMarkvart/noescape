export type TaskImportance = 'MOST_IMPORTANT' | 'IMPORTANT' | 'REGULAR';

/** Default / minimum slots per tier (1 / 3 / 5). */
export const DAILY_SLOT_COUNTS: Record<TaskImportance, number> = {
  MOST_IMPORTANT: 1,
  IMPORTANT: 3,
  REGULAR: 5,
};

/** Regular can grow past the default 5. */
export const DAILY_SLOT_MAXIMUMS: Record<TaskImportance, number> = {
  MOST_IMPORTANT: 1,
  IMPORTANT: 3,
  REGULAR: 20,
};

export const IMPORTANCE_BASE_XP: Record<TaskImportance, number> = {
  MOST_IMPORTANT: 50,
  IMPORTANT: 30,
  REGULAR: 5,
};

export const IMPORTANCE_ORDER: TaskImportance[] = [
  'MOST_IMPORTANT',
  'IMPORTANT',
  'REGULAR',
];

/** Effort 1–10 → multiplier. Effort 5 = 1.0×. */
export function effortMultiplier(effortLevel: number): number {
  const effort = clamp(effortLevel, 1, 10);
  return 0.4 + (effort / 10) * 1.2;
}

/**
 * Duration multiplier with a soft floor so short tasks are not punished.
 * Reference duration is 45 minutes (= 1.0×).
 * Floor 0.65× (≈15 min and below), ceiling 2.0× (long sessions).
 */
export function durationMultiplier(durationMinutes: number): number {
  const minutes = Math.max(1, durationMinutes);
  const raw = Math.sqrt(minutes / 45);
  return clamp(raw, 0.65, 2.0);
}

/**
 * Daily task XP:
 *   XP = round(base × effortMult × durationMult)
 *
 * base: MI=50, I=30, Regular=5
 * effortMult: 0.4 + (effort/10)*1.2
 * durationMult: clamp(√(minutes/45), 0.65, 2.0)
 */
export function calculateDailyTaskXp(input: {
  importance: TaskImportance;
  effortLevel: number;
  durationMinutes: number;
}): number {
  const base = IMPORTANCE_BASE_XP[input.importance];
  const xp =
    base *
    effortMultiplier(input.effortLevel) *
    durationMultiplier(input.durationMinutes);
  return Math.max(1, Math.round(xp));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
