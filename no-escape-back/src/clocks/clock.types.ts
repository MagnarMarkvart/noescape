export type ClockKind = 'sessio' | 'track' | 'consuetudo' | 'vigilia';
export type ClockStatus = 'idle' | 'running' | 'paused' | 'complete';
export type ClockPhase = 'idle' | 'work' | 'rest' | 'step' | 'complete';

export type ClockBoundDaily = {
  source: 'quest' | 'daily' | 'subtask';
  runId: number;
  dailyTaskId: number | null;
  subtaskId: number | null;
  questId: number;
  name: string;
  journeyLabel: string | null;
};

export type ClockSessioPayload = {
  mode: 'planned' | 'adhoc';
  workMinutes: number;
  restMinutes: number;
  iterations: number;
  restAfterLast: boolean;
  presetId?: string;
  currentIteration: number;
  completedBlocks: number;
  restCarryMs: number;
  sessionStartedAt: string;
  watchName?: string | null;
  watchId?: number | null;
  boundDaily?: ClockBoundDaily | null;
  taskCompleted: boolean;
  disciplineGranted?: boolean;
  awaitingContinue?: boolean;
};

export type ClockConsuetudoStep = {
  id: number;
  title: string;
  icon: string | null;
  durationMinutes: number;
  sortOrder: number;
};

export type ClockConsuetudoLog = {
  stepId: number | null;
  title: string;
  icon: string | null;
  plannedSeconds: number;
  elapsedMs: number;
  outcome: 'COMPLETED' | 'SKIPPED';
};

export type ClockConsuetudoPayload = {
  routineId: number;
  routineName: string;
  routineIcon: string | null;
  steps: ClockConsuetudoStep[];
  index: number;
  logs: ClockConsuetudoLog[];
};

export type ClockVigiliaPayload = {
  watchId: number;
  name: string;
  elapsedMs: number;
};

export type ClockSnapshot = {
  ownerId: string;
  kind: ClockKind;
  status: ClockStatus;
  phase: ClockPhase;
  startedAt: string | null;
  endsAt: string | null;
  pausedAccumMs: number;
  remainingMs: number;
  totalPhaseMs: number;
  notes: string;
  serverNow: string;
  sessio?: ClockSessioPayload;
  consuetudo?: ClockConsuetudoPayload;
  vigilia?: ClockVigiliaPayload;
};

export type ClockEvent = {
  snapshot: ClockSnapshot | null;
  kind: ClockKind;
  awards?: unknown[];
  reversal?: unknown;
  toast?: string | null;
  jingle?: 'work' | 'rest' | null;
  complete?: unknown;
};

export type StartSessioBody = {
  workMinutes?: number;
  restMinutes?: number;
  iterations?: number;
  restAfterLast?: boolean;
  presetId?: string;
  watchName?: string | null;
  watchId?: number | null;
  boundDaily?: ClockBoundDaily | null;
};

export type StartConsuetudoBody = {
  routineId?: number;
};

export type StartVigiliaBody = {
  watchId?: number;
};
