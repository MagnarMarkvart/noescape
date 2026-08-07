import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.skill.count();
    if (count === 0) {
      // Seed runs via prisma db seed; keep boot resilient if DB is empty.
      console.warn(
        'No skills found. Run: npm run prisma:seed --prefix no-escape-back',
      );
    }
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
    const progress = xpProgress(skill.xp, skill.level);
    return {
      ...skill,
      maxLevel: MAX_SKILL_LEVEL,
      xpToNext:
        skill.level >= MAX_SKILL_LEVEL
          ? 0
          : Math.max(0, xpForLevel(skill.level + 1) - skill.xp),
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

    const newXp = skill.xp + Math.floor(input.xpGained);
    const newLevel = Math.min(MAX_SKILL_LEVEL, levelFromXp(newXp));

    const [activity, updated] = await this.prisma.$transaction([
      this.prisma.activity.create({
        data: {
          skillId,
          xpGained: Math.floor(input.xpGained),
          duration: input.duration,
          note: input.note,
        },
      }),
      this.prisma.skill.update({
        where: { id: skillId },
        data: {
          xp: newXp,
          level: newLevel,
        },
      }),
    ]);

    return {
      activity,
      skill: this.enrich(updated),
      leveledUp: newLevel > skill.level,
      levelsGained: newLevel - skill.level,
    };
  }

  /** Reverse a previously awarded XP packet (misclick undo). */
  async reverseXp(skillId: number, activityId: number, xpGained: number) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill #${skillId} not found`);
    }

    const newXp = Math.max(0, skill.xp - Math.floor(xpGained));
    const newLevel = levelFromXp(newXp);

    const [, updated] = await this.prisma.$transaction([
      this.prisma.activity.deleteMany({
        where: { id: activityId, skillId },
      }),
      this.prisma.skill.update({
        where: { id: skillId },
        data: {
          xp: newXp,
          level: newLevel,
        },
      }),
    ]);

    return {
      skill: this.enrich(updated),
      xpRemoved: Math.floor(xpGained),
      leveledDown: newLevel < skill.level,
    };
  }
}
