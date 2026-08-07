/** Max skill level (RuneScape-style). */
export const MAX_SKILL_LEVEL = 99;

/**
 * Life RPG XP curve — RuneScape-shaped growth, tuned for real-life XP rates.
 * Level 2 = 100 XP (one solid gym/session block).
 * Level 99 ≈ 1.05M XP.
 */
function xpToAdvance(level: number): number {
  // XP required to go from `level` → `level + 1`
  // Level 1→2 costs 100 XP so a base gym session grants the first level-up.
  if (level === 1) {
    return 100;
  }
  return Math.floor(100 + level * 45 + Math.pow(2, level / 7) * 12);
}

export function xpForLevel(level: number): number {
  if (level <= 1) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpToAdvance(i);
  }
  return total;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_SKILL_LEVEL && xpForLevel(level + 1) <= xp) {
    level += 1;
  }
  return level;
}

export function xpProgress(xp: number, level: number) {
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp =
    level >= MAX_SKILL_LEVEL ? currentLevelXp : xpForLevel(level + 1);
  const intoLevel = Math.max(0, xp - currentLevelXp);
  const needed = Math.max(1, nextLevelXp - currentLevelXp);
  const percent =
    level >= MAX_SKILL_LEVEL ? 100 : Math.min(100, (intoLevel / needed) * 100);

  return {
    currentLevelXp,
    nextLevelXp,
    intoLevel,
    needed,
    percent: Math.round(percent * 10) / 10,
  };
}
