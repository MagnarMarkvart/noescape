import { TaskImportance } from '../xp/daily-xp.util';

/** Set at least this many filled tasks, or… */
export const DAY_TASK_GOAL = 9;
/** …assign at least this much planned time (6 hours). */
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
    (sum, task) =>
      sum + Math.max(0, Math.round(Number(task.durationMinutes) || 0)),
    0,
  );
  const trackedCount = filled.filter(
    (task) => Number(task.elapsedMs) > 0,
  ).length;
  const loadFrac = Math.min(
    1,
    Math.max(
      filledCount / DAY_TASK_GOAL,
      assignedMinutes / DAY_TIME_GOAL_MINUTES,
    ),
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
      summary:
        'Every task done, though the day was set light of the 9-task / 6h bar.',
    });
  }

  const missPenalty = Math.min(
    80,
    leftover.reduce(
      (sum, task) => sum + (MISS_PENALTY[task.importance] ?? 12),
      0,
    ),
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

export interface ActualTimeTask {
  completed: boolean;
  durationMinutes: number;
  elapsedMs?: number | string | bigint | null;
}

export interface ActualTimeSummary {
  /** Sum of planned durations of all filled tasks. */
  plannedMinutes: number;
  /** Time actually spent: tracked time, else planned time for completed tasks. */
  actualMinutes: number;
  /** The daily time goal (6h). */
  goalMinutes: number;
  /** actualMinutes − goalMinutes (negative = short of the goal). */
  deltaGoalMinutes: number;
  /** actualMinutes − plannedMinutes. */
  deltaPlannedMinutes: number;
  /** Completed tasks with recorded time. */
  recordedCount: number;
  /** Completed tasks without recorded time, counted at their planned duration. */
  assumedCount: number;
}

/**
 * Minutes actually spent on one task. Recorded time (Horologium or the
 * "Time spent" field on complete) wins. A completed task with no recorded
 * time is assumed to have taken its planned duration. An unfinished task only
 * counts time that was actually recorded.
 */
export function actualTaskMinutes(task: ActualTimeTask): {
  minutes: number;
  assumed: boolean;
} {
  const recorded = Math.max(
    0,
    Math.round(Number(task.elapsedMs ?? 0) / 60_000),
  );
  if (recorded > 0) {
    return { minutes: recorded, assumed: false };
  }
  if (task.completed) {
    return {
      minutes: Math.max(0, Math.round(Number(task.durationMinutes) || 0)),
      assumed: true,
    };
  }
  return { minutes: 0, assumed: false };
}

export function actualTimeSummary(
  tasks: ActualTimeTask[],
  goalMinutes = DAY_TIME_GOAL_MINUTES,
): ActualTimeSummary {
  let plannedMinutes = 0;
  let actualMinutes = 0;
  let recordedCount = 0;
  let assumedCount = 0;
  for (const task of tasks) {
    plannedMinutes += Math.max(
      0,
      Math.round(Number(task.durationMinutes) || 0),
    );
    const actual = actualTaskMinutes(task);
    actualMinutes += actual.minutes;
    if (task.completed) {
      if (actual.assumed) {
        assumedCount += 1;
      } else {
        recordedCount += 1;
      }
    }
  }
  return {
    plannedMinutes,
    actualMinutes,
    goalMinutes,
    deltaGoalMinutes: actualMinutes - goalMinutes,
    deltaPlannedMinutes: actualMinutes - plannedMinutes,
    recordedCount,
    assumedCount,
  };
}
