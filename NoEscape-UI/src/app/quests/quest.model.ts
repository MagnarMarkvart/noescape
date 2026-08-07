export interface QuestRequirement {
  kind: 'skill' | 'unlock' | 'quest';
  label: string;
  met: boolean;
  detail: string;
}

export interface QuestRunView {
  id: number;
  status: string;
  streakCount: number;
  bestStreak: number;
  startedAt: string;
  completedAt: string | null;
  lastLogDate: string | null;
  logs: Array<{
    id: number;
    date: string;
    result: string;
    xpAwarded: number;
    note: string | null;
  }>;
}

export interface QuestView {
  id: number;
  slug: string;
  name: string;
  tier: string;
  summary: string;
  description: string;
  coverImage: string | null;
  coverUrl: string | null;
  skillSlug: string | null;
  durationDays: number | null;
  kind: string;
  createdByUser: boolean;
  xpPlan: { dayXp: number[]; completionBonus?: Record<string, number> };
  rewards: {
    title?: string;
    features?: string[];
    permissionKeys?: string[];
  } | null;
  requirements: QuestRequirement[];
  availability: 'available' | 'locked' | 'active' | 'completed';
  canStart: boolean;
  run: QuestRunView | null;
}

export interface ActiveQuestSummary {
  runId: number;
  questId: number;
  slug: string;
  name: string;
  tier: string;
  streakCount: number;
  bestStreak: number;
  durationDays: number | null;
  kind: string;
  lastLogDate: string | null;
  startedAt: string;
}

/** Briefing “Tasks” copy derived from quest kind (not stored separately). */
export function questTasks(q: QuestView): string[] {
  if (q.kind === 'STREAK_LOG') {
    const days = q.durationDays ?? (q.xpPlan.dayXp.length || 7);
    return [
      `Each day: log Clean or Broken`,
      `${days} clean days in a row to complete`,
      `Missed day counts as Broken`,
      `Streak reset restarts the count — quest stays active`,
    ];
  }
  return [q.summary || 'Complete the objective'];
}

export function questTimeframe(q: QuestView): string {
  if (q.durationDays) {
    return `${q.durationDays} consecutive clean days`;
  }
  if (q.xpPlan.dayXp.length > 1) {
    return `${q.xpPlan.dayXp.length}-day run`;
  }
  return 'Open-ended';
}
