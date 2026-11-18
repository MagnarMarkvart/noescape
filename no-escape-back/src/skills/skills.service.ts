import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';
import {
  levelFromXp,
  MAX_SKILL_LEVEL,
  xpForLevel,
  xpProgress,
} from '../xp/xp.util';
import { CreateActivityDto } from './dto/create-activity.dto';

const CATEGORY_META: Record<
  string,
  { label: string; icon: string; sortOrder: number }
> = {
  Physical: { label: 'Physical', icon: '🏋️', sortOrder: 1 },
  Mind: { label: 'Mind', icon: '🧠', sortOrder: 2 },
  Career: { label: 'Career', icon: '🔧', sortOrder: 3 },
  Domestic: { label: 'Domestic', icon: '🏡', sortOrder: 4 },
  Soul: { label: 'Soul', icon: '🔗', sortOrder: 5 },
};

@Injectable()
export class SkillsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardsService: RewardsService,
  ) {}

  async onModuleInit() {
    const count = await this.prisma.skill.count();
    if (count === 0) {
      // Seed runs via prisma db seed; keep boot resilient if DB is empty.
      console.warn(
        'No skills found. Run: npm run prisma:seed --prefix no-escape-back',
      );
      return;
    }
    // Keep stored levels aligned with the OSRS XP table after formula changes.
    await this.syncLevelsFromXp();
  }

  /** Recompute skill.level from skill.xp using the current XP curve. */
  private async syncLevelsFromXp(): Promise<void> {
    const skills = await this.prisma.skill.findMany({
      select: { id: true, xp: true, level: true },
    });
    const updates = skills
      .map((skill) => ({
        id: skill.id,
        level: levelFromXp(skill.xp),
        prev: skill.level,
      }))
      .filter((row) => row.level !== row.prev);

    await Promise.all(
      updates.map((row) =>
        this.prisma.skill.update({
          where: { id: row.id },
          data: { level: row.level },
        }),
      ),
    );
  }

  private enrich(skill: {
    id: number;
    name: string;
    slug: string;
    category: string;
    level: number;
    xp: number;
    icon: string | null;
    xpSources: string;
    sortOrder: number;
  }) {
    const level = levelFromXp(skill.xp);
    const progress = xpProgress(skill.xp, level);
    return {
      ...skill,
      level,
      maxLevel: MAX_SKILL_LEVEL,
      xpToNext:
        level >= MAX_SKILL_LEVEL
          ? 0
          : Math.max(0, xpForLevel(level + 1) - skill.xp),
      progress,
    };
  }

  async findAll() {
    const skills = await this.prisma.skill.findMany({
      orderBy: [{ sortOrder: 'asc' }],
    });
    return skills.map((skill) => this.enrich(skill));
  }

  async findGrouped() {
    const skills = await this.findAll();
    const groups = Object.entries(CATEGORY_META)
      .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
      .map(([key, meta]) => ({
        category: key,
        label: meta.label,
        icon: meta.icon,
        skills: skills.filter((skill) => skill.category === key),
        totalLevel: skills
          .filter((skill) => skill.category === key)
          .reduce((sum, skill) => sum + skill.level, 0),
      }));

    const totalLevel = skills.reduce((sum, skill) => sum + skill.level, 0);
    return {
      totalLevel,
      averageLevel:
        skills.length === 0 ? 1 : Math.floor(totalLevel / skills.length),
      categories: groups,
    };
  }

  async findOne(id: number) {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) {
      throw new NotFoundException(`Skill #${id} not found`);
    }
    return this.enrich(skill);
  }

  async findActivities(skillId: number) {
    await this.findOne(skillId);
    return this.prisma.activity.findMany({
      where: { skillId },
      orderBy: { loggedAt: 'desc' },
      take: 50,
    });
  }

  async logActivity(skillId: number, dto: CreateActivityDto) {
    if (!Number.isFinite(dto.xpGained) || dto.xpGained <= 0) {
      throw new BadRequestException('xpGained must be a positive number');
    }

    return this.awardXp(skillId, {
      xpGained: Math.floor(dto.xpGained),
      duration: dto.duration,
      note: dto.note,
    });
  }

  async awardXp(
    skillId: number,
    input: { xpGained: number; duration?: number; note?: string },
  ) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill #${skillId} not found`);
    }

    if (skill.level >= MAX_SKILL_LEVEL) {
      throw new BadRequestException('Skill is already maxed at level 99');
    }

    const gained = Math.floor(input.xpGained);
    const previousLevel = skill.level;
    const previousXp = skill.xp;
    const previousProgress = xpProgress(previousXp, previousLevel);
    const newXp = previousXp + gained;
    const newLevel = Math.min(MAX_SKILL_LEVEL, levelFromXp(newXp));
    const levelsGained = newLevel - previousLevel;
    const leveledUp = levelsGained > 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          skillId,
          xpGained: gained,
          duration: input.duration,
          note: input.note,
        },
      });
      const updated = await tx.skill.update({
        where: { id: skillId },
        data: {
          xp: newXp,
          level: newLevel,
        },
      });
      let levelUpEvent = null;
      if (leveledUp) {
        levelUpEvent = await tx.levelUpEvent.create({
          data: {
            skillId,
            fromLevel: previousLevel,
            toLevel: newLevel,
            levelsGained,
          },
        });
      }
      return { activity, updated, levelUpEvent };
    });

    const newUnlocks = leveledUp
      ? await this.rewardsService.checkUnlocks(skillId, newLevel)
      : [];
    const newlyMetQuestReqs = leveledUp
      ? await this.newlyMetQuestSkillReqs(
          skill.slug,
          skill.name,
          previousLevel,
          newLevel,
        )
      : [];

    return {
      activity: result.activity,
      skill: this.enrich(result.updated),
      leveledUp,
      levelsGained,
      previousLevel,
      previousXp,
      previousProgress,
      levelUpEvent: result.levelUpEvent,
      newUnlocks,
      newlyMetQuestReqs,
    };
  }

  async listLevelUps(page = 1, pageSize = 20) {
    const safePage = Math.max(1, Math.round(page) || 1);
    const safeSize = Math.min(50, Math.max(1, Math.round(pageSize) || 20));
    const skip = (safePage - 1) * safeSize;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.levelUpEvent.count(),
      this.prisma.levelUpEvent.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeSize,
        include: {
          skill: {
            select: {
              id: true,
              name: true,
              slug: true,
              icon: true,
              category: true,
              level: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safeSize));
    return {
      items,
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    };
  }

  /** Reverse a previously awarded XP packet (misclick undo). */
  async reverseXp(
    skillId: number,
    xpGained: number,
    activityId?: number | null,
  ) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill #${skillId} not found`);
    }

    const removed = Math.floor(xpGained);
    const previousLevel = skill.level;
    const previousXp = skill.xp;
    const previousProgress = xpProgress(previousXp, previousLevel);
    const newXp = Math.max(0, previousXp - removed);
    const newLevel = levelFromXp(newXp);
    const levelsLost = previousLevel - newLevel;
    const leveledDown = levelsLost > 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (activityId != null) {
        await tx.activity.deleteMany({
          where: { id: activityId, skillId },
        });
      }
      return tx.skill.update({
        where: { id: skillId },
        data: {
          xp: newXp,
          level: newLevel,
        },
      });
    });

    return {
      skill: this.enrich(updated),
      xpRemoved: removed,
      leveledDown,
      levelsLost,
      previousLevel,
      previousXp,
      previousProgress,
    };
  }

  private async newlyMetQuestSkillReqs(
    slug: string,
    skillName: string,
    previousLevel: number,
    newLevel: number,
  ): Promise<Array<{ questName: string; label: string }>> {
    const quests = await this.prisma.quest.findMany({
      select: { name: true, skillReqsJson: true },
    });
    const hits: Array<{ questName: string; label: string }> = [];
    for (const quest of quests) {
      let reqs: Array<{ slug?: string; level?: number }> = [];
      try {
        reqs = JSON.parse(quest.skillReqsJson || '[]');
      } catch {
        continue;
      }
      if (!Array.isArray(reqs)) {
        continue;
      }
      for (const req of reqs) {
        const level = Number(req.level) || 0;
        if (
          req.slug === slug &&
          level > previousLevel &&
          level <= newLevel
        ) {
          hits.push({
            questName: quest.name,
            label: `${skillName} Lv ${level}`,
          });
        }
      }
    }
    return hits;
  }
}
