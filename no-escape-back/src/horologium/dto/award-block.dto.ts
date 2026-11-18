export class AwardHorologiumBlockDto {
  workMinutes!: number;
  restMinutes!: number;
  /** adhoc = track; planned = sessio. Block XP is the same for both. */
  mode!: 'adhoc' | 'planned';
  presetId?: string;
  questRunId?: number;
  questSubtaskId?: number;
  /** 1-based finished work block (for special-skill drip). */
  lapIndex?: number;
  /** Planned laps used to split the daily special pool. */
  laps?: number;
  /** When false, skip quest specials (extra Focus after a settled task). */
  specialDrops?: boolean;
  startedAt?: string;
  watchName?: string;
}
