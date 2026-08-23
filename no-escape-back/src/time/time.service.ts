import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { weekDates } from './tallinn';
import {
  DateFormatId,
  DEFAULT_TZ,
  TimeFormatId,
  civilDateInZone,
  clampDayStartHour,
  formatIsoDate,
  formatTimeInZone,
  isDateFormat,
  isTimeFormat,
  isValidTimeZone,
  isWeekStart,
  WeekStart,
  zoneStamp,
} from './zone';

@Injectable()
export class TimeService implements OnModuleInit {
  private tz = DEFAULT_TZ;
  private dateFmt: DateFormatId = 'DMY';
  private timeFmt: TimeFormatId = 'H24';
  private dayStart = 0;
  private weekStart: WeekStart = 1;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    const row = await this.prisma.character.findUnique({
      where: { id: 1 },
      select: {
        timezone: true,
        dateFormat: true,
        timeFormat: true,
        dayStartHour: true,
        weekStartsOn: true,
      },
    });
    const next = row?.timezone?.trim() || DEFAULT_TZ;
    this.tz = isValidTimeZone(next) ? next : DEFAULT_TZ;
    this.dateFmt = isDateFormat(row?.dateFormat ?? '')
      ? (row!.dateFormat as DateFormatId)
      : 'DMY';
    this.timeFmt = isTimeFormat(row?.timeFormat ?? '')
      ? (row!.timeFormat as TimeFormatId)
      : 'H24';
    this.dayStart = clampDayStartHour(row?.dayStartHour ?? 0);
    this.weekStart = isWeekStart(row?.weekStartsOn ?? -1)
      ? (row!.weekStartsOn as WeekStart)
      : 1;
  }

  timezone(): string {
    return this.tz;
  }

  dateFormat(): DateFormatId {
    return this.dateFmt;
  }

  timeFormat(): TimeFormatId {
    return this.timeFmt;
  }

  dayStartHour(): number {
    return this.dayStart;
  }

  weekStartsOn(): WeekStart {
    return this.weekStart;
  }

  /** Civil log day in the player's zone (respects start-of-day). */
  today(input: Date | string = new Date()): string {
    return civilDateInZone(this.tz, this.dayStart, input);
  }

  civilDate(input: Date | string = new Date()): string {
    return civilDateInZone(this.tz, this.dayStart, input);
  }

  weekDates(iso: string): string[] {
    return weekDates(iso, this.weekStart);
  }

  formatDate(iso: string): string {
    return formatIsoDate(iso, this.dateFmt);
  }

  formatTime(input: Date | string = new Date()): string {
    return formatTimeInZone(input, this.tz, this.timeFmt);
  }

  stamp(input: Date | string = new Date()) {
    const z = zoneStamp(input, this.tz);
    const date = civilDateInZone(this.tz, this.dayStart, input);
    const clock = formatTimeInZone(input, this.tz, this.timeFmt);
    return {
      ...z,
      date,
      clock,
      label: `${this.formatDate(date)} ${clock} ${z.zone}`,
    };
  }
}
