export type TimerPhase = 'idle' | 'work' | 'rest' | 'complete';
export type HorologiumMode = 'adhoc' | 'planned';

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
}

export interface HorologiumXpPreview {
  mode: HorologiumMode;
  blockXp: number;
  goalBonusXp: number;
  totalIfCompleted: number;
  restMult: number;
  workLengthMult: number;
  modeMult: number;
  totalWorkMinutes: number;
  skillSlug: string;
}
