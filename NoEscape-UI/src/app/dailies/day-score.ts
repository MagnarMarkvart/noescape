import {
  DailyLogDetail,
  DailyTaskSlot,
  DailyVerdict,
  TaskImportance,
} from './daily.model';

export const DAY_TASK_GOAL = 9;
export const DAY_TIME_GOAL_MINUTES = 6 * 60;

export type DayGrade = 'poor' | 'average' | 'strong' | 'peak';
export type DayTone = 'bad' | 'warn' | 'ok';

export interface DayScoreTask {
  importance: TaskImportance;
  completed: boolean;
  durationMinutes: number;
  elapsedMs?: number;
}

export interface DayScore {
  score: number;
  grade: DayGrade;
  tone: DayTone;
  label: string;
  summary: string;
  filledCount: number;
  completedCount: number;
  leftoverCount: number;
  assignedMinutes: number;
  trackedCount: number;
  loadMet: boolean;
  allDone: boolean;
}

const MISS_PENALTY: Record<TaskImportance, number> = {
  MOST_IMPORTANT: 42,
  IMPORTANT: 26,
  REGULAR: 12,
};

const GRADE_LABEL: Record<DayGrade, string> = {
  peak: 'Peak day',
  strong: 'Strong day',
  average: 'Average day',
  poor: 'Poor day',
};

export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function gradeFromScore(score: number): DayGrade {
  if (score >= 90) {
    return 'peak';
  }
  if (score >= 75) {
    return 'strong';
  }
  if (score >= 50) {
    return 'average';
  }
  return 'poor';
}

export function toneFromGrade(grade: DayGrade): DayTone {
  if (grade === 'poor') {
    return 'bad';
  }
  if (grade === 'average') {
    return 'warn';
  }
  return 'ok';
}

export function scoreDailyTasks(tasks: DayScoreTask[]): DayScore {
  const filled = tasks;
  const filledCount = filled.length;
  const completedCount = filled.filter((task) => task.completed).length;
  const leftover = filled.filter((task) => !task.completed);
  const leftoverCount = leftover.length;
  const assignedMinutes = filled.reduce(
    (sum, task) => sum + Math.max(0, Math.round(Number(task.durationMinutes) || 0)),
    0,
  );
  const trackedCount = filled.filter((task) => Number(task.elapsedMs) > 0).length;
  const loadFrac = Math.min(
    1,
    Math.max(filledCount / DAY_TASK_GOAL, assignedMinutes / DAY_TIME_GOAL_MINUTES),
  );
  const loadMet =
    filledCount >= DAY_TASK_GOAL || assignedMinutes >= DAY_TIME_GOAL_MINUTES;
  const allDone = filledCount > 0 && leftoverCount === 0;

  if (filledCount === 0) {
    return finalize({
      score: 0,
      filledCount,
      completedCount,
      leftoverCount,
      assignedMinutes,
      trackedCount,
      loadMet: false,
      allDone: false,
      summary: 'No tasks were set.',
    });
  }

  if (allDone) {
    if (loadMet) {
      return finalize({
        score: 100,
        filledCount,
        completedCount,
        leftoverCount,
        assignedMinutes,
        trackedCount,
        loadMet,
        allDone,
        summary: 'Every task done, and the 9-task / 6h bar was met.',
      });
    }
    return finalize({
      score: 86 + Math.round(loadFrac * 9),
      filledCount,
      completedCount,
      leftoverCount,
      assignedMinutes,
      trackedCount,
      loadMet,
      allDone,
      summary: 'Every task done, though the day was set light of the 9-task / 6h bar.',
    });
  }

  const missPenalty = Math.min(
    80,
    leftover.reduce((sum, task) => sum + (MISS_PENALTY[task.importance] ?? 12), 0),
  );
  const volumeGap = Math.round((1 - completedCount / filledCount) * 20);
  const underload = loadMet ? 0 : 8;
  const score = clampScore(100 - missPenalty - volumeGap - underload);
  const missLabel = leftoverCount === 1 ? leftover[0].importance : null;
  let summary = `${completedCount}/${filledCount} done.`;
  if (missLabel === 'MOST_IMPORTANT') {
    summary = 'The most important task was left undone.';
  } else if (missLabel === 'IMPORTANT') {
    summary = 'An important task was left undone.';
  } else if (missLabel === 'REGULAR') {
    summary = 'One regular task was left undone.';
  } else if (leftoverCount > 1) {
    summary = `${leftoverCount} tasks left undone.`;
  }
  if (!loadMet) {
    summary += ' Load sat under the 9-task / 6h bar.';
  }

  return finalize({
    score,
    filledCount,
    completedCount,
    leftoverCount,
    assignedMinutes,
    trackedCount,
    loadMet,
    allDone,
    summary,
  });
}

function finalize(
  partial: Omit<DayScore, 'grade' | 'tone' | 'label'> & { summary: string },
): DayScore {
  const score = clampScore(partial.score);
  const grade = gradeFromScore(score);
  return {
    ...partial,
    score,
    grade,
    tone: toneFromGrade(grade),
    label: GRADE_LABEL[grade],
  };
}

export function filledSlotsFromBoard(board: {
  tiers: Array<{ slots: DailyTaskSlot[] }>;
}): DailyTaskSlot[] {
  return board.tiers.flatMap((tier) =>
    tier.slots.filter((slot) => slot.isFilled),
  );
}

export function scoreFromSlots(slots: DailyTaskSlot[]): DayScore {
  return scoreDailyTasks(
    slots.map((slot) => ({
      importance: slot.importance,
      completed: slot.completed,
      durationMinutes: slot.durationMinutes,
      elapsedMs: slot.elapsedMs,
    })),
  );
}

export function verdictFromLog(log: DailyLogDetail): DailyVerdict {
  const live = scoreFromSlots(filledSlotsFromBoard(log.snapshot.board));
  const grade = log.grade ?? live.grade;
  return {
    ...live,
    score: log.score ?? live.score,
    grade,
    tone: log.tone ?? toneFromGrade(grade),
    label: log.verdict || live.label,
    summary: log.summary || live.summary,
  };
}

export function formatAssignedHours(minutes: number): string {
  const n = Math.max(0, Math.round(Number(minutes) || 0));
  if (n < 60) {
    return `${n}m`;
  }
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
