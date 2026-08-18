import { HabitRangeLog, HabitView } from './habits.service';

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
