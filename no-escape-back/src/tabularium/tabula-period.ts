import { weekDates } from '../time/tallinn';
import type { WeekStart } from '../time/zone';

export const TABULA_PERIODS = ['day', 'week', 'month', 'year'] as const;
export type TabulaPeriod = (typeof TABULA_PERIODS)[number];

export const TABULA_POLARITIES = ['vice', 'virtue'] as const;
export type TabulaPolarity = (typeof TABULA_POLARITIES)[number];

export type TabulaTone = 'good' | 'fair' | 'poor';

export function isTabulaPeriod(value: string): value is TabulaPeriod {
  return (TABULA_PERIODS as readonly string[]).includes(value);
}

export function isTabulaPolarity(value: string): value is TabulaPolarity {
  return (TABULA_POLARITIES as readonly string[]).includes(value);
}

export function periodWindow(
  iso: string,
  period: TabulaPeriod,
  weekStartsOn: WeekStart = 1,
): { from: string; to: string } {
  if (period === 'day') {
    return { from: iso, to: iso };
  }
  if (period === 'week') {
    const days = weekDates(iso, weekStartsOn);
    return { from: days[0], to: days[6] };
  }
  const [year, month] = iso.split('-').map(Number);
  if (period === 'month') {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    return { from, to };
  }
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export function tabulaTone(
  count: number,
  normMin: number,
  normMax: number,
  polarity: TabulaPolarity,
): TabulaTone {
  const min = Math.min(normMin, normMax);
  const max = Math.max(normMin, normMax);
  if (count >= min && count <= max) {
    return 'fair';
  }
  const above = count > max;
  if (polarity === 'virtue') {
    return above ? 'good' : 'poor';
  }
  return above ? 'poor' : 'good';
}

export function periodLabel(
  period: TabulaPeriod,
  window?: { from: string; to: string },
  today?: string,
): string {
  const current = Boolean(
    today && window && today >= window.from && today <= window.to,
  );
  switch (period) {
    case 'week':
      return current || !window ? 'This week' : `${window.from} – ${window.to}`;
    case 'month':
      return current || !window ? 'This month' : window.from.slice(0, 7);
    case 'year':
      return current || !window ? 'This year' : window.from.slice(0, 4);
    default:
      if (!window || !today || window.from === today) {
        return 'Today';
      }
      return window.from;
  }
}
