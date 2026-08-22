import { formatElapsedMs as formatElapsedMsShared } from '../shared/time';

export type TimerPhase = 'idle' | 'work' | 'rest' | 'complete';
export type HorologiumMode = 'adhoc' | 'planned';
/** Setup selector: Sessio / Track are pomodoro; Vigilia is count-up; Consuetudo is a practice. */
export type HorologiumSetupKind = HorologiumMode | 'vigilia' | 'consuetudo';

export interface HorologiumConfig {
  workMinutes: number;
  restMinutes: number;
  /** Number of work blocks when mode is planned. Ignored in adhoc/track. */
  iterations: number;
  /** When true, a rest follows the final work block (planned only). */
  restAfterLast: boolean;
}

export interface HorologiumPreset {
  id: string;
  label: string;
  description: string;
  config: HorologiumConfig;
}

export const HOROLOGIUM_PRESETS: HorologiumPreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: '25 / 5 · 4',
    config: {
      workMinutes: 25,
      restMinutes: 5,
      iterations: 4,
      restAfterLast: true,
    },
  },
  {
    id: 'short',
    label: 'Short',
    description: '15 / 3 · 4',
    config: {
      workMinutes: 15,
      restMinutes: 3,
      iterations: 4,
      restAfterLast: true,
    },
  },
  {
    id: 'deep',
    label: 'Deep Focus',
    description: '50 / 10 · 2',
    config: {
      workMinutes: 50,
      restMinutes: 10,
      iterations: 2,
      restAfterLast: true,
    },
  },
  {
    id: 'sprint',
    label: 'Sprint',
    description: '10 / 2 · 6',
    config: {
      workMinutes: 10,
      restMinutes: 2,
      iterations: 6,
      restAfterLast: true,
    },
  },
];

export const DEFAULT_HOROLOGIUM_CONFIG: HorologiumConfig = {
  ...HOROLOGIUM_PRESETS[0].config,
};

export const WORK_END_JINGLE = '/assets/jingles/Pomodoro.ogg';
export const REST_END_JINGLE = '/assets/jingles/rest-timer-end.ogg';

export interface HorologiumSkillXp {
  slug: string;
  name: string;
  icon: string | null;
  xp: number;
}

export interface HorologiumSessionRecord {
  id: number;
  date: string;
  workMinutes: number;
  restMinutes: number;
  iterations: number;
  durationMinutes: number;
  presetId: string | null;
  skillId: number | null;
  skill: {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    level: number;
  } | null;
  xpAwarded: number;
  activityId: number | null;
  note: string | null;
  completedAt: string;
  outcome?: string;
  endedEarly?: boolean;
  elapsedMinutes?: number | null;
  questRunId?: number | null;
  taskLabel?: string | null;
  focusXpAwarded?: number;
  disciplineXpAwarded?: number;
  startedAt?: string | null;
  watchName?: string | null;
  skillXp?: HorologiumSkillXp[];
  restTotalMinutes?: number;
  kind?: 'sessio' | 'consuetudo';
  routineName?: string | null;
  routineIcon?: string | null;
}

export interface HorologiumXpPreview {
  mode: HorologiumMode;
  blockXp: number;
  goalBonusXp: number;
  disciplineXp?: number;
  focusIfCompleted?: number;
  disciplineIfCompleted?: number;
  totalIfCompleted: number;
  /** 30% of one split — charged once per unfinished block on abandon. */
  abandonPenaltyPerSplit: number;
  restMult: number;
  workLengthMult: number;
  modeMult: number;
  totalWorkMinutes: number;
  skillSlug: string;
  disciplineSkillSlug?: string;
}

export type HorologiumBoundSource = 'quest' | 'daily' | 'subtask';

export interface HorologiumBoundDaily {
  source: HorologiumBoundSource;
  /** Quest run id. 0 when source is a board daily. */
  runId: number;
  /** Board daily task id. Null when source is a quest daily/subtask. */
  dailyTaskId: number | null;
  subtaskId: number | null;
  questId: number;
  name: string;
  journeyLabel: string | null;
  kind: string;
  totalXp: number;
  durationDays: number | null;
  elapsedMs: number;
  subtaskCount?: number;
  skillShares: Array<{
    slug: string;
    name: string;
    weight: number;
    xp: number;
  }>;
}

export function horologiumBindKey(daily: HorologiumBoundDaily): string {
  if (daily.source === 'daily') {
    return `d:${daily.dailyTaskId}`;
  }
  if (daily.source === 'subtask') {
    return `s:${daily.runId}:${daily.subtaskId}`;
  }
  return `q:${daily.runId}`;
}

export function formatElapsedMs(ms: number): string {
  return formatElapsedMsShared(ms);
}

export interface HorologiumWatchRecord {
  id: number;
  name: string;
  status: string;
  elapsedMs: number;
  running: boolean;
  startedAt: string;
  lastStartedAt: string | null;
  archivedAt: string | null;
  scriptoriumWorkId?: number | null;
  createdAt: string;
  updatedAt: string;
}
