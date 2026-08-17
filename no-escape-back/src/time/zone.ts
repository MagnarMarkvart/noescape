export const DEFAULT_TZ = 'Europe/Tallinn';

export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function dateInZone(
  timeZone: string,
  input: Date | string = new Date(),
): string {
  return zoneStamp(input, timeZone).date;
}

export function zoneStamp(
  input: Date | string = new Date(),
  timeZone: string = DEFAULT_TZ,
): {
  date: string;
  time: string;
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
