export const TABULA_PERIODS = ['day', 'week', 'month', 'year'] as const;
export type TabulaPeriod = (typeof TABULA_PERIODS)[number];

export const TABULA_POLARITIES = ['vice', 'virtue'] as const;
export type TabulaPolarity = (typeof TABULA_POLARITIES)[number];

export type TabulaTone = 'good' | 'fair' | 'poor';

export interface TabulaView {
  id: number;
  name: string;
  icon: string | null;
  period: TabulaPeriod;
  polarity: TabulaPolarity;
  normMin: number;
  normMax: number;
  step: number;
  questId: number | null;
  questName: string | null;
  sortOrder: number;
  archived: boolean;
  count: number;
  tone: TabulaTone;
  windowFrom: string;
  windowTo: string;
  windowLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface TabulaClickView {
  id: number;
  tabulaId: number;
  tabulaName: string;
  tabulaIcon: string | null;
  date: string;
  delta: number;
  createdAt: string;
}

export interface TabulaLogView {
  date: string;
  clicks: TabulaClickView[];
  board: TabulaView[];
}

export interface TabulaUpsertPayload {
  name: string;
  icon?: string | null;
  period: TabulaPeriod;
  polarity: TabulaPolarity;
  normMin: number;
  normMax: number;
  step: number;
  questId?: number | null;
}

export const TABULA_PERIOD_OPTIONS: Array<{ id: TabulaPeriod; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

export const TABULA_POLARITY_OPTIONS: Array<{
  id: TabulaPolarity;
  label: string;
  hint: string;
}> = [
  {
    id: 'vice',
    label: 'Less is better',
    hint: 'Green below the band — smoke, drink, tempers.',
  },
  {
    id: 'virtue',
    label: 'More is better',
    hint: 'Green above the band — water, walks, pages.',
  },
];

export function emptyTabulaDraft(): TabulaUpsertPayload {
  return {
    name: '',
    icon: '◆',
    period: 'day',
    polarity: 'vice',
    normMin: 0,
    normMax: 3,
    step: 1,
    questId: null,
  };
}

export function periodCaption(row: TabulaView): string {
  switch (row.period) {
    case 'week':
      return 'Week';
    case 'month':
      return 'Month';
    case 'year':
      return 'Year';
    default:
      return 'Day';
  }
}

export function bandLabel(row: TabulaView): string {
  if (row.normMin === row.normMax) {
    return `norm ${row.normMin}`;
  }
  return `norm ${row.normMin}–${row.normMax}`;
}
