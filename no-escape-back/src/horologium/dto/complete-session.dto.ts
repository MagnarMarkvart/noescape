export class CompleteHorologiumSessionDto {
  workMinutes!: number;
  restMinutes!: number;
  iterations!: number;
  restAfterLast?: boolean;
  presetId?: string;
}
