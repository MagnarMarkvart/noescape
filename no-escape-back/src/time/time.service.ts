import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { weekDates } from './tallinn';
import {
  DateFormatId,
  DEFAULT_TZ,
  dateInZone,
  formatIsoDate,
  isDateFormat,
  isValidTimeZone,
  isWeekStart,
  WeekStart,
  zoneStamp,
} from './zone';

@Injectable()
export class TimeService implements OnModuleInit {
  private tz = DEFAULT_TZ;
  private dateFmt: DateFormatId = 'DMY';
  private weekStart: WeekStart = 1;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    const row = await this.prisma.character.findUnique({
      where: { id: 1 },
      select: { timezone: true, dateFormat: true, weekStartsOn: true },
    });
    const next = row?.timezone?.trim() || DEFAULT_TZ;
    this.tz = isValidTimeZone(next) ? next : DEFAULT_TZ;
    this.dateFmt = isDateFormat(row?.dateFormat ?? '') ? row!.dateFormat as DateFormatId : 'DMY';
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

  weekStartsOn(): WeekStart {
    return this.weekStart;
  }

  today(): string {
    return dateInZone(this.tz);
  }

  weekDates(iso: string): string[] {
    return weekDates(iso, this.weekStart);
  }

  formatDate(iso: string): string {
    return formatIsoDate(iso, this.dateFmt);
  }

  stamp(input: Date | string = new Date()) {
    const z = zoneStamp(input, this.tz);
    return {
      ...z,
      label: `${this.formatDate(z.date)} ${z.time} ${z.zone}`,
    };
  }
}
