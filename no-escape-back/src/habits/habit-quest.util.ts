export type HabitQuestRule = 'COUNT' | 'STREAK' | 'WINDOW';
export type HabitQuestTarget = 'JOURNEY' | 'SUBTASK';

export type HabitQuestLogRow = {
  date: string;
  success: boolean;
  kind: string;
};

export function parseHabitQuestRule(raw?: string | null): HabitQuestRule {
  if (raw === 'STREAK' || raw === 'WINDOW') {
    return raw;
  }
  return 'COUNT';
}

export function parseHabitQuestTarget(raw?: string | null): HabitQuestTarget {
  return raw === 'SUBTASK' ? 'SUBTASK' : 'JOURNEY';
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

function afterLastReset(events: HabitQuestLogRow[]): HabitQuestLogRow[] {
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));
  let cut = 0;
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].kind === 'reset') {
      cut = i + 1;
    }
  }
  return ordered.slice(cut);
}

/** Progress after the full append-only log (resets included, never deleted). */
export function evaluateHabitQuest(
  events: HabitQuestLogRow[],
  rule: HabitQuestRule,
  requiredCount: number,
  windowDays: number | null,
  today: string,
): { progress: number; completed: boolean; needsReset: boolean } {
  const need = Math.max(1, Math.round(requiredCount) || 1);
  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const current = afterLastReset(ordered);

  if (rule === 'STREAK') {
    let streak = 0;
    let cursor: string | null = null;
    for (const ev of current) {
      if (!ev.success) {
        streak = 0;
        cursor = ev.date;
        continue;
      }
      if (cursor && daysBetween(cursor, ev.date) > 1) {
        streak = 1;
      } else {
        streak += 1;
      }
      cursor = ev.date;
    }
    const lastSuccess = [...current].reverse().find((e) => e.success);
    const missed =
      Boolean(lastSuccess) &&
      lastSuccess!.date < today &&
      daysBetween(lastSuccess!.date, today) > 1;
    return {
      progress: missed ? 0 : streak,
      completed: !missed && streak >= need,
      needsReset: missed && streak > 0,
    };
  }

  if (rule === 'WINDOW') {
    const span = Math.max(1, Math.round(windowDays || 7));
    const start = addDays(today, 1 - span);
    const inWindow = current.filter(
      (e) => e.success && e.date >= start && e.date <= today,
    );
    const first = current.find((e) => e.success);
    const expired =
      Boolean(first) &&
      daysBetween(first!.date, today) >= span &&
      inWindow.length < need;
    return {
      progress: inWindow.length,
      completed: inWindow.length >= need,
      needsReset: expired,
    };
  }

  const successes = current.filter((e) => e.success);
  return {
    progress: successes.length,
    completed: successes.length >= need,
    needsReset: false,
  };
}

export function addIsoDays(iso: string, days: number): string {
  return addDays(iso, days);
}
