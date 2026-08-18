export const CURRENCY_OPTIONS = [
  { id: 'EUR', label: 'Euro' },
  { id: 'USD', label: 'US Dollar' },
  { id: 'GBP', label: 'Pound sterling' },
] as const;

export type CurrencyId = (typeof CURRENCY_OPTIONS)[number]['id'];
export const DEFAULT_CURRENCY: CurrencyId = 'EUR';

export function isCurrency(value: unknown): value is CurrencyId {
  return (
    value === 'EUR' || value === 'USD' || value === 'GBP'
  );
}

export function parseMoneyToCents(
  raw: string | number | null | undefined,
): number {
  if (raw == null || raw === '') {
    return 0;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.round(raw * 100);
  }
  const text = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!text) {
    return 0;
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  const n = Math.round(Number(cents) || 0);
  if (n === 0) {
    return '';
  }
  return (n / 100).toFixed(2);
}

export function formatMoney(
  cents: number | null | undefined,
  currency: CurrencyId,
): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format((Number(cents) || 0) / 100);
}

export function currencySymbol(currency: CurrencyId): string {
  if (currency === 'USD') {
    return '$';
  }
  if (currency === 'GBP') {
    return '£';
  }
  return '€';
}
