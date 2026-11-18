import {
  actualTaskMinutes,
  actualTimeSummary,
  scoreDailyTasks,
} from './day-score.util';

function regular(completed: boolean, minutes: number) {
  return {
    importance: 'REGULAR' as const,
    completed,
    durationMinutes: minutes,
  };
}

describe('scoreDailyTasks', () => {
  it('scores a full 9-task / 6h day with everything done as peak 100', () => {
    const tasks = Array.from({ length: 9 }, () => regular(true, 40));
    const result = scoreDailyTasks(tasks);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('peak');
    expect(result.loadMet).toBe(true);
    expect(result.allDone).toBe(true);
  });

  it('scores a light but fully done day as strong, not peak', () => {
    const tasks = Array.from({ length: 3 }, () => regular(true, 30));
    const result = scoreDailyTasks(tasks);
    expect(result.allDone).toBe(true);
    expect(result.loadMet).toBe(false);
    expect(result.score).toBe(89);
    expect(result.grade).toBe('strong');
  });

  it('penalizes one leftover most-important task more than a leftover regular', () => {
    const base = Array.from({ length: 8 }, () => regular(true, 40));
    const missMost = scoreDailyTasks([
      ...base,
      {
        importance: 'MOST_IMPORTANT',
        completed: false,
        durationMinutes: 40,
      },
    ]);
    const missRegular = scoreDailyTasks([...base, regular(false, 40)]);
    expect(missMost.score).toBe(56);
    expect(missMost.grade).toBe('average');
    expect(missRegular.score).toBe(86);
    expect(missRegular.grade).toBe('strong');
  });

  it('scores an empty board as a poor 0', () => {
    const result = scoreDailyTasks([]);
    expect(result.score).toBe(0);
    expect(result.grade).toBe('poor');
  });
});

describe('actualTimeSummary', () => {
  it('uses recorded time when present', () => {
    expect(
      actualTaskMinutes({
        completed: true,
        durationMinutes: 45,
        elapsedMs: 30 * 60_000,
      }),
    ).toEqual({ minutes: 30, assumed: false });
  });

  it('assumes planned time for a completed task with no recorded time', () => {
    expect(
      actualTaskMinutes({ completed: true, durationMinutes: 45, elapsedMs: 0 }),
    ).toEqual({ minutes: 45, assumed: true });
  });

  it('counts only recorded time for unfinished tasks', () => {
    expect(
      actualTaskMinutes({ completed: false, durationMinutes: 60 }),
    ).toEqual({ minutes: 0, assumed: false });
    expect(
      actualTaskMinutes({
        completed: false,
        durationMinutes: 60,
        elapsedMs: '1200000',
      }),
    ).toEqual({ minutes: 20, assumed: false });
  });

  it('totals planned vs actual vs the 6h goal', () => {
    const summary = actualTimeSummary([
      { completed: true, durationMinutes: 90, elapsedMs: 120 * 60_000 },
      { completed: true, durationMinutes: 60 },
      { completed: true, durationMinutes: 45, elapsedMs: 20 * 60_000 },
      { completed: false, durationMinutes: 60 },
    ]);
    expect(summary).toEqual({
      plannedMinutes: 255,
      actualMinutes: 200,
      goalMinutes: 360,
      deltaGoalMinutes: -160,
      deltaPlannedMinutes: -55,
      recordedCount: 2,
      assumedCount: 1,
    });
  });

  it('reports overtime as a positive delta', () => {
    const summary = actualTimeSummary([
      { completed: true, durationMinutes: 240, elapsedMs: 405 * 60_000 },
    ]);
    expect(summary.deltaGoalMinutes).toBe(45);
    expect(summary.deltaPlannedMinutes).toBe(165);
  });
});
