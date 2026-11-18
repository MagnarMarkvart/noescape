export const CURRENCY_IDS = ['EUR', 'USD', 'GBP'] as const;
export type CurrencyId = (typeof CURRENCY_IDS)[number];
export const DEFAULT_CURRENCY: CurrencyId = 'EUR';

export const FINANCE_SKILL_SLUG = 'finance';

const MAX_ABS_CENTS = 99_999_999_99;

export function isCurrency(value: unknown): value is CurrencyId {
  return CURRENCY_IDS.includes(String(value) as CurrencyId);
}

export function boostsWealth(
  weights: Array<{ slug: string }> | null | undefined,
): boolean {
  return (weights ?? []).some((row) => row.slug === FINANCE_SKILL_SLUG);
}

/** Non-negative minor units for reward fields. Invalid input becomes 0. */
export function parseRewardCents(raw: unknown): number {
  const cents = Math.round(Number(raw) || 0);
  if (!Number.isFinite(cents) || cents < 0) {
    return 0;
  }
  return clampCents(cents);
}

/** Signed minor units from a major-unit amount (12.50 → 1250). */
export function parseMajorToCents(raw: unknown): number {
  if (raw == null || raw === '') {
    return 0;
  }
  const text = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!text) {
    return 0;
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return clampCents(Math.round(n * 100));
}

function clampCents(cents: number): number {
  if (!Number.isFinite(cents)) {
    return 0;
  }
  return Math.max(-MAX_ABS_CENTS, Math.min(MAX_ABS_CENTS, Math.trunc(cents)));
}
