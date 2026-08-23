export type WorkIntervalClockKind = 'sessio' | 'track' | 'vigilia';

export interface WorkIntervalTarget {
  dailyTaskId?: number | null;
  questSubtaskId?: number | null;
  questId?: number | null;
  scriptoriumWorkId?: number | null;
  watchId?: number | null;
}

export interface WorkIntervalRecord {
  id: number;
  clockKind: WorkIntervalClockKind;
  watchId: number | null;
  dailyTaskId: number | null;
  questRunId: number | null;
  questSubtaskId: number | null;
  questId: number | null;
  scriptoriumWorkId: number | null;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
}

export function clockKindLabel(kind: WorkIntervalClockKind): string {
  switch (kind) {
    case 'sessio':
      return 'Sessio';
    case 'track':
      return 'Track';
    case 'vigilia':
      return 'Vigilia';
    default:
      return kind;
  }
}
