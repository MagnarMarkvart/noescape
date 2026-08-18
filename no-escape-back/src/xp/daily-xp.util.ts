export type TaskImportance = 'MOST_IMPORTANT' | 'IMPORTANT' | 'REGULAR';

/** Default / minimum slots per tier (1 / 3 / 5). Layout only — not XP. */
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

export const IMPORTANCE_ORDER: TaskImportance[] = [
  'MOST_IMPORTANT',
  'IMPORTANT',
  'REGULAR',
];

/**
 * Minutes past this cap do not grant extra daily XP.
 * 8 hours = 480 minutes.
 */
export const DAILY_DURATION_CAP_MINUTES = 8 * 60;

/**
 * XP granted per billed minute at each effort level.
 *
 *   1–5  powers of two:  1, 2, 4, 8, 16
 *   6–9  +15 from effort 5:  31, 46, 61, 76
 *   10   100 (special peak)
 *
 * Canonical write-up: root README.md → “Daily task XP formula”.
 * Keep NoEscape-UI/src/app/dailies/daily-xp.ts in sync.
 */
export function effortXpPerMinute(effortLevel: number): number {
  const effort = clamp(Math.round(effortLevel), 1, 10);
  if (effort <= 5) {
    return 2 ** (effort - 1);
  }
  if (effort === 10) {
    return 100;
  }
  return 16 + 15 * (effort - 5);
}

/** Duration that actually counts toward XP (0 … 480). */
export function billedDurationMinutes(durationMinutes: number): number {
  return clamp(Math.floor(Number(durationMinutes) || 0), 0, DAILY_DURATION_CAP_MINUTES);
}

/**
 * Daily task XP — duration × effort rate, nothing else.
 *
 *   XP = billedMinutes × xpPerMinute(effort)
 *
 * Slot importance (Most Important / Important / Regular) does not change XP.
 * Duration above 8 hours is ignored.
 *
 * Examples:
 *   Showering   effort 1 / 15m   → 15 XP
 *   Typical     effort 5 / 45m   → 720 XP
 *   Deep work   effort 10 / 3h   → 18,000 XP
 *   9h grind    effort 5 / 540m  → 7,680 XP (capped at 8h)
 */
export function calculateDailyTaskXp(input: {
  effortLevel: number;
  durationMinutes: number;
  /** Ignored. Kept so older callers can still pass the slot tier. */
  importance?: TaskImportance;
}): number {
  return (
    billedDurationMinutes(input.durationMinutes) *
    effortXpPerMinute(input.effortLevel)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
