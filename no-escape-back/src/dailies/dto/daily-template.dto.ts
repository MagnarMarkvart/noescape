export class CreateDailyTemplateDto {
  name!: string;
  icon?: string;
  skillId?: number;
  skillWeights?: Array<{ slug: string; weight: number }>;
  habitId?: number | null;
  effortLevel!: number;
  durationMinutes!: number;
  wealthCents?: number | null;
}

export class UpdateDailyTemplateDto {
  name?: string;
  icon?: string;
  skillId?: number;
  skillWeights?: Array<{ slug: string; weight: number }>;
  habitId?: number | null;
  effortLevel?: number;
  durationMinutes?: number;
  wealthCents?: number | null;
}
