import { RoutineView } from './routines.service';

export const CONSUETUDO_UNLOCK_QUEST_SLUG = 'ordo-diei';
export const DEFAULT_ROUTINE_ICON = '🌅';

export const SAMPLE_MORNING_STEPS: Array<{
  title: string;
  icon: string;
  durationMinutes: number;
}> = [
  { title: 'Get out of Bed', icon: '🛏️', durationMinutes: 5 },
  { title: 'Morning Wash', icon: '🦷', durationMinutes: 10 },
  { title: 'Glass of Water', icon: '💧', durationMinutes: 2 },
  { title: 'Make bed', icon: '🛏️', durationMinutes: 2 },
  { title: 'Make and Have Breakfast', icon: '🍎', durationMinutes: 30 },
  { title: "Write today's Dailies", icon: '✍️', durationMinutes: 15 },
];

export const CONSUETUDO_DEMO_ROUTINE: RoutineView = {
  id: -1,
  name: 'Morning Routine',
  icon: DEFAULT_ROUTINE_ICON,
  effortLevel: 3,
  skillWeights: [
    { slug: 'discipline', weight: 6 },
    { slug: 'hygiene', weight: 2 },
    { slug: 'cook', weight: 2 },
  ],
  sortOrder: 0,
  active: true,
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-08-18T08:00:00.000Z',
  steps: SAMPLE_MORNING_STEPS.map((step, i) => ({
    id: -(i + 1),
    title: step.title,
    icon: step.icon,
    durationMinutes: step.durationMinutes,
    sortOrder: i,
  })),
  runs: [
    {
      id: -10,
      date: '2026-08-18',
      startedAt: '2026-08-18T05:00:00.000Z',
      completedAt: '2026-08-18T06:05:00.000Z',
      skippedCount: 0,
      completedCount: 6,
      plannedSeconds: 64 * 60,
      elapsedMs: 62 * 60 * 1000,
      baseXp: 256,
      bonusXp: 128,
      xpAwarded: 384,
      notes: 'Woke a little late, skipped nothing. Tea was good.',
      steps: SAMPLE_MORNING_STEPS.map((step, i) => {
        const planned = step.durationMinutes * 60;
        const elapsed = planned * 1000 - (i === 4 ? 120_000 : 20_000);
        return {
          id: -(100 + i),
          stepId: -(i + 1),
          title: step.title,
          icon: step.icon,
          plannedSeconds: planned,
          elapsedMs: elapsed,
          outcome: 'COMPLETED' as const,
          deltaMs: elapsed - planned * 1000,
          sortOrder: i,
        };
      }),
    },
  ],
};
