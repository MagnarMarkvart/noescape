export const DEFAULT_TZ = 'Europe/Tallinn';

export type DateFormatId = 'DMY' | 'MDY' | 'YMD';
export type WeekStart = 0 | 1;

export const DATE_FORMAT_OPTIONS: Array<{
  id: DateFormatId;
  label: string;
  example: string;
}> = [
  { id: 'DMY', label: 'Day.Month.Year', example: '18.08.2026' },
  { id: 'MDY', label: 'Month/Day/Year', example: '08/18/2026' },
  { id: 'YMD', label: 'Year-Month-Day', example: '2026-08-18' },
];

export function isDateFormat(value: string): value is DateFormatId {
  return value === 'DMY' || value === 'MDY' || value === 'YMD';
}

export function isWeekStart(value: number): value is WeekStart {
  return value === 0 || value === 1;
}

export function formatIsoDate(
  iso: string,
  format: DateFormatId = 'DMY',
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return iso;
  }
  const [, y, m, d] = match;
  switch (format) {
    case 'MDY':
      return `${m}/${d}/${y}`;
    case 'YMD':
      return `${y}-${m}-${d}`;
    default:
      return `${d}.${m}.${y}`;
  }
}

export function weekdayNames(weekStartsOn: WeekStart): string[] {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return [...names.slice(weekStartsOn), ...names.slice(0, weekStartsOn)];
}

export function startOfWeekIso(iso: string, weekStartsOn: WeekStart): string {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  const diff =
    weekStartsOn === 0 ? -day : day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toIsoLocal(d);
}

export function monthGridLead(year: number, month: number, weekStartsOn: WeekStart): number {
  const first = new Date(year, month - 1, 1);
  return (first.getDay() - weekStartsOn + 7) % 7;
}

export function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoLocal(d);
}

export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

export function shiftIsoMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(y, m - 1 + months, Math.min(d, 28));
  return toIsoLocal(next);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function todayInZone(timeZone: string, input = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(input);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatElapsedShort(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 1) {
    return ms > 0 ? '<1m' : '0m';
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}
