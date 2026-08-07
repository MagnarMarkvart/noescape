/**
 * Exact Old School RuneScape XP curve.
 *
 * XP to reach level L:
 *   floor( (1/4) * sum_{n=1}^{L-1} floor(n + 300 * 2^(n/7)) )
 *
 * Level 92 ≈ half of 99 (6,517,253 / 13,034,431).
 * @see https://oldschool.runescape.wiki/w/Experience
 */
export const MAX_SKILL_LEVEL = 99;
export const XP_FOR_LEVEL_99 = 13_034_431;
export const XP_FOR_LEVEL_92 = 6_517_253;

/** Precomputed cumulative XP to *reach* each level (index = level). */
const XP_TABLE: number[] = (() => {
  const table = new Array<number>(MAX_SKILL_LEVEL + 1);
  table[0] = 0;
  table[1] = 0;
  let points = 0;
  for (let lvl = 2; lvl <= MAX_SKILL_LEVEL; lvl++) {
    const n = lvl - 1;
    points += Math.floor(n + 300 * Math.pow(2, n / 7));
    table[lvl] = Math.floor(points / 4);
  }
  return table;
})();

/** Cumulative XP required to reach `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  if (level <= 1) {
    return 0;
  }
  if (level >= MAX_SKILL_LEVEL) {
    return XP_TABLE[MAX_SKILL_LEVEL];
  }
  return XP_TABLE[Math.floor(level)] ?? 0;
}

/** XP needed to go from `level` → `level + 1`. */
export function xpToNextLevel(level: number): number {
  if (level < 1 || level >= MAX_SKILL_LEVEL) {
    return 0;
  }
  return xpForLevel(level + 1) - xpForLevel(level);
}

export function levelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_SKILL_LEVEL && XP_TABLE[level + 1] <= safeXp) {
    level += 1;
  }
  return level;
}

export function xpProgress(xp: number, level = levelFromXp(xp)) {
  const safeLevel = Math.min(MAX_SKILL_LEVEL, Math.max(1, level));
  const currentLevelXp = xpForLevel(safeLevel);
  const nextLevelXp =
    safeLevel >= MAX_SKILL_LEVEL
      ? currentLevelXp
      : xpForLevel(safeLevel + 1);
  const intoLevel = Math.max(0, Math.floor(xp) - currentLevelXp);
  const needed = Math.max(1, nextLevelXp - currentLevelXp);
  const percent =
    safeLevel >= MAX_SKILL_LEVEL
      ? 100
      : Math.min(100, (intoLevel / needed) * 100);

  return {
    currentLevelXp,
    nextLevelXp,
    intoLevel,
    needed,
    percent: Math.round(percent * 10) / 10,
  };
}
