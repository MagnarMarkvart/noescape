export type TimerPhase = 'idle' | 'work' | 'rest' | 'complete';

export interface QuestTimerConfig {
  workMinutes: number;
  restMinutes: number;
  /** Number of work blocks in the session. */
  iterations: number;
  /** When true, a rest follows the final work block. */
  restAfterLast: boolean;
}

export interface QuestTimerPreset {
  id: string;
  label: string;
  description: string;
  config: QuestTimerConfig;
}

export const QUEST_TIMER_PRESETS: QuestTimerPreset[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: '25 / 5 · 4 quests',
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
    description: '15 / 3 · 4 quests',
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
    description: '50 / 10 · 2 quests',
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
    description: '10 / 2 · 6 quests',
    config: {
      workMinutes: 10,
      restMinutes: 2,
      iterations: 6,
      restAfterLast: true,
    },
  },
];

export const DEFAULT_QUEST_TIMER_CONFIG: QuestTimerConfig = {
  ...QUEST_TIMER_PRESETS[0].config,
};

export const JINGLE_SRC = '/assets/jingles/Pomodoro.ogg';
