import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import {
  calculateHorologiumBlockXp,
  calculateHorologiumGoalBonus,
  FOCUS_SKILL_SLUG,
  HorologiumMode,
} from '../xp/horologium-xp.util';
import { AwardHorologiumBlockDto } from './dto/award-block.dto';
import { CompleteHorologiumSessionDto } from './dto/complete-session.dto';

@Injectable()
export class HorologiumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
  ) {}

  preview(
    workMinutes: number,
    restMinutes: number,
    iterations: number,
    mode: HorologiumMode,
  ) {
    const work = Number(workMinutes);
    const rest = Number(restMinutes);
    const iters = Number(iterations);
    if (!Number.isFinite(work) || work < 1) {
      throw new BadRequestException('workMinutes must be >= 1');
    }
    if (!Number.isFinite(rest) || rest < 1) {
      throw new BadRequestException('restMinutes must be >= 1');
    }

    if (mode === 'adhoc') {
      const block = calculateHorologiumBlockXp({
        workMinutes: work,
        restMinutes: rest,
        mode: 'adhoc',
      });
      return {
        mode: 'adhoc' as const,
        blockXp: block.xp,
        goalBonusXp: 0,
        totalIfCompleted: block.xp,
        restMult: block.restMult,
        workLengthMult: block.workLengthMult,
        modeMult: block.modeMult,
        totalWorkMinutes: Math.round(work),
        skillSlug: FOCUS_SKILL_SLUG,
      };
    }

    if (!Number.isFinite(iters) || iters < 2) {
      throw new BadRequestException('Sessio requires at least 2 iterations');
    }
    const goal = calculateHorologiumGoalBonus({
      workMinutes: work,
      restMinutes: rest,
      iterations: iters,
    });
    return {
      mode: 'planned' as const,
      ...goal,
      skillSlug: FOCUS_SKILL_SLUG,
    };
  }

  async listSessions(limit = 40, offset = 0) {
    const take = Math.min(100, Math.max(1, Math.round(limit) || 40));
    const skip = Math.max(0, Math.round(offset) || 0);
    const [items, total] = await Promise.all([
      this.prisma.horologiumSession.findMany({
        orderBy: { completedAt: 'desc' },
        take,
        skip,
        include: {
          skill: {
            select: {
              id: true,
              name: true,
              slug: true,
              icon: true,
              level: true,
            },
          },
        },
      }),
      this.prisma.horologiumSession.count(),
    ]);
    return { items, total, limit: take, offset: skip };
  }

  /** XP for one finished work block (track or planned). */
  async awardBlock(dto: AwardHorologiumBlockDto) {
    const workMinutes = Math.round(Number(dto.workMinutes));
    const restMinutes = Math.round(Number(dto.restMinutes));
    const mode = dto.mode === 'planned' ? 'planned' : 'adhoc';

    this.assertDurations(workMinutes, restMinutes);

    const focus = await this.requireFocus();
    const calc = calculateHorologiumBlockXp({
      workMinutes,
      restMinutes,
      mode,
    });
    const note =
      mode === 'adhoc'
        ? `Horologium track: ${workMinutes}m / ${restMinutes}m`
        : `Horologium block: ${workMinutes}m / ${restMinutes}m` +
          (dto.presetId ? ` (${dto.presetId})` : '');

    const award = await this.skillsService.awardXp(focus.id, {
      xpGained: calc.xp,
      duration: workMinutes,
      note,
    });

    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations: 1,
        durationMinutes: workMinutes,
        presetId: dto.presetId?.trim() || null,
        skillId: focus.id,
        xpAwarded: calc.xp,
        activityId: award.activity.id,
        note,
      },
      include: {
        skill: {
          select: { id: true, name: true, slug: true, icon: true, level: true },
        },
      },
    });

    return { session, award, breakdown: calc, kind: 'block' as const };
  }

  /**
   * Extra XP only when a planned sessio finishes every iteration.
   * Partial goals never call this — they keep only their block awards.
   */
  async awardGoalBonus(dto: CompleteHorologiumSessionDto) {
    const workMinutes = Math.round(Number(dto.workMinutes));
    const restMinutes = Math.round(Number(dto.restMinutes));
    const iterations = Math.round(Number(dto.iterations));

    this.assertDurations(workMinutes, restMinutes);
    if (!Number.isFinite(iterations) || iterations < 2 || iterations > 20) {
      throw new BadRequestException('Sessio requires between 2 and 20 iterations');
    }

    const focus = await this.requireFocus();
    const calc = calculateHorologiumGoalBonus({
      workMinutes,
      restMinutes,
      iterations,
    });
    const note =
      `Horologium goal: ${iterations}×${workMinutes}m` +
      (dto.presetId ? ` (${dto.presetId})` : '');

    if (calc.goalBonusXp <= 0) {
      const session = await this.prisma.horologiumSession.create({
        data: {
          date: this.localToday(),
          workMinutes,
          restMinutes,
          iterations,
          durationMinutes: calc.totalWorkMinutes,
          presetId: dto.presetId?.trim() || null,
          skillId: focus.id,
          xpAwarded: 0,
          activityId: null,
          note: `${note} (no goal bonus — work under 15m)`,
        },
        include: {
          skill: {
            select: {
              id: true,
              name: true,
              slug: true,
              icon: true,
              level: true,
            },
          },
        },
      });
      return { session, award: null, breakdown: calc, kind: 'goal' as const };
    }

    const award = await this.skillsService.awardXp(focus.id, {
      xpGained: calc.goalBonusXp,
      duration: calc.totalWorkMinutes,
      note,
    });

    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations,
        durationMinutes: calc.totalWorkMinutes,
        presetId: dto.presetId?.trim() || null,
        skillId: focus.id,
        xpAwarded: calc.goalBonusXp,
        activityId: award.activity.id,
        note,
      },
      include: {
        skill: {
          select: { id: true, name: true, slug: true, icon: true, level: true },
        },
      },
    });

    return { session, award, breakdown: calc, kind: 'goal' as const };
  }

  private assertDurations(workMinutes: number, restMinutes: number) {
    if (!Number.isFinite(workMinutes) || workMinutes < 1 || workMinutes > 180) {
      throw new BadRequestException('workMinutes must be between 1 and 180');
    }
    if (!Number.isFinite(restMinutes) || restMinutes < 1 || restMinutes > 60) {
      throw new BadRequestException('restMinutes must be between 1 and 60');
    }
  }

  private async requireFocus() {
    const focus = await this.prisma.skill.findUnique({
      where: { slug: FOCUS_SKILL_SLUG },
    });
    if (!focus) {
      throw new NotFoundException('Focus skill not found — run prisma seed');
    }
    return focus;
  }

  private localToday(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
