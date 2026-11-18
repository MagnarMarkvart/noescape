export const SKILL_WEIGHT_TOTAL = 10;
export const FINANCE_SKILL_SLUG = 'finance';

export type SkillWeight = {
  slug: string;
  weight: number;
};

export function skillWeightSpent(rows: SkillWeight[]): number {
  return rows.reduce((sum, row) => sum + row.weight, 0);
}

export function skillWeightRemaining(rows: SkillWeight[]): number {
  return SKILL_WEIGHT_TOTAL - skillWeightSpent(rows);
}

export function skillWeightsValid(rows: SkillWeight[]): boolean {
  return rows.length > 0 && skillWeightRemaining(rows) === 0;
}

export function primarySkillSlug(rows: SkillWeight[]): string | null {
  if (!rows.length) {
    return null;
  }
  return rows.reduce((best, row) => (row.weight > best.weight ? row : best))
    .slug;
}

export function addSkillWeight(
  rows: SkillWeight[],
  slug: string,
): SkillWeight[] {
  if (!slug || rows.some((row) => row.slug === slug)) {
    return rows;
  }
  const remaining = skillWeightRemaining(rows);
  if (rows.length === 0) {
    return [{ slug, weight: SKILL_WEIGHT_TOTAL }];
  }
  if (remaining > 0) {
    return [...rows, { slug, weight: remaining }];
  }
  const donor = rows.reduce((best, row) =>
    row.weight > best.weight ? row : best,
  );
  if (donor.weight <= 1) {
    return rows;
  }
  return [
    ...rows.map((row) =>
      row.slug === donor.slug ? { ...row, weight: row.weight - 1 } : row,
    ),
    { slug, weight: 1 },
  ];
}

export function bumpSkillWeight(
  rows: SkillWeight[],
  slug: string,
  delta: number,
): SkillWeight[] {
  const current = rows.find((row) => row.slug === slug);
  if (!current) {
    return rows;
  }
  const next = current.weight + delta;
  if (next < 1) {
    return rows;
  }
  const spentOthers = rows
    .filter((row) => row.slug !== slug)
    .reduce((sum, row) => sum + row.weight, 0);
  if (spentOthers + next > SKILL_WEIGHT_TOTAL) {
    return rows;
  }
  return rows.map((row) =>
    row.slug === slug ? { ...row, weight: next } : row,
  );
}

export function removeSkillWeight(
  rows: SkillWeight[],
  slug: string,
): SkillWeight[] {
  const rest = rows.filter((row) => row.slug !== slug);
  if (rest.length === 0) {
    return [];
  }
  if (rest.length === 1) {
    return [{ ...rest[0], weight: SKILL_WEIGHT_TOTAL }];
  }
  const extra = SKILL_WEIGHT_TOTAL - skillWeightSpent(rest);
  if (extra <= 0) {
    return rest;
  }
  return rest.map((row, i) =>
    i === 0 ? { ...row, weight: row.weight + extra } : row,
  );
}

export function boostsWealth(
  rows: Array<{ slug: string }> | null | undefined,
): boolean {
  return (rows ?? []).some((row) => row.slug === FINANCE_SKILL_SLUG);
}
