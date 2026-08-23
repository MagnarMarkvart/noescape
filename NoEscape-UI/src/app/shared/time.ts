export const DEFAULT_TZ = 'Europe/Tallinn';

export type DateFormatId = 'DMY' | 'MDY' | 'YMD';
export type TimeFormatId = 'H24' | 'H12';
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

export const TIME_FORMAT_OPTIONS: Array<{
  id: TimeFormatId;
  label: string;
  example: string;
}> = [
  { id: 'H24', label: '24-hour', example: '17:05' },
  { id: 'H12', label: '12-hour', example: '5:05 PM' },
];

export function isDateFormat(value: string): value is DateFormatId {
  return value === 'DMY' || value === 'MDY' || value === 'YMD';
}

export function isTimeFormat(value: string): value is TimeFormatId {
  return value === 'H24' || value === 'H12';
}

export function isWeekStart(value: number): value is WeekStart {
  return value === 0 || value === 1;
}

export function clampDayStartHour(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.min(23, Math.max(0, n));
}

export function dayStartHourLabel(
  hour: number,
  format: TimeFormatId = 'H24',
): string {
  const h = clampDayStartHour(hour);
  const h24 = `${String(h).padStart(2, '0')}:00`;
  const extra = h === 0 ? ' · midnight' : h === 12 ? ' · noon' : '';
  if (format === 'H24') {
    return `${h24}${extra}`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const period = h < 12 ? 'AM' : 'PM';
  return `${h12}:00 ${period}${extra}`;
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

/**
 * Log day in the zone: hours before `dayStartHour` belong to the previous date.
 * Example: 05:00 on 17.08 with start 6 → 2026-08-16.
 */
export function civilDateInZone(
  timeZone: string,
  dayStartHour = 0,
  input: Date | string = new Date(),
): string {
  const hour = clampDayStartHour(dayStartHour);
  const instant = typeof input === 'string' ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  if (hour <= 0) {
    return date;
  }
  const wallHour = Number(get('hour'));
  if (Number.isFinite(wallHour) && wallHour < hour) {
    return shiftIsoDays(date, -1);
  }
  return date;
}

export function formatTimeInZone(
  input: Date | string,
  timeZone: string,
  format: TimeFormatId = 'H24',
): string {
  const hour12 = format === 'H12';
  return new Intl.DateTimeFormat(hour12 ? 'en-US' : 'en-GB', {
    timeZone,
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(typeof input === 'string' ? new Date(input) : input);
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
