export const DEFAULT_TZ = 'Europe/Tallinn';

export type DateFormatId = 'DMY' | 'MDY' | 'YMD';
export type TimeFormatId = 'H24' | 'H12';
export type WeekStart = 0 | 1;

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

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Calendar date in the zone (midnight-to-midnight), ignoring day-start hour. */
export function dateInZone(
  timeZone: string,
  input: Date | string = new Date(),
): string {
  return zoneStamp(input, timeZone).date;
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
  const stamp = zoneStamp(input, timeZone);
  if (hour <= 0) {
    return stamp.date;
  }
  const wallHour = Number(stamp.time.slice(0, 2));
  if (Number.isFinite(wallHour) && wallHour < hour) {
    return addDaysIso(stamp.date, -1);
  }
  return stamp.date;
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

export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function zoneStamp(
  input: Date | string = new Date(),
  timeZone: string = DEFAULT_TZ,
): {
  date: string;
  time: string;
  zone: string;
  label: string;
  iso: string;
} {
  const d = typeof input === 'string' ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  const zone = get('timeZoneName') || timeZone;
  return {
    date,
    time,
    zone,
    label: `${date} ${time} ${zone}`,
    iso: d.toISOString(),
  };
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
