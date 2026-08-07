/**
 * Horologium Focus XP.
 *
 * Per completed work block (Track and Sessio use the same rate):
 *   XP = max(1, round(workMinutes × RATE × restMult × workLengthMult))
 *
 * restMult: best at 5m, worst at 35m; plateaus outside that range.
 *
 * Completing a planned Sessio (all iterations) awards an extra goal bonus:
 *   - Sessio requires at least 2 iterations (Track = open-ended single blocks)
 *   - work < 15m → no iteration bonus
 *   - work 15m → minimum bonus scale; 55m → maximum (plateau above)
 *   - long rest cuts the bonus
 *   - growth uses (iterations - 1)^EXPONENT so 2 rounds stay modest
 * Aborting early → block XP only, never the goal bonus.
 */
export const HOROLOGIUM_XP_PER_WORK_MINUTE = 1;
/** Planned Sessio must commit to at least this many work blocks. */
export const HOROLOGIUM_MIN_SESSIO_ITERATIONS = 2;
/** Base factor for goal bonus before work/rest/iteration scales. */
export const HOROLOGIUM_GOAL_BONUS_MULT = 1.0;
/**
 * Growth on (iterations - 1). At 2 rounds → factor 1; higher rounds ramp up.
 */
export const HOROLOGIUM_GOAL_ITER_EXPONENT = 1.55;
/** Below this, finishing the goal awards no iteration bonus. */
export const HOROLOGIUM_GOAL_MIN_WORK_MINUTES = 15;
/** Work length that maximizes the iteration bonus (plateau above). */
export const HOROLOGIUM_GOAL_PEAK_WORK_MINUTES = 55;
/** Scale at exactly MIN work minutes (peak work uses 1.0). */
export const HOROLOGIUM_GOAL_MIN_WORK_SCALE = 0.22;
export const FOCUS_SKILL_SLUG = 'focus';

export type HorologiumMode = 'adhoc' | 'planned';

/** 5m rest = best (1.0); 35m rest = worst (0.45); plateaus outside. */
export function restXpMultiplier(restMinutes: number): number {
  const rest = Math.max(1, Math.round(restMinutes));
  const best = 1;
  const worst = 0.45;
  if (rest <= 5) {
    return best;
  }
  if (rest >= 35) {
    return worst;
  }
  const t = (rest - 5) / (35 - 5);
  return best + (worst - best) * t;
}

/** Longer work blocks are more valuable. */
export function workLengthMultiplier(workMinutes: number): number {
  if (workMinutes <= 10) {
    return 0.85;
  }
  if (workMinutes <= 20) {
    return 1.0;
  }
  if (workMinutes <= 35) {
    return 1.2;
  }
  return 1.4;
}

/**
 * Iteration-bonus work scale:
 * 0 below 15m, minimum at 15m, maximum (1) at 55m+, ease-in toward the peak.
 */
export function goalWorkScale(workMinutes: number): number {
  const work = Math.max(0, Math.round(workMinutes));
  if (work < HOROLOGIUM_GOAL_MIN_WORK_MINUTES) {
    return 0;
  }
  if (work >= HOROLOGIUM_GOAL_PEAK_WORK_MINUTES) {
    return 1;
  }
  const span =
    HOROLOGIUM_GOAL_PEAK_WORK_MINUTES - HOROLOGIUM_GOAL_MIN_WORK_MINUTES;
  const t = (work - HOROLOGIUM_GOAL_MIN_WORK_MINUTES) / span;
  const shaped = Math.pow(t, 1.45);
  return (
    HOROLOGIUM_GOAL_MIN_WORK_SCALE +
    (1 - HOROLOGIUM_GOAL_MIN_WORK_SCALE) * shaped
  );
}

export function calculateHorologiumBlockXp(input: {
  workMinutes: number;
  restMinutes: number;
  /** Kept for API compat; block XP is mode-independent. */
  mode?: HorologiumMode;
}): {
  xp: number;
  restMult: number;
  workLengthMult: number;
  modeMult: number;
} {
  const workMinutes = Math.max(1, Math.round(input.workMinutes));
  const restMult = restXpMultiplier(input.restMinutes);
  const workLengthMult = workLengthMultiplier(workMinutes);
  const raw =
    workMinutes *
    HOROLOGIUM_XP_PER_WORK_MINUTE *
    restMult *
    workLengthMult;
  return {
    xp: Math.max(1, Math.round(raw)),
    restMult: round3(restMult),
    workLengthMult,
    modeMult: 1,
  };
}

export function calculateHorologiumGoalBonus(input: {
  workMinutes: number;
  restMinutes: number;
  iterations: number;
}): {
  blockXp: number;
  goalBonusXp: number;
  totalIfCompleted: number;
  restMult: number;
  workLengthMult: number;
  modeMult: number;
  workScale: number;
  totalWorkMinutes: number;
} {
  const workMinutes = Math.max(1, Math.round(input.workMinutes));
  const iterations = Math.max(1, Math.round(input.iterations));
  const block = calculateHorologiumBlockXp({
    workMinutes,
    restMinutes: input.restMinutes,
  });
  const workScale = goalWorkScale(workMinutes);
  const restMult = restXpMultiplier(input.restMinutes);

  let goalBonusXp = 0;
  // Sessio bonus only from 2+ committed rounds; Track has no goal bonus.
  if (workScale > 0 && iterations >= HOROLOGIUM_MIN_SESSIO_ITERATIONS) {
    const billedWork = Math.min(
      workMinutes,
      HOROLOGIUM_GOAL_PEAK_WORK_MINUTES,
    );
    const iterFactor = Math.pow(
      iterations - 1,
      HOROLOGIUM_GOAL_ITER_EXPONENT,
    );
    goalBonusXp = Math.max(
      0,
      Math.round(
        billedWork *
          HOROLOGIUM_XP_PER_WORK_MINUTE *
          HOROLOGIUM_GOAL_BONUS_MULT *
          iterFactor *
          workScale *
          restMult,
      ),
    );
  }

  const blocksTotal = block.xp * iterations;
  return {
    blockXp: block.xp,
    goalBonusXp,
    totalIfCompleted: blocksTotal + goalBonusXp,
    restMult: block.restMult,
    workLengthMult: block.workLengthMult,
    modeMult: block.modeMult,
    workScale: round3(workScale),
    totalWorkMinutes: workMinutes * iterations,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
