import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import { DEFAULT_TZ, isValidTimeZone } from '../time/zone';

export const FEATURE_HABITUS = 'feature:habitus';

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
    };
  }

  async updateSettings(input: { nickname?: string; timezone?: string }) {
    const data: { nickname?: string; timezone?: string } = {};
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
    if (Object.keys(data).length === 0) {
      return this.getProfile();
    }
    await this.prisma.character.update({
      where: { id: 1 },
      data,
    });
    if (data.timezone) {
      await this.time.reload();
    }
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
}
