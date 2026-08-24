export type ScriptoriumTier = 'IMMINENS' | 'TEMPESTIVA' | 'COGITATA';

export type ScriptoriumUrgency = 'overdue' | 'today' | 'soon' | 'later';

export interface ScriptoriumSubtaskView {
  id: number;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface ScriptoriumSkillShare {
  slug: string;
  name: string;
  icon: string | null;
  weight: number;
}

export interface ScriptoriumWorkView {
  id: number;
  title: string;
  notes: string;
  icon: string | null;
  tier: ScriptoriumTier;
  dueDate: string | null;
  durationMinutes: number | null;
  effort: number;
  skillWeights: Array<{ slug: string; weight: number }>;
  skillShares: ScriptoriumSkillShare[];
  status: string;
  questId: number | null;
  questName: string | null;
  assignedKind?: 'quest' | 'daily' | null;
  assignedDailyDate?: string | null;
  assignedDailyTaskId?: number | null;
  locked?: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  subtasks: ScriptoriumSubtaskView[];
  subtaskDone: number;
  subtaskTotal: number;
}

export interface ScriptoriumDueView extends ScriptoriumWorkView {
  dueInDays: number;
  urgency: ScriptoriumUrgency;
}

export interface ScriptoriumUpsertPayload {
  title?: string;
  notes?: string;
  icon?: string | null;
  tier?: ScriptoriumTier;
  dueDate?: string | null;
  durationMinutes?: number | null;
  effort?: number;
  skillWeights?: Array<{ slug: string; weight: number }>;
  subtasks?: string[];
  status?: 'OPEN' | 'ARCHIVED';
}

export const SCRIPTORIUM_TIERS: Array<{
  id: ScriptoriumTier;
  name: string;
  kicker: string;
  hint: string;
}> = [
  {
    id: 'IMMINENS',
    name: 'Imminens',
    kicker: 'Urgent',
    hint: 'Works that press upon you now.',
  },
  {
    id: 'TEMPESTIVA',
    name: 'Tempestiva',
    kicker: 'Timely',
    hint: 'Appointed works in their season.',
  },
  {
    id: 'COGITATA',
    name: 'Cogitata',
    kicker: 'Ideas',
    hint: 'Notions not yet bound to a day.',
  },
];

export const DEFAULT_SCRIPTORIUM_ICON = '📜';

export type ScriptoriumSortId =
  | 'due'
  | 'title'
  | 'effort'
  | 'duration'
  | 'created';

export const SCRIPTORIUM_SORTS: Array<{ id: ScriptoriumSortId; label: string }> =
  [
    { id: 'due', label: 'Due date' },
    { id: 'title', label: 'Title' },
    { id: 'effort', label: 'Complexity' },
    { id: 'duration', label: 'Volume' },
    { id: 'created', label: 'Newest' },
  ];

export function durationLabel(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) {
    return '—';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function workLocked(work: ScriptoriumWorkView): boolean {
  return Boolean(work.locked || work.assignedKind || work.questId);
}

export function emptyWorkDraft(): ScriptoriumUpsertPayload & {
  title: string;
  notes: string;
  icon: string;
  tier: ScriptoriumTier;
  dueDate: string;
  durationMinutes: number | null;
  effort: number;
  skillWeights: Array<{ slug: string; weight: number }>;
} {
  return {
    title: '',
    notes: '',
    icon: DEFAULT_SCRIPTORIUM_ICON,
    tier: 'COGITATA',
    dueDate: '',
    durationMinutes: null,
    effort: 5,
    skillWeights: [],
  };
}
