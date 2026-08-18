/** Quest skill integration: 10 weight points split across 0–N skills. */
export const QUEST_WEIGHT_TOTAL = 10;

export type QuestSkillWeight = {
  slug: string;
  weight: number;
};

export type QuestSkillShare = QuestSkillWeight & {
  xp: number;
};

/**
 * Split a quest's total XP by integer weights that must sum to 10.
 * Uses the largest-remainder method so awarded XP always equals totalXp.
 */
export function splitQuestXp(
  totalXp: number,
  weights: QuestSkillWeight[],
): QuestSkillShare[] {
  const pool = Math.max(0, Math.round(Number(totalXp) || 0));
  const rows = weights
    .map((w) => ({
      slug: String(w.slug || '').trim(),
      weight: Math.round(Number(w.weight) || 0),
    }))
    .filter((w) => w.slug && w.weight > 0);

  if (rows.length === 0 || pool <= 0) {
    return rows.map((w) => ({ ...w, xp: 0 }));
  }

  const shares = rows.map((w) => {
    const exact = (pool * w.weight) / QUEST_WEIGHT_TOTAL;
    const xp = Math.floor(exact);
    return { ...w, xp, remainder: exact - xp };
  });
  let leftover = pool - shares.reduce((sum, s) => sum + s.xp, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder);
  let i = 0;
  while (leftover > 0 && ranked.length > 0) {
    ranked[i % ranked.length].xp += 1;
    leftover -= 1;
    i += 1;
  }
  return shares.map(({ remainder: _r, ...rest }) => rest);
}

export function parseSkillWeights(raw: unknown): QuestSkillWeight[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const rows = raw.map((w) => {
    const row = w as { slug?: string; weight?: number };
    return {
      slug: String(row?.slug || '').trim(),
      weight: Math.round(Number(row?.weight) || 0),
    };
  });
  return rows.filter((w) => w.slug && w.weight > 0);
}

/** Validate 10-point skill weights. Empty is allowed only when allowEmpty is true. */
export function validateSkillWeights(
  raw: unknown,
  opts?: { allowEmpty?: boolean },
): { weights: QuestSkillWeight[]; error: string | null } {
  const weights = parseSkillWeights(raw);
  const slugs = new Set(weights.map((w) => w.slug));
  if (slugs.size !== weights.length) {
    return {
      weights,
      error: 'Each integrated skill can appear only once',
    };
  }
  if (weights.length === 0) {
    return {
      weights,
      error: opts?.allowEmpty ? null : 'At least one skill is required',
    };
  }
  const sum = weights.reduce((n, w) => n + w.weight, 0);
  if (sum !== QUEST_WEIGHT_TOTAL) {
    return {
      weights,
      error: `Skill weights must sum to ${QUEST_WEIGHT_TOTAL} (currently ${sum})`,
    };
  }
  return { weights, error: null };
}

export function sharesToBonus(
  shares: QuestSkillShare[],
): Record<string, number> | undefined {
  const bonus: Record<string, number> = {};
  for (const s of shares) {
    if (s.xp > 0) {
      bonus[s.slug] = s.xp;
    }
  }
  return Object.keys(bonus).length ? bonus : undefined;
}

/** One day's special-skill pool from a quest's total XP. */
export function questDailySpecialPool(
  totalXp: number,
  durationDays?: number | null,
): number {
  const pool = Math.max(0, Math.round(Number(totalXp) || 0));
  if (pool <= 0) {
    return 0;
  }
  const days = Math.max(1, Math.round(Number(durationDays) || 7));
  return Math.max(1, Math.round(pool / days));
}

/** Spread each skill's XP across laps; leftovers go to the earliest laps. */
export function splitXpAcrossLaps(
  shares: QuestSkillShare[],
  laps: number,
): Array<Record<string, number>> {
  const n = Math.max(1, Math.round(laps) || 1);
  const result: Array<Record<string, number>> = Array.from(
    { length: n },
    () => ({}),
  );
  for (const share of shares) {
    if (share.xp <= 0 || !share.slug) {
      continue;
    }
    const base = Math.floor(share.xp / n);
    let rem = share.xp - base * n;
    for (let i = 0; i < n; i++) {
      const xp = base + (rem > 0 ? 1 : 0);
      if (rem > 0) {
        rem -= 1;
      }
      if (xp > 0) {
        result[i][share.slug] = (result[i][share.slug] ?? 0) + xp;
      }
    }
  }
  return result;
}
