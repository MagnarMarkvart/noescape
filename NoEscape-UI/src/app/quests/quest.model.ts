export interface QuestRequirement {
  kind: 'skill' | 'unlock' | 'quest';
  label: string;
  met: boolean;
  detail: string;
  slug?: string;
  level?: number;
}

export interface QuestSubtaskView {
  id: number;
  title: string;
  sortOrder: number;
  gatesJourney: boolean;
  completed: boolean;
  completedAt: string | null;
  completedAtLabel: string | null;
  completedDate: string | null;
  completionOrder: number | null;
  elapsedMs?: number;
}

export interface QuestMissedDay {
  date: string;
  reason: string;
}

export interface QuestChronicleEvent {
  kind: string;
  at: string;
  atLabel: string;
  date: string;
  title: string;
  order: number | null;
}

export interface QuestWeekDay {
  date: string;
  logged: boolean;
  isToday: boolean;
}

export interface QuestWeekView {
  start: string;
  dates: QuestWeekDay[];
  expected: number;
  logged: number;
}

export interface QuestUnlocks {
  id: number;
  slug: string;
  name: string;
}

export interface QuestSkillShareView {
  slug: string;
  name: string;
  weight: number;
  xp: number;
}

export const QUEST_WEIGHT_TOTAL = 10;

export interface QuestRunView {
  id: number;
  status: string;
  streakCount: number;
  bestStreak: number;
  startedAt: string;
  startedAtLabel: string;
  completedAt: string | null;
  completedAtLabel: string | null;
  lastLogDate: string | null;
  destinationDone: boolean;
  logs: Array<{
    id: number;
    date: string;
    result: string;
    xpAwarded: number;
    note: string | null;
  }>;
  journeyLogs: Array<{
    id: number;
    date: string;
    note: string | null;
    at: string;
    atLabel: string;
  }>;
}

export interface QuestView {
  id: number;
  slug: string;
  name: string;
  tier: string;
  summary: string;
  description: string;
  rules: string | null;
  stakes: string | null;
  howToWin: string | null;
  destination: string | null;
  journeyLabel: string | null;
  journeyNote: string | null;
  commitmentLevel: number;
  coverImage: string | null;
  coverUrl: string | null;
  skillSlug: string | null;
  durationDays: number | null;
  kind: string;
  createdByUser: boolean;
  totalXp: number;
  skillShares: QuestSkillShareView[];
  wealthCents: number;
  xpPlan: { dayXp: number[]; completionBonus?: Record<string, number> };
  rewards: {
    title?: string;
    features?: string[];
    permissionKeys?: string[];
  } | null;
  requirements: QuestRequirement[];
  unlocksQuests: QuestUnlocks[];
  availability: 'available' | 'locked' | 'active' | 'completed';
  canStart: boolean;
  progressPercent: number;
  canCompleteDestination: boolean;
  subtasks: QuestSubtaskView[];
  journeyUnlocked: boolean;
  canLogJourney: boolean;
  journeyDueToday: boolean;
  missedDays: QuestMissedDay[];
  chronicle: QuestChronicleEvent[];
  week: QuestWeekView;
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
  progressPercent: number;
  commitmentLevel: number;
  journeyLabel: string | null;
  journeyDueToday: boolean;
  journeyUnlocked: boolean;
}

export interface CreateQuestPayload {
  name: string;
  summary?: string;
  rules?: string;
  stakes?: string;
  howToWin?: string;
  destination?: string;
  journeyLabel?: string;
  journeyNote?: string;
  commitmentLevel?: number;
  coverDataUrl?: string;
  tier?: string;
  skillSlug?: string;
  skillReqs?: { slug: string; level: number }[];
  questReqs?: string[];
  subtasks?: Array<{ id?: number; title: string; gatesJourney?: boolean }>;
  rewards?: { title?: string };
  totalXp?: number;
  skillWeights?: { slug: string; weight: number }[];
  wealthCents?: number | null;
}

/** Resolve cover URL (catalog + uploaded files live on the API host). */
export function resolveQuestCoverUrl(
  coverUrl: string | null,
  apiBase: string,
): string | null {
  if (!coverUrl) {
    return null;
  }
  if (coverUrl.startsWith('/uploads/') || coverUrl.startsWith('/assets/')) {
    return `${apiBase}${coverUrl}`;
  }
  return coverUrl;
}

export function questCoverBg(
  coverUrl: string | null,
  apiBase: string,
): string | null {
  const url = resolveQuestCoverUrl(coverUrl, apiBase);
  return url ? `url('${url}')` : null;
}

/** Briefing “Tasks” copy derived from quest kind (not stored separately). */
export function questTasks(q: QuestView): string[] {
  if (q.subtasks.length) {
    return q.subtasks.map((s) => s.title);
  }
  if (q.kind === 'STREAK_LOG') {
    const days = q.durationDays ?? (q.xpPlan.dayXp.length || 7);
    return [
      `Each day: log Clean or Broken`,
      `${days} clean days in a row to complete`,
      `Missed day counts as Broken`,
      `Streak reset restarts the count — quest stays active`,
    ];
  }
  if (q.destination) {
    return [q.destination];
  }
  return [q.summary || 'Complete the objective'];
}

export function questTimeframe(q: QuestView): string {
  if (q.commitmentLevel) {
    return q.commitmentLevel === 7
      ? 'Every day'
      : `${q.commitmentLevel}× per week`;
  }
  if (q.durationDays) {
    return `${q.durationDays} consecutive clean days`;
  }
  if (q.xpPlan.dayXp.length > 1) {
    return `${q.xpPlan.dayXp.length}-day run`;
  }
  return 'Open-ended';
}

export function chronicleKindLabel(kind: string): string {
  switch (kind) {
    case 'started':
      return 'Started';
    case 'subtask':
      return 'Subtask';
    case 'progress':
      return 'Tracked';
    case 'journey':
      return 'Journey';
    case 'missed':
      return 'Missed';
    case 'destination':
      return 'Destination';
    case 'clean':
      return 'Clean';
    case 'broken':
      return 'Broken';
    default:
      return kind;
  }
}

export function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
  });
}

export function dayNumber(iso: string): string {
  return iso.slice(8);
}

export function splitQuestXp(
  totalXp: number,
  weights: Array<{ slug: string; weight: number }>,
): Array<{ slug: string; weight: number; xp: number }> {
  const pool = Math.max(0, Math.round(Number(totalXp) || 0));
  const rows = weights
    .map((w) => ({
      slug: String(w.slug || '').trim(),
      weight: Math.round(Number(w.weight) || 0),
    }))
    .filter((w) => w.slug && w.weight > 0);
  if (rows.length === 0 || pool <= 0) {
    return rows.map((w) => ({ ...w, xp: 0 }));
  }
  const shares = rows.map((w) => {
    const exact = (pool * w.weight) / QUEST_WEIGHT_TOTAL;
    const xp = Math.floor(exact);
    return { ...w, xp, remainder: exact - xp };
  });
  let leftover = pool - shares.reduce((sum, s) => sum + s.xp, 0);
  const ranked = [...shares].sort((a, b) => b.remainder - a.remainder);
  let i = 0;
  while (leftover > 0 && ranked.length > 0) {
    ranked[i % ranked.length].xp += 1;
    leftover -= 1;
    i += 1;
  }
  return shares.map(({ remainder: _r, ...rest }) => rest);
}

/** One day's special-skill pool from a quest's total XP. */
export function questDailySpecialPool(
  totalXp: number,
  durationDays?: number | null,
): number {
  const pool = Math.max(0, Math.round(Number(totalXp) || 0));
  if (pool <= 0) {
    return 0;
  }
  const days = Math.max(1, Math.round(Number(durationDays) || 7));
  return Math.max(1, Math.round(pool / days));
}
