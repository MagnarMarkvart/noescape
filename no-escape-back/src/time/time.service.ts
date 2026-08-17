import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TZ,
  dateInZone,
  isValidTimeZone,
  zoneStamp,
} from './zone';

@Injectable()
export class TimeService implements OnModuleInit {
  private tz = DEFAULT_TZ;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    const row = await this.prisma.character.findUnique({
      where: { id: 1 },
      select: { timezone: true },
    });
    const next = row?.timezone?.trim() || DEFAULT_TZ;
    this.tz = isValidTimeZone(next) ? next : DEFAULT_TZ;
  }

  timezone(): string {
    return this.tz;
  }

  today(): string {
    return dateInZone(this.tz);
  }

  stamp(input: Date | string = new Date()) {
    return zoneStamp(input, this.tz);
  }
}
