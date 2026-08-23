import {
  HabitRangeLog,
  HabitStats,
  HabitStatsGrain,
  HabitView,
} from './habits.service';

const SAMPLE: HabitView[] = [
  {
    id: -1,
    name: 'Morning walk',
    icon: '🚶',
    skillId: null,
    skill: null,
    cadence: 'DAILY',
    everyNDays: 1,
    active: true,
    archived: false,
    createdAt: '2026-01-12T08:00:00.000Z',
    totalCompletions: 86,
    currentStreak: 12,
    bestStreak: 21,
    firstLog: '2026-01-12',
    lastLog: '2026-08-17',
    recentDates: [],
    wealthCents: 0,
    kind: 'check',
    skillWeights: [],
    effortLevel: 5,
    durationMinutes: 30,
    allowInDailies: true,
    period: 'day',
    polarity: 'virtue',
    normMin: 0,
    normMax: 1,
    step: 1,
    questId: null,
    questName: null,
    sortOrder: 0,
    doneToday: false,
    successfulToday: false,
    dueToday: true,
    groupId: null,
    groupName: null,
    questLink: null,
    count: 0,
    tone: null,
    windowFrom: '2026-08-23',
    windowTo: '2026-08-23',
    windowLabel: 'Today',
  },
  {
    id: -2,
    name: 'Journal',
    icon: '✎',
    skillId: null,
    skill: null,
    cadence: 'EVERY_N_DAYS',
    everyNDays: 2,
    active: true,
    archived: false,
    createdAt: '2026-02-03T08:00:00.000Z',
    totalCompletions: 48,
    currentStreak: 4,
    bestStreak: 11,
    firstLog: '2026-02-03',
    lastLog: '2026-08-16',
    recentDates: [],
    wealthCents: 0,
    kind: 'check',
    skillWeights: [],
    effortLevel: 5,
    durationMinutes: 20,
    allowInDailies: true,
    period: 'day',
    polarity: 'virtue',
    normMin: 0,
    normMax: 1,
    step: 1,
    questId: null,
    questName: null,
    sortOrder: 1,
    doneToday: false,
    successfulToday: false,
    dueToday: false,
    groupId: null,
    groupName: null,
    questLink: null,
    count: 0,
    tone: null,
    windowFrom: '2026-08-23',
    windowTo: '2026-08-23',
    windowLabel: 'Today',
  },
  {
    id: -3,
    name: 'Cold rinse',
    icon: '❄',
    skillId: null,
    skill: null,
    cadence: 'DAILY',
    everyNDays: 1,
    active: true,
    archived: false,
    createdAt: '2026-03-01T08:00:00.000Z',
    totalCompletions: 61,
    currentStreak: 6,
    bestStreak: 14,
    firstLog: '2026-03-01',
    lastLog: '2026-08-17',
    recentDates: [],
    wealthCents: 0,
    kind: 'tally',
    skillWeights: [],
    effortLevel: 3,
    durationMinutes: 5,
    allowInDailies: false,
    period: 'day',
    polarity: 'virtue',
    normMin: 1,
    normMax: 1,
    step: 1,
    questId: null,
    questName: null,
    sortOrder: 2,
    doneToday: true,
    successfulToday: true,
    dueToday: false,
    groupId: null,
    groupName: null,
    questLink: null,
    count: 1,
    tone: 'fair',
    windowFrom: '2026-08-23',
    windowTo: '2026-08-23',
    windowLabel: 'Today',
  },
];

export const HABITUS_DEMO_HABITS: HabitView[] = SAMPLE;

export const HABITUS_UNLOCK_QUEST_SLUG = 'custodia-mentis';

function isoOffset(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dayIndex(iso: string): number {
  return Math.floor(new Date(`${iso}T12:00:00`).getTime() / 86_400_000);
}

function demoCompleted(habit: HabitView, date: string): boolean {
  const n = dayIndex(date);
  if (habit.cadence === 'EVERY_N_DAYS') {
    return n % Math.max(1, habit.everyNDays) === 0;
  }
  if (habit.id === -3) {
    return n % 4 !== 0;
  }
  return n % 5 !== 2;
}

export function habitusDemoRange(
  habitId: number,
  from: string,
  to: string,
): HabitRangeLog | null {
  const habit = SAMPLE.find((h) => h.id === habitId) ?? null;
  if (!habit) {
    return null;
  }
  const days: HabitRangeLog['days'] = [];
  let cursor = from;
  while (cursor <= to) {
    const completed = demoCompleted(habit, cursor);
    days.push({
      date: cursor,
      completed,
      source: completed ? 'MANUAL' : null,
      count: completed ? 1 : 0,
    });
    cursor = isoOffset(cursor, 1);
  }
  return {
    habit,
    from,
    to,
    days,
    completedCount: days.filter((d) => d.completed).length,
  };
}

function isoDayDiff(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

function demoAssigned(habit: HabitView, date: string, today: string): boolean {
  if (habit.kind === 'tally') {
    return false;
  }
  const created = habit.createdAt.slice(0, 10);
  if (date < created || date > today) {
    return false;
  }
  if (habit.cadence !== 'EVERY_N_DAYS') {
    return true;
  }
  const n = Math.max(1, habit.everyNDays || 1);
  return isoDayDiff(created, date) % n === 0;
}

export function habitusDemoStats(input: {
  from?: string;
  to?: string;
  grain: HabitStatsGrain;
  ids: number[];
  today: string;
}): HabitStats {
  const rows = input.ids.length
    ? SAMPLE.filter((h) => input.ids.includes(h.id))
    : SAMPLE;
  const today = input.today;
  let from = input.from && input.grain !== 'all' ? input.from : today;
  let to = input.to && input.grain !== 'all' ? input.to : today;
  if (input.grain === 'all') {
    from = rows
      .map((h) => h.firstLog)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? today;
    to = today;
  }
  const dayMap = new Map<
    string,
    { points: number; completions: number; clicks: number }
  >();
  const byHabit = new Map<
    number,
    { points: number; completions: number; clicks: number }
  >();
  const bump = (
    date: string,
    habitId: number,
    field: 'completions' | 'clicks',
    n: number,
  ) => {
    const day = dayMap.get(date) ?? { points: 0, completions: 0, clicks: 0 };
    day[field] += n;
    day.points += n;
    dayMap.set(date, day);
    const row = byHabit.get(habitId) ?? {
      points: 0,
      completions: 0,
      clicks: 0,
    };
    row[field] += n;
    row.points += n;
    byHabit.set(habitId, row);
  };
  const doneDates = new Map<number, Set<string>>();
  for (const habit of rows) {
    const log = habitusDemoRange(habit.id, from, to);
    if (!log) {
      continue;
    }
    for (const day of log.days) {
      if (!day.completed) {
        continue;
      }
      if (habit.kind === 'tally') {
        bump(day.date, habit.id, 'clicks', day.count || 1);
      } else {
        const set = doneDates.get(habit.id) ?? new Set<string>();
        set.add(day.date);
        doneDates.set(habit.id, set);
        bump(day.date, habit.id, 'completions', 1);
      }
    }
  }
  const days: HabitStats['days'] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push({
      date: cursor,
      ...(dayMap.get(cursor) ?? { points: 0, completions: 0, clicks: 0 }),
      marks: rows
        .filter((h) => demoAssigned(h, cursor, today))
        .map((h) => ({
          id: h.id,
          icon: h.icon,
          done: doneDates.get(h.id)?.has(cursor) ?? false,
        })),
    });
    cursor = isoOffset(cursor, 1);
  }
  const seriesMap = new Map<string, { key: string; label: string; value: number }>();
  for (const day of days) {
    let key = day.date;
    let label = day.date;
    if (input.grain === 'year' || input.grain === 'all') {
      key = day.date.slice(0, 4);
      label = key;
    } else if (input.grain === 'month') {
      key = day.date.slice(0, 7);
      label = key;
    } else if (input.grain === 'week') {
      key = day.date;
      label = `Week of ${day.date}`;
    }
    const prev = seriesMap.get(key) ?? { key, label, value: 0 };
    prev.value += day.points;
    seriesMap.set(key, prev);
  }
  const totals = days.reduce(
    (acc, d) => ({
      points: acc.points + d.points,
      completions: acc.completions + d.completions,
      clicks: acc.clicks + d.clicks,
    }),
    { points: 0, completions: 0, clicks: 0 },
  );
  return {
    from,
    to,
    grain: input.grain,
    ...totals,
    series: [...seriesMap.values()],
    days,
    habits: rows.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      kind: h.kind,
      questName: h.questName,
      ...(byHabit.get(h.id) ?? { points: 0, completions: 0, clicks: 0 }),
    })),
  };
}
