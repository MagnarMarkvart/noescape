export class AwardHorologiumBlockDto {
  workMinutes!: number;
  restMinutes!: number;
  /** adhoc = track; planned = sessio. Block XP is the same for both. */
  mode!: 'adhoc' | 'planned';
  presetId?: string;
}
