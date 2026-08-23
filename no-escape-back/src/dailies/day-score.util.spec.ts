import { scoreDailyTasks } from './day-score.util';

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
