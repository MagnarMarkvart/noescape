export class LogQuickTaskDto {
  title!: string;
  skillId?: number;
  skillWeights?: Array<{ slug: string; weight: number }>;
  effortLevel!: number;
  durationMinutes!: number;
  templateId?: number | null;
  wealthCents?: number | null;
}
