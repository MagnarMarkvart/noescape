import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UnlockType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type RewardStatus =
  | 'unlocked'
  | 'available'
  | 'locked_level'
  | 'locked_requirements';

export interface RewardView {
  id: number;
  skillId: number;
  levelReq: number;
  type: UnlockType;
  label: string;
  description: string;
  permissionKey: string | null;
  wealthLevelReq: number | null;
  questIds: string | null;
  orderIndex: number;
  icon: string;
  unlocked: boolean;
  claimedAt: Date | null;
  status: RewardStatus;
  missing: string[];
}

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySkill(skillId: number) {
    await this.requireSkill(skillId);
    return this.prisma.reward.findMany({
      where: { skillId },
      orderBy: [{ levelReq: 'asc' }, { orderIndex: 'asc' }],
    });
  }

  /**
   * After a level-up: unlock every reward for this skill whose levelReq is now
   * met and whose wealth/quest prerequisites pass. Returns newly unlocked rows.
   */
  async checkUnlocks(skillId: number, newLevel: number) {
    const wealthLevel = await this.financeLevel();
    const candidates = await this.prisma.reward.findMany({
      where: {
        skillId,
        unlocked: false,
        levelReq: { lte: newLevel },
      },
      orderBy: [{ levelReq: 'asc' }, { orderIndex: 'asc' }],
    });

    const newly: typeof candidates = [];
    for (const reward of candidates) {
      const missing = this.missingPrereqs(reward, {
        skillLevel: newLevel,
        wealthLevel,
      });
      // Level is already satisfied by the query; only wealth/quests block unlock.
      const nonLevelMissing = missing.filter((m) => !m.startsWith('Level'));
      if (nonLevelMissing.length > 0) {
        continue;
      }
      const updated = await this.prisma.reward.update({
        where: { id: reward.id },
        data: { unlocked: true },
      });
      newly.push(updated);
    }
    return newly;
  }

  async findGuide(skillId: number) {
    const skill = await this.requireSkill(skillId);
    const wealthLevel = await this.financeLevel();
    const rewards = await this.prisma.reward.findMany({
      where: { skillId },
      orderBy: [{ levelReq: 'asc' }, { orderIndex: 'asc' }],
    });

    const views = rewards.map((reward) =>
      this.toView(reward, {
        skillLevel: skill.level,
        wealthLevel,
      }),
    );

    const brackets = new Map<number, RewardView[]>();
    for (const view of views) {
      const list = brackets.get(view.levelReq) ?? [];
      list.push(view);
      brackets.set(view.levelReq, list);
    }

    return {
      skill: {
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        icon: skill.icon,
        category: skill.category,
        level: skill.level,
      },
      wealthLevel,
      brackets: [...brackets.entries()].map(([levelReq, items]) => ({
        levelReq,
        rewards: items,
      })),
      rewards: views,
    };
  }

  async claim(rewardId: number) {
    const reward = await this.prisma.reward.findUnique({
      where: { id: rewardId },
      include: { skill: true },
    });
    if (!reward) {
      throw new NotFoundException(`Reward #${rewardId} not found`);
    }

    const wealthLevel = await this.financeLevel();
    const view = this.toView(reward, {
      skillLevel: reward.skill.level,
      wealthLevel,
    });

    if (view.status === 'locked_level' || view.status === 'locked_requirements') {
      throw new BadRequestException(
        `Cannot claim "${reward.label}": ${view.missing.join(', ') || 'locked'}`,
      );
    }

    if (!reward.unlocked) {
      await this.prisma.reward.update({
        where: { id: rewardId },
        data: { unlocked: true },
      });
    }

    if (reward.claimedAt) {
      return this.prisma.reward.findUniqueOrThrow({ where: { id: rewardId } });
    }

    return this.prisma.reward.update({
      where: { id: rewardId },
      data: { claimedAt: new Date(), unlocked: true },
    });
  }

  private toView(
    reward: {
      id: number;
      skillId: number;
      levelReq: number;
      type: UnlockType;
      label: string;
      description: string;
      permissionKey: string | null;
      wealthLevelReq: number | null;
      questIds: string | null;
      orderIndex: number;
      icon: string;
      unlocked: boolean;
      claimedAt: Date | null;
    },
    ctx: { skillLevel: number; wealthLevel: number },
  ): RewardView {
    const missing = this.missingPrereqs(reward, ctx);
    let status: RewardStatus;
    if (reward.unlocked || (missing.length === 0 && ctx.skillLevel >= reward.levelReq)) {
      status = reward.claimedAt ? 'unlocked' : 'available';
    } else if (ctx.skillLevel < reward.levelReq) {
      status = 'locked_level';
    } else {
      status = 'locked_requirements';
    }

    return {
      id: reward.id,
      skillId: reward.skillId,
      levelReq: reward.levelReq,
      type: reward.type,
      label: reward.label,
      description: reward.description,
      permissionKey: reward.permissionKey,
      wealthLevelReq: reward.wealthLevelReq,
      questIds: reward.questIds,
      orderIndex: reward.orderIndex,
      icon: reward.icon,
      unlocked: reward.unlocked || status === 'available' || status === 'unlocked',
      claimedAt: reward.claimedAt,
      status,
      missing,
    };
  }

  private missingPrereqs(
    reward: {
      levelReq: number;
      wealthLevelReq: number | null;
      questIds: string | null;
    },
    ctx: { skillLevel: number; wealthLevel: number },
  ): string[] {
    const missing: string[] = [];
    if (ctx.skillLevel < reward.levelReq) {
      missing.push(`Level ${reward.levelReq}`);
    }
    if (
      reward.wealthLevelReq != null &&
      ctx.wealthLevel < reward.wealthLevelReq
    ) {
      missing.push(`Finance Lv ${reward.wealthLevelReq}`);
    }
    const questIds = this.parseQuestIds(reward.questIds);
    if (questIds.length > 0) {
      // Quests are not in the DB yet — treat any listed quest as unmet.
      missing.push(`Quest${questIds.length > 1 ? 's' : ''} ${questIds.join(', ')}`);
    }
    return missing;
  }

  private parseQuestIds(raw: string | null): number[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((n): n is number => typeof n === 'number');
    } catch {
      return [];
    }
  }

  private async financeLevel(): Promise<number> {
    const finance = await this.prisma.skill.findUnique({
      where: { slug: 'finance' },
      select: { level: true },
    });
    return finance?.level ?? 1;
  }

  private async requireSkill(skillId: number) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill #${skillId} not found`);
    }
    return skill;
  }
}
