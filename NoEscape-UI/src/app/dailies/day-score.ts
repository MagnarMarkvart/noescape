import {
  DailyLogDetail,
  DailyTaskSlot,
  DailyVerdict,
  TaskImportance,
} from './daily.model';

export const DAY_TASK_GOAL = 9;
export const DAY_TIME_GOAL_MINUTES = 6 * 60;

/** Weekends get a lighter bar and softer penalties. */
export const WEEKEND_TASK_GOAL = 6;
export const WEEKEND_TIME_GOAL_MINUTES = 4 * 60;
export const WEEKEND_PENALTY_FACTOR = 0.6;

export interface DayGoals {
  weekend: boolean;
  taskGoal: number;
  timeGoalMinutes: number;
  penaltyFactor: number;
}

/** True for Saturday/Sunday of an ISO yyyy-mm-dd date. */
export function isWeekendIso(date?: string | null): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 || day === 6;
}

export function dayGoals(date?: string | null): DayGoals {
  const weekend = isWeekendIso(date);
  return weekend
    ? {
        weekend,
        taskGoal: WEEKEND_TASK_GOAL,
        timeGoalMinutes: WEEKEND_TIME_GOAL_MINUTES,
        penaltyFactor: WEEKEND_PENALTY_FACTOR,
      }
    : {
        weekend,
        taskGoal: DAY_TASK_GOAL,
        timeGoalMinutes: DAY_TIME_GOAL_MINUTES,
        penaltyFactor: 1,
      };
}

function barLabel(goals: DayGoals): string {
  return `${goals.taskGoal}-task / ${goals.timeGoalMinutes / 60}h`;
}

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
  /** Weekend scoring (lighter bar) was applied. */
  weekend?: boolean;
  taskGoal?: number;
  timeGoalMinutes?: number;
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

export function scoreDailyTasks(
  tasks: DayScoreTask[],
  date?: string | null,
): DayScore {
  const goals = dayGoals(date);
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
    Math.max(filledCount / goals.taskGoal, assignedMinutes / goals.timeGoalMinutes),
  );
  const loadMet =
    filledCount >= goals.taskGoal ||
    assignedMinutes >= goals.timeGoalMinutes;
  const allDone = filledCount > 0 && leftoverCount === 0;

  if (filledCount === 0) {
    return finalize(goals, {
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
      return finalize(goals, {
        score: 100,
        filledCount,
        completedCount,
        leftoverCount,
        assignedMinutes,
        trackedCount,
        loadMet,
        allDone,
        summary: `Every task done, and the ${barLabel(goals)} bar was met.`,
      });
    }
    return finalize(goals, {
      score: 86 + Math.round(loadFrac * 9),
      filledCount,
      completedCount,
      leftoverCount,
      assignedMinutes,
      trackedCount,
      loadMet,
      allDone,
      summary: `Every task done, though the day was set light of the ${barLabel(goals)} bar.`,
    });
  }

  const missPenalty = Math.min(
    80,
    leftover.reduce((sum, task) => sum + (MISS_PENALTY[task.importance] ?? 12), 0),
  );
  const volumeGap = Math.round(
    (1 - completedCount / filledCount) * 20 * goals.penaltyFactor,
  );
  const underload = loadMet ? 0 : goals.weekend ? 4 : 8;
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
    summary += ` Load sat under the ${barLabel(goals)} bar.`;
  }

  return finalize(goals, {
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
  goals: DayGoals,
  partial: Omit<DayScore, 'grade' | 'tone' | 'label'> & { summary: string },
): DayScore {
  const score = clampScore(partial.score);
  const grade = gradeFromScore(score);
  return {
    ...partial,
    summary: goals.weekend
      ? `${partial.summary} Weekend: lighter bar.`
      : partial.summary,
    weekend: goals.weekend,
    taskGoal: goals.taskGoal,
    timeGoalMinutes: goals.timeGoalMinutes,
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

export function scoreFromSlots(
  slots: DailyTaskSlot[],
  date?: string | null,
): DayScore {
  return scoreDailyTasks(
    slots.map((slot) => ({
      importance: slot.importance,
      completed: slot.completed,
      durationMinutes: slot.durationMinutes,
      elapsedMs: slot.elapsedMs,
    })),
    date,
  );
}

export function verdictFromLog(log: DailyLogDetail): DailyVerdict {
  const live = scoreFromSlots(filledSlotsFromBoard(log.snapshot.board), log.date);
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

export interface ActualTimeTask {
  completed: boolean;
  durationMinutes: number;
  elapsedMs?: number | null;
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
  const recorded = Math.max(0, Math.round(Number(task.elapsedMs ?? 0) / 60_000));
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
    plannedMinutes += Math.max(0, Math.round(Number(task.durationMinutes) || 0));
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

/** "1h 40m short", "+45m over" or "on target". */
export function formatTimeDelta(deltaMinutes: number, shortWord = 'short'): string {
  const n = Math.round(Number(deltaMinutes) || 0);
  if (n === 0) {
    return 'on target';
  }
  return n < 0
    ? `${formatAssignedHours(-n)} ${shortWord}`
    : `+${formatAssignedHours(n)} over`;
}
