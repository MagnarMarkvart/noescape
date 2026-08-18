import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import { DEFAULT_TZ, isDateFormat, isValidTimeZone, isWeekStart } from '../time/zone';
import {
  DEFAULT_CURRENCY,
  isCurrency,
  parseMajorToCents,
  type CurrencyId,
} from '../wealth/money.util';

export const FEATURE_HABITUS = 'feature:habitus';
export const FEATURE_CONSUETUDO = 'feature:consuetudo';

@Injectable()
export class CharacterService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  async onModuleInit() {
    await this.prisma.character.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, title: 'Peasant' },
    });
    await this.prisma.featureUnlock.upsert({
      where: { key: FEATURE_HABITUS },
      update: {},
      create: { key: FEATURE_HABITUS, unlocked: false },
    });
    await this.prisma.featureUnlock.upsert({
      where: { key: FEATURE_CONSUETUDO },
      update: {},
      create: { key: FEATURE_CONSUETUDO, unlocked: false },
    });
    await this.time.reload();
  }

  async getProfile() {
    const character = await this.prisma.character.findUniqueOrThrow({
      where: { id: 1 },
    });
    const features = await this.prisma.featureUnlock.findMany({
      orderBy: { key: 'asc' },
    });
    const skills = await this.prisma.skill.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        level: true,
        category: true,
      },
    });
    const activeQuests = await this.prisma.questRun.count({
      where: { status: 'ACTIVE' },
    });
    const completedQuests = await this.prisma.questRun.count({
      where: { status: 'COMPLETED' },
    });

    return {
      character,
      title: character.title,
      nickname: character.nickname,
      timezone: character.timezone || DEFAULT_TZ,
      dateFormat: isDateFormat(character.dateFormat) ? character.dateFormat : 'DMY',
      weekStartsOn: isWeekStart(character.weekStartsOn) ? character.weekStartsOn : 1,
      menuAutoToggleMobile: character.menuAutoToggleMobile !== false,
      menuAutoToggleDesktop: character.menuAutoToggleDesktop !== false,
      wealthCents: character.wealthCents ?? 0,
      currency: isCurrency(character.currency)
        ? character.currency
        : DEFAULT_CURRENCY,
      features: Object.fromEntries(
        features.map((f) => [f.key, f.unlocked]),
      ) as Record<string, boolean>,
      featureList: features,
      totalLevel: skills.reduce((s, sk) => s + sk.level, 0),
      skills,
      activeQuests,
      completedQuests,
      habitusUnlocked:
        features.find((f) => f.key === FEATURE_HABITUS)?.unlocked ?? false,
      consuetudoUnlocked:
        features.find((f) => f.key === FEATURE_CONSUETUDO)?.unlocked ?? false,
    };
  }

  async updateSettings(input: {
    nickname?: string;
    timezone?: string;
    dateFormat?: string;
    weekStartsOn?: number;
    menuAutoToggleMobile?: boolean;
    menuAutoToggleDesktop?: boolean;
    currency?: string;
  }) {
    const data: {
      nickname?: string;
      timezone?: string;
      dateFormat?: string;
      weekStartsOn?: number;
      menuAutoToggleMobile?: boolean;
      menuAutoToggleDesktop?: boolean;
      currency?: CurrencyId;
    } = {};
    if (input.nickname !== undefined) {
      data.nickname = String(input.nickname).trim().slice(0, 40);
    }
    if (input.timezone !== undefined) {
      const tz = String(input.timezone).trim();
      if (!isValidTimeZone(tz)) {
        throw new BadRequestException('Unknown timezone');
      }
      data.timezone = tz;
    }
    if (input.dateFormat !== undefined) {
      const fmt = String(input.dateFormat).trim().toUpperCase();
      if (!isDateFormat(fmt)) {
        throw new BadRequestException('dateFormat must be DMY, MDY, or YMD');
      }
      data.dateFormat = fmt;
    }
    if (input.weekStartsOn !== undefined) {
      const start = Number(input.weekStartsOn);
      if (!isWeekStart(start)) {
        throw new BadRequestException('weekStartsOn must be 0 (Sunday) or 1 (Monday)');
      }
      data.weekStartsOn = start;
    }
    if (input.menuAutoToggleMobile !== undefined) {
      data.menuAutoToggleMobile = Boolean(input.menuAutoToggleMobile);
    }
    if (input.menuAutoToggleDesktop !== undefined) {
      data.menuAutoToggleDesktop = Boolean(input.menuAutoToggleDesktop);
    }
    if (input.currency !== undefined) {
      const code = String(input.currency).trim().toUpperCase();
      if (!isCurrency(code)) {
        throw new BadRequestException('currency must be EUR, USD, or GBP');
      }
      data.currency = code;
    }
    if (Object.keys(data).length === 0) {
      return this.getProfile();
    }
    await this.prisma.character.update({
      where: { id: 1 },
      data,
    });
    await this.time.reload();
    return this.getProfile();
  }

  async setTitle(title: string) {
    return this.prisma.character.update({
      where: { id: 1 },
      data: { title },
    });
  }

  async unlockFeature(key: string) {
    return this.prisma.featureUnlock.upsert({
      where: { key },
      update: { unlocked: true, unlockedAt: new Date() },
      create: { key, unlocked: true, unlockedAt: new Date() },
    });
  }

  async isFeatureUnlocked(key: string): Promise<boolean> {
    const row = await this.prisma.featureUnlock.findUnique({ where: { key } });
    return row?.unlocked ?? false;
  }

  async getWealth(limit = 40) {
    const character = await this.prisma.character.findUniqueOrThrow({
      where: { id: 1 },
    });
    const take = Math.min(80, Math.max(1, Math.round(Number(limit) || 40)));
    const entries = await this.prisma.wealthEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return {
      wealthCents: character.wealthCents ?? 0,
      currency: isCurrency(character.currency)
        ? character.currency
        : DEFAULT_CURRENCY,
      entries,
    };
  }

  /**
   * Change the purse and append a ledger row. deltaCents may be negative
   * (bills / undo). Zero is a no-op and returns the current balance.
   */
  async adjustWealth(input: {
    deltaCents: number;
    note?: string;
    source?: string;
    sourceId?: number;
    date?: string;
  }) {
    const delta = Math.round(Number(input.deltaCents) || 0);
    if (!Number.isFinite(delta) || delta === 0) {
      return this.getWealth();
    }
    const note = input.note?.trim().slice(0, 160) || null;
    const source = (input.source?.trim() || 'manual').slice(0, 24);
    const date = input.date || this.time.today();
    const sourceId =
      input.sourceId != null && Number.isFinite(Number(input.sourceId))
        ? Math.round(Number(input.sourceId))
        : null;

    await this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findUniqueOrThrow({
        where: { id: 1 },
      });
      const next = character.wealthCents + delta;
      await tx.character.update({
        where: { id: 1 },
        data: { wealthCents: next },
      });
      await tx.wealthEntry.create({
        data: {
          date,
          deltaCents: delta,
          balanceCents: next,
          note,
          source,
          sourceId,
        },
      });
    });

    return this.getWealth();
  }

  async adjustFromAmount(input: {
    amount?: unknown;
    direction?: string;
    note?: string;
  }) {
    const cents = parseMajorToCents(input.amount);
    if (cents === 0) {
      throw new BadRequestException('Enter an amount');
    }
    const remove =
      String(input.direction || 'add').toLowerCase() === 'remove';
    return this.adjustWealth({
      deltaCents: remove ? -cents : cents,
      note: input.note,
      source: 'manual',
    });
  }
}
