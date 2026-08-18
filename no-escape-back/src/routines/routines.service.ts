import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterService,
  FEATURE_CONSUETUDO,
} from '../character/character.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  QUEST_ORDO_DIEI_SLUG,
  QuestsService,
} from '../quests/quests.service';
import { SkillsService } from '../skills/skills.service';
import { TimeService } from '../time/time.service';
import { calculateConsuetudoXp } from '../xp/consuetudo-xp.util';
import {
  parseSkillWeights,
  splitQuestXp,
  validateSkillWeights,
} from '../xp/quest-xp.util';

export type RoutineStepInput = {
  id?: number;
  title: string;
  icon?: string | null;
  durationMinutes: number;
};

export type RoutineWriteInput = {
  name: string;
  icon?: string | null;
  effortLevel?: number;
  skillWeights?: unknown;
  steps?: RoutineStepInput[];
};

export type RoutineStepLogInput = {
  stepId?: number | null;
  title: string;
  icon?: string | null;
  plannedSeconds: number;
  elapsedMs: number;
  outcome: 'COMPLETED' | 'SKIPPED';
};

@Injectable()
export class RoutinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characterService: CharacterService,
    private readonly quests: QuestsService,
    private readonly skills: SkillsService,
    private readonly time: TimeService,
  ) {}

  async access(devBypass = false) {
    const unlocked =
      devBypass ||
      (await this.characterService.isFeatureUnlocked(FEATURE_CONSUETUDO));
    const questActive = await this.quests.hasActiveRunBySlug(
      QUEST_ORDO_DIEI_SLUG,
    );
    const open = unlocked || questActive || devBypass;
    const count = await this.prisma.routine.count({ where: { active: true } });
    return {
      unlocked,
      questActive,
      open,
      canCreate: unlocked || count < 1,
      count,
    };
  }

  async assertOpen(devBypass = false) {
    const access = await this.access(devBypass);
    if (!access.open) {
      throw new BadRequestException(
        'Consuetudo is locked. Complete Ordo Diei first.',
      );
    }
    return access;
  }

  async list(devBypass = false) {
    await this.assertOpen(devBypass);
    const rows = await this.prisma.routine.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: this.routineInclude(),
    });
    return rows.map((row) => this.toView(row));
  }

  async getOne(id: number, devBypass = false) {
    await this.assertOpen(devBypass);
    const row = await this.prisma.routine.findFirst({
      where: { id, active: true },
      include: this.routineInclude(),
    });
    if (!row) {
      throw new NotFoundException(`Routine #${id} not found`);
    }
    return this.toView(row);
  }

  async create(input: RoutineWriteInput, devBypass = false) {
    const access = await this.assertOpen(devBypass);
    if (!access.canCreate) {
      throw new BadRequestException(
        'Ordo Diei allows one Consuetudo until the quest is complete.',
      );
    }
    const data = await this.normalizeWrite(input);
    const created = await this.prisma.routine.create({
      data: {
        name: data.name,
        icon: data.icon,
        effortLevel: data.effortLevel,
        skillWeightsJson: JSON.stringify(data.weights),
        steps: {
          create: data.steps.map((step, i) => ({
            title: step.title,
            icon: step.icon,
            durationMinutes: step.durationMinutes,
            sortOrder: i,
          })),
        },
      },
      include: this.routineInclude(),
    });
    await this.quests.advanceOrdoDiei('forge');
    return this.toView(created);
  }

  async update(id: number, input: RoutineWriteInput, devBypass = false) {
    await this.assertOpen(devBypass);
    const existing = await this.prisma.routine.findFirst({
      where: { id, active: true },
    });
    if (!existing) {
      throw new NotFoundException(`Routine #${id} not found`);
    }
    const data = await this.normalizeWrite(input);
    await this.prisma.$transaction(async (tx) => {
      await tx.routine.update({
        where: { id },
        data: {
          name: data.name,
          icon: data.icon,
          effortLevel: data.effortLevel,
          skillWeightsJson: JSON.stringify(data.weights),
        },
      });
      await tx.routineStep.deleteMany({ where: { routineId: id } });
      if (data.steps.length) {
        await tx.routineStep.createMany({
          data: data.steps.map((step, i) => ({
            routineId: id,
            title: step.title,
            icon: step.icon,
            durationMinutes: step.durationMinutes,
            sortOrder: i,
          })),
        });
      }
    });
    return this.getOne(id, devBypass);
  }

  async remove(id: number, devBypass = false) {
    await this.assertOpen(devBypass);
    const existing = await this.prisma.routine.findFirst({
      where: { id, active: true },
    });
    if (!existing) {
      throw new NotFoundException(`Routine #${id} not found`);
    }
    await this.prisma.routine.update({
      where: { id },
      data: { active: false },
    });
    return { ok: true };
  }

  async completeRun(
    id: number,
    input: { steps: RoutineStepLogInput[] },
    devBypass = false,
  ) {
    await this.assertOpen(devBypass);
    const routine = await this.prisma.routine.findFirst({
      where: { id, active: true },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!routine) {
      throw new NotFoundException(`Routine #${id} not found`);
    }
    const logs = this.normalizeLogs(input.steps);
    if (logs.length === 0) {
      throw new BadRequestException('Complete at least one step');
    }
    const skippedCount = logs.filter((s) => s.outcome === 'SKIPPED').length;
    const completedCount = logs.filter((s) => s.outcome === 'COMPLETED').length;
    const plannedSeconds = logs.reduce((sum, s) => sum + s.plannedSeconds, 0);
    const elapsedMs = logs.reduce((sum, s) => sum + s.elapsedMs, 0);
    const completedPlannedMinutes = logs
      .filter((s) => s.outcome === 'COMPLETED')
      .reduce((sum, s) => sum + Math.round(s.plannedSeconds / 60), 0);

    const weights = parseSkillWeights(
      this.parseJson(routine.skillWeightsJson),
    );
    const { baseXp, bonusXp, totalXp } = calculateConsuetudoXp({
      effortLevel: routine.effortLevel,
      completedPlannedMinutes,
      skippedCount,
      totalSteps: logs.length,
    });
    const shares = splitQuestXp(totalXp, weights);
    const catalog = await this.prisma.skill.findMany({
      select: { id: true, slug: true, name: true, icon: true, level: true },
    });
    const bySlug = new Map(catalog.map((s) => [s.slug, s]));
    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];
    try {
      for (const share of shares) {
        if (share.xp <= 0) {
          continue;
        }
        const skill = bySlug.get(share.slug);
        if (!skill) {
          throw new BadRequestException(`Unknown skill '${share.slug}'`);
        }
        awards.push(
          await this.skills.awardXp(skill.id, {
            xpGained: share.xp,
            duration: completedPlannedMinutes,
            note: `Consuetudo: ${routine.name}`,
          }),
        );
      }
    } catch (err) {
      for (const awarded of [...awards].reverse()) {
        await this.skills.reverseXp(
          awarded.skill.id,
          awarded.activity.xpGained,
          awarded.activity.id,
        );
      }
      throw err;
    }

    const activityIds = awards.map((a) => a.activity.id);
    const run = await this.prisma.routineRun.create({
      data: {
        routineId: id,
        date: this.time.today(),
        startedAt: new Date(Date.now() - elapsedMs),
        completedAt: new Date(),
        skippedCount,
        completedCount,
        plannedSeconds,
        elapsedMs: BigInt(elapsedMs),
        baseXp,
        bonusXp,
        xpAwarded: totalXp,
        activityIdsJson: activityIds.length
          ? JSON.stringify(activityIds)
          : null,
        steps: {
          create: logs.map((step, i) => ({
            stepId: this.resolveStepId(routine.steps, step.stepId),
            title: step.title,
            icon: step.icon,
            plannedSeconds: step.plannedSeconds,
            elapsedMs: BigInt(step.elapsedMs),
            outcome: step.outcome,
            deltaMs: step.elapsedMs - step.plannedSeconds * 1000,
            sortOrder: i,
          })),
        },
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.quests.advanceOrdoDiei('walk');

    return {
      run: this.toRunView(run),
      awards,
      baseXp,
      bonusXp,
      xpAwarded: totalXp,
    };
  }

  private resolveStepId(
    steps: Array<{ id: number }>,
    stepId?: number | null,
  ): number | null {
    if (!stepId) {
      return null;
    }
    return steps.some((s) => s.id === stepId) ? stepId : null;
  }

  private normalizeLogs(raw: RoutineStepLogInput[] | undefined) {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.map((row) => {
      const title = String(row?.title || '').trim();
      if (!title) {
        throw new BadRequestException('Each step needs a title');
      }
      const outcome =
        row?.outcome === 'SKIPPED' ? ('SKIPPED' as const) : ('COMPLETED' as const);
      const plannedSeconds = Math.max(
        0,
        Math.round(Number(row?.plannedSeconds) || 0),
      );
      const elapsedMs = Math.max(0, Math.round(Number(row?.elapsedMs) || 0));
      return {
        stepId: row?.stepId ?? null,
        title,
        icon: row?.icon?.trim() || null,
        plannedSeconds,
        elapsedMs,
        outcome,
      };
    });
  }

  private async normalizeWrite(input: RoutineWriteInput) {
    const name = String(input?.name || '').trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const effortLevel = Math.round(Number(input?.effortLevel) || 5);
    if (!Number.isInteger(effortLevel) || effortLevel < 1 || effortLevel > 10) {
      throw new BadRequestException('effortLevel must be an integer from 1 to 10');
    }
    const { weights, error } = validateSkillWeights(input.skillWeights);
    if (error) {
      throw new BadRequestException(error);
    }
    const catalog = await this.prisma.skill.findMany({ select: { slug: true } });
    const slugs = new Set(catalog.map((s) => s.slug));
    for (const weight of weights) {
      if (!slugs.has(weight.slug)) {
        throw new BadRequestException(`Unknown skill '${weight.slug}'`);
      }
    }
    const steps = (input.steps ?? []).map((step, i) => {
      const title = String(step?.title || '').trim();
      if (!title) {
        throw new BadRequestException(`Step ${i + 1} needs a title`);
      }
      const durationMinutes = Math.round(Number(step?.durationMinutes) || 0);
      if (durationMinutes < 1 || durationMinutes > 24 * 60) {
        throw new BadRequestException(
          `Step "${title}" duration must be between 1 and 1440 minutes`,
        );
      }
      return {
        title,
        icon: step?.icon?.trim() || null,
        durationMinutes,
      };
    });
    if (steps.length === 0) {
      throw new BadRequestException('Add at least one step');
    }
    return {
      name: name.slice(0, 80),
      icon: input.icon?.trim() || '🌅',
      effortLevel,
      weights,
      steps,
    };
  }

  private routineInclude() {
    return {
      steps: { orderBy: { sortOrder: 'asc' as const } },
      runs: {
        orderBy: { completedAt: 'desc' as const },
        take: 8,
        include: { steps: { orderBy: { sortOrder: 'asc' as const } } },
      },
    };
  }

  private toView(row: {
    id: number;
    name: string;
    icon: string | null;
    effortLevel: number;
    skillWeightsJson: string | null;
    sortOrder: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    steps: Array<{
      id: number;
      title: string;
      icon: string | null;
      durationMinutes: number;
      sortOrder: number;
    }>;
    runs: Array<{
      id: number;
      date: string;
      startedAt: Date;
      completedAt: Date | null;
      skippedCount: number;
      completedCount: number;
      plannedSeconds: number;
      elapsedMs: bigint;
      baseXp: number;
      bonusXp: number;
      xpAwarded: number;
      steps: Array<{
        id: number;
        stepId: number | null;
        title: string;
        icon: string | null;
        plannedSeconds: number;
        elapsedMs: bigint;
        outcome: string;
        deltaMs: number;
        sortOrder: number;
      }>;
    }>;
  }) {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      effortLevel: row.effortLevel,
      skillWeights: parseSkillWeights(this.parseJson(row.skillWeightsJson)),
      sortOrder: row.sortOrder,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      steps: row.steps.map((s) => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        durationMinutes: s.durationMinutes,
        sortOrder: s.sortOrder,
      })),
      runs: row.runs.map((run) => this.toRunView(run)),
    };
  }

  private toRunView(run: {
    id: number;
    date: string;
    startedAt: Date;
    completedAt: Date | null;
    skippedCount: number;
    completedCount: number;
    plannedSeconds: number;
    elapsedMs: bigint;
    baseXp: number;
    bonusXp: number;
    xpAwarded: number;
    steps: Array<{
      id: number;
      stepId?: number | null;
      title: string;
      icon: string | null;
      plannedSeconds: number;
      elapsedMs: bigint;
      outcome: string;
      deltaMs: number;
      sortOrder: number;
    }>;
  }) {
    return {
      id: run.id,
      date: run.date,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      skippedCount: run.skippedCount,
      completedCount: run.completedCount,
      plannedSeconds: run.plannedSeconds,
      elapsedMs: Number(run.elapsedMs),
      baseXp: run.baseXp,
      bonusXp: run.bonusXp,
      xpAwarded: run.xpAwarded,
      steps: run.steps.map((s) => ({
        id: s.id,
        stepId: s.stepId ?? null,
        title: s.title,
        icon: s.icon,
        plannedSeconds: s.plannedSeconds,
        elapsedMs: Number(s.elapsedMs),
        outcome: s.outcome,
        deltaMs: s.deltaMs,
        sortOrder: s.sortOrder,
      })),
    };
  }

  private parseJson(raw: string | null): unknown {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
