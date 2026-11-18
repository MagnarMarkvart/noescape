export class AbandonHorologiumSessionDto {
  workMinutes!: number;
  restMinutes!: number;
  iterations!: number;
  /** Work blocks that actually finished (timer elapsed, XP awarded). */
  completedBlocks!: number;
  presetId?: string;
  startedAt?: string;
  watchName?: string;
}
