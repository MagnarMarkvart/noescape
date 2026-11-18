export class CompleteHorologiumTaskDto {
  workMinutes!: number;
  restMinutes!: number;
  iterations!: number;
  mode!: 'adhoc' | 'planned';
  completedBlocks!: number;
  elapsedMinutes!: number;
  questRunId?: number;
  questSubtaskId?: number;
  endSession!: boolean;
  /** Goal Discipline already granted this sessio. */
  disciplineGranted?: boolean;
  /** Laps that already received special drips. */
  specialLapsAwarded?: number;
  presetId?: string;
  startedAt?: string;
  watchName?: string;
}

export class CloseEarlyHorologiumDto {
  workMinutes!: number;
  restMinutes!: number;
  iterations!: number;
  elapsedMinutes!: number;
  completedBlocks!: number;
  questRunId?: number;
  taskLabel?: string;
  presetId?: string;
  startedAt?: string;
  watchName?: string;
}
