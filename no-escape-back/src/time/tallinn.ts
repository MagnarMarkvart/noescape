import { DEFAULT_TZ, dateInZone, zoneStamp } from './zone';

export const TALLINN_TZ = DEFAULT_TZ;

export function tallinnStamp(input: Date | string = new Date()) {
  return zoneStamp(input, TALLINN_TZ);
}

export function tallinnToday(): string {
  return dateInZone(TALLINN_TZ);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function eachDateInclusive(from: string, to: string): string[] {
  if (from > to) {
    return [];
  }
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}

export function isoWeekDates(iso: string): string[] {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const n = new Date(dt);
    n.setUTCDate(dt.getUTCDate() + i);
    const yy = n.getUTCFullYear();
    const mm = String(n.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(n.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  });
}
