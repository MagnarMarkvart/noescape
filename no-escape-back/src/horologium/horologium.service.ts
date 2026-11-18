import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuestsService } from '../quests/quests.service';
import { SkillsService } from '../skills/skills.service';
import { TimeService } from '../time/time.service';
import {
  calculateAbandonPenalty,
  calculateHorologiumBlockXp,
  calculateHorologiumGoalBonus,
  DISCIPLINE_SKILL_SLUG,
  FOCUS_SKILL_SLUG,
  HOROLOGIUM_ABANDON_PENALTY_RATE,
  HorologiumMode,
} from '../xp/horologium-xp.util';
import {
  questDailySpecialPool,
  splitQuestXp,
  splitXpAcrossLaps,
} from '../xp/quest-xp.util';
import { AbandonHorologiumSessionDto } from './dto/abandon-session.dto';
import { AwardHorologiumBlockDto } from './dto/award-block.dto';
import { CompleteHorologiumSessionDto } from './dto/complete-session.dto';
import {
  CloseEarlyHorologiumDto,
  CompleteHorologiumTaskDto,
} from './dto/complete-task.dto';

const SKILL_SELECT = {
  id: true,
  name: true,
  slug: true,
  icon: true,
  level: true,
} as const;

type Award = Awaited<ReturnType<SkillsService['awardXp']>>;

type SkillXpRow = {
  slug: string;
  name: string;
  icon: string | null;
  xp: number;
};

type SessionStampDto = {
  startedAt?: string;
  watchName?: string;
};

@Injectable()
export class HorologiumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
    private readonly questsService: QuestsService,
    private readonly time: TimeService,
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
        disciplineXp: 0,
        focusIfCompleted: block.xp,
        disciplineIfCompleted: 0,
        totalIfCompleted: block.xp,
        abandonPenaltyPerSplit: 0,
        restMult: block.restMult,
        workLengthMult: block.workLengthMult,
        modeMult: block.modeMult,
        totalWorkMinutes: Math.round(work),
        skillSlug: FOCUS_SKILL_SLUG,
        disciplineSkillSlug: DISCIPLINE_SKILL_SLUG,
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
    const focusIfCompleted = goal.blockXp * iters;
    return {
      mode: 'planned' as const,
      ...goal,
      disciplineXp: goal.goalBonusXp,
      focusIfCompleted,
      disciplineIfCompleted: goal.goalBonusXp,
      totalIfCompleted: focusIfCompleted + goal.goalBonusXp,
      abandonPenaltyPerSplit: calculateAbandonPenalty(goal.blockXp, 1),
      skillSlug: FOCUS_SKILL_SLUG,
      disciplineSkillSlug: DISCIPLINE_SKILL_SLUG,
    };
  }

  async listSessions(limit = 40, offset = 0, date?: string) {
    const take = Math.min(100, Math.max(1, Math.round(limit) || 40));
    const skip = Math.max(0, Math.round(offset) || 0);
    const day = date?.trim();
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const where = day ? { date: day } : {};
    const walkWhere = {
      ...where,
      completedAt: { not: null },
    };
    const fetch = Math.min(100, take + skip);
    const [sessions, walks, sessionCount, walkCount] = await Promise.all([
      this.prisma.horologiumSession.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        take: fetch,
        include: { skill: { select: SKILL_SELECT } },
      }),
      this.prisma.routineRun.findMany({
        where: walkWhere,
        orderBy: { completedAt: 'desc' },
        take: fetch,
        include: { routine: { select: { name: true, icon: true } } },
      }),
      this.prisma.horologiumSession.count({ where }),
      this.prisma.routineRun.count({ where: walkWhere }),
    ]);
    const items = [
      ...sessions.map((row) => this.presentSession(row)),
      ...walks.map((row) => this.presentConsuetudo(row)),
    ].sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
    return {
      items: items.slice(skip, skip + take),
      total: sessionCount + walkCount,
      limit: take,
      offset: skip,
    };
  }

  async sessionCalendar(from: string, to: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    const range = { date: { gte: from, lte: to } };
    const [sessions, walks] = await Promise.all([
      this.prisma.horologiumSession.groupBy({
        by: ['date'],
        where: range,
        _count: { _all: true },
      }),
      this.prisma.routineRun.groupBy({
        by: ['date'],
        where: { ...range, completedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map<string, number>();
    for (const row of sessions) {
      counts.set(row.date, (counts.get(row.date) ?? 0) + row._count._all);
    }
    for (const row of walks) {
      counts.set(row.date, (counts.get(row.date) ?? 0) + row._count._all);
    }
    return [...counts.entries()].map(([date, count]) => ({ date, count }));
  }

  /** Focus XP for one finished work block (track or planned). */
  async awardBlock(dto: AwardHorologiumBlockDto) {
    const workMinutes = Math.round(Number(dto.workMinutes));
    const restMinutes = Math.round(Number(dto.restMinutes));
    const mode = dto.mode === 'planned' ? 'planned' : 'adhoc';

    this.assertDurations(workMinutes, restMinutes);

    const focus = await this.requireSkill(FOCUS_SKILL_SLUG);
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

    const awards: Award[] = [];
    const focusAward = await this.skillsService.awardXp(focus.id, {
      xpGained: calc.xp,
      duration: workMinutes,
      note: `${note} · Focus`,
    });
    awards.push(focusAward);

    const special =
      dto.specialDrops === false
        ? { awards: [] as Award[], total: 0, noteSuffix: '', taskLabel: null as string | null }
        : await this.awardSpecialLap({
            questRunId: dto.questRunId,
            questSubtaskId: dto.questSubtaskId,
            lapIndex: dto.lapIndex,
            laps: dto.laps,
            duration: workMinutes,
            label: note,
          });
    awards.push(...special.awards);

    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations: Math.max(1, Math.round(Number(dto.laps) || 1)),
        durationMinutes: workMinutes,
        presetId: dto.presetId?.trim() || null,
        skillId: focus.id,
        xpAwarded: calc.xp + special.total,
        activityId: focusAward.activity.id,
        note:
          special.total > 0
            ? `${note} · Focus +${calc.xp}` + special.noteSuffix
            : `${note} · Focus +${calc.xp}`,
        outcome: 'block',
        focusXpAwarded: calc.xp,
        disciplineXpAwarded: 0,
        questRunId: dto.questRunId ? Math.round(Number(dto.questRunId)) : null,
        taskLabel: special.taskLabel,
        skillXpJson: this.skillXpJsonFromAwards(awards),
        ...this.sessionStamp(dto),
      },
      include: { skill: { select: SKILL_SELECT } },
    });

    return {
      session,
      award: focusAward,
      awards,
      breakdown: calc,
      kind: 'block' as const,
    };
  }

  /**
   * Discipline XP when a planned sessio finishes every iteration.
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

    const discipline = await this.requireSkill(DISCIPLINE_SKILL_SLUG);
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
          skillId: discipline.id,
          xpAwarded: 0,
          activityId: null,
          note: `${note} (no Discipline bonus — work under 15m)`,
          outcome: 'goal',
          focusXpAwarded: 0,
          disciplineXpAwarded: 0,
          ...this.sessionStamp(dto),
        },
        include: { skill: { select: SKILL_SELECT } },
      });
      return { session, award: null, awards: [], breakdown: calc, kind: 'goal' as const };
    }

    const award = await this.skillsService.awardXp(discipline.id, {
      xpGained: calc.goalBonusXp,
      duration: calc.totalWorkMinutes,
      note: `${note} · Discipline`,
    });

    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations,
        durationMinutes: calc.totalWorkMinutes,
        presetId: dto.presetId?.trim() || null,
        skillId: discipline.id,
        xpAwarded: calc.goalBonusXp,
        activityId: award.activity.id,
        note: `${note} · Discipline +${calc.goalBonusXp}`,
        outcome: 'goal',
        focusXpAwarded: 0,
        disciplineXpAwarded: calc.goalBonusXp,
        skillXpJson: this.skillXpJsonFromAwards([award]),
        ...this.sessionStamp(dto),
      },
      include: { skill: { select: SKILL_SELECT } },
    });

    return { session, award, awards: [award], breakdown: calc, kind: 'goal' as const };
  }

  /**
   * Planned Sessio stopped before every split finished.
   * Removes 30% of each unfinished split's block XP from Focus.
   */
  async abandonSession(dto: AbandonHorologiumSessionDto) {
    const workMinutes = Math.round(Number(dto.workMinutes));
    const restMinutes = Math.round(Number(dto.restMinutes));
    const iterations = Math.round(Number(dto.iterations));
    const completedBlocks = Math.round(Number(dto.completedBlocks));

    this.assertDurations(workMinutes, restMinutes);
    if (!Number.isFinite(iterations) || iterations < 2 || iterations > 20) {
      throw new BadRequestException('Sessio requires between 2 and 20 iterations');
    }
    if (
      !Number.isFinite(completedBlocks) ||
      completedBlocks < 0 ||
      completedBlocks > iterations
    ) {
      throw new BadRequestException(
        'completedBlocks must be between 0 and iterations',
      );
    }

    const unfinished = iterations - completedBlocks;
    const block = calculateHorologiumBlockXp({ workMinutes, restMinutes });
    const xpRemoved = calculateAbandonPenalty(block.xp, unfinished);

    const focus = await this.requireSkill(FOCUS_SKILL_SLUG);
    const note =
      `Horologium abandon: ${completedBlocks}/${iterations} splits` +
      (dto.presetId ? ` (${dto.presetId})` : '') +
      (xpRemoved > 0
        ? ` (−${xpRemoved} Focus XP, ${Math.round(HOROLOGIUM_ABANDON_PENALTY_RATE * 100)}%/unfinished)`
        : '');

    let reversal: Awaited<ReturnType<SkillsService['reverseXp']>> | null = null;
    if (xpRemoved > 0) {
      reversal = await this.skillsService.reverseXp(focus.id, xpRemoved);
      await this.prisma.activity.create({
        data: {
          skillId: focus.id,
          xpGained: -xpRemoved,
          duration: workMinutes * completedBlocks,
          note,
        },
      });
    }

    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations,
        durationMinutes: workMinutes * completedBlocks,
        presetId: dto.presetId?.trim() || null,
        skillId: focus.id,
        xpAwarded: -xpRemoved,
        activityId: null,
        note,
        outcome: 'abandon',
        focusXpAwarded: -xpRemoved,
        disciplineXpAwarded: 0,
        skillXpJson:
          xpRemoved !== 0
            ? JSON.stringify([
                {
                  slug: focus.slug,
                  name: focus.name,
                  icon: focus.icon,
                  xp: -xpRemoved,
                },
              ])
            : null,
        ...this.sessionStamp(dto),
      },
      include: { skill: { select: SKILL_SELECT } },
    });

    return {
      session,
      reversal,
      xpRemoved,
      unfinishedSplits: unfinished,
      blockXp: block.xp,
      kind: 'abandon' as const,
    };
  }

  /**
   * Mark the bound quest check-in or subtask done.
   * Special-skill drips come from the quest pool; session Focus already
   * logged per block is kept. Ending early is not an abandon.
   */
  async completeBoundTask(dto: CompleteHorologiumTaskDto) {
    const workMinutes = Math.round(Number(dto.workMinutes));
    const restMinutes = Math.round(Number(dto.restMinutes));
    const iterations = Math.round(Number(dto.iterations));
    const completedBlocks = Math.max(0, Math.round(Number(dto.completedBlocks)));
    const elapsedMinutes = Math.max(0, Math.round(Number(dto.elapsedMinutes) || 0));
    const questRunId = Math.round(Number(dto.questRunId) || 0);
    const questSubtaskId = Math.round(Number(dto.questSubtaskId) || 0) || undefined;
    const mode: HorologiumMode = dto.mode === 'adhoc' ? 'adhoc' : 'planned';
    const billedLaps = mode === 'adhoc' ? 1 : iterations;

    this.assertDurations(workMinutes, restMinutes);
    if (mode === 'planned' && (billedLaps < 2 || billedLaps > 20)) {
      throw new BadRequestException('Sessio requires between 2 and 20 iterations');
    }
    if (completedBlocks > billedLaps && mode === 'planned') {
      throw new BadRequestException('completedBlocks exceeds iterations');
    }
    if (!questRunId) {
      throw new BadRequestException('questRunId is required');
    }

    let label: string;
    let quest: Awaited<ReturnType<QuestsService['getOne']>>;
    const awards: Award[] = [];

    if (questSubtaskId) {
      quest = await this.questsService.toggleSubtask(
        questRunId,
        questSubtaskId,
        true,
      );
      const sub = quest.subtasks.find((s) => s.id === questSubtaskId);
      label = sub?.title || quest.name;
    } else {
      const daily = await this.questsService.completeAvailableDaily(questRunId);
      quest = daily.quest;
      label = daily.label;
      awards.push(...daily.awards);
    }

    const specialLapsAwarded = Math.max(
      0,
      Math.round(Number(dto.specialLapsAwarded) || 0),
    );
    const remainingLaps = Math.max(0, billedLaps - specialLapsAwarded);
    const special = await this.awardRemainingSpecials({
      questRunId,
      questSubtaskId,
      billedLaps,
      fromLap: specialLapsAwarded,
      remainingLaps,
      duration: workMinutes,
      label,
    });
    awards.push(...special.awards);

    const totalXp = awards.reduce((n, a) => n + a.activity.xpGained, 0);
    const elapsedLabel =
      elapsedMinutes < 1 ? 'under 1m' : `${elapsedMinutes}m`;
    const plannedWork = workMinutes * billedLaps;
    const early = Boolean(dto.endSession);
    const note = early
      ? `Ended early — ${label} done in ${elapsedLabel} (planned ${plannedWork}m work)`
      : `Quest task · ${label} · done, sessio continues`;

    const focus = await this.requireSkill(FOCUS_SKILL_SLUG);
    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations: billedLaps,
        durationMinutes: early
          ? Math.max(elapsedMinutes, workMinutes * completedBlocks)
          : plannedWork,
        presetId: dto.presetId?.trim() || null,
        skillId: focus.id,
        xpAwarded: totalXp,
        activityId: awards[0]?.activity.id ?? null,
        note,
        outcome: early ? 'task_early' : 'task',
        endedEarly: early,
        elapsedMinutes,
        questRunId,
        taskLabel: label,
        focusXpAwarded: 0,
        disciplineXpAwarded: 0,
        skillXpJson: this.skillXpJsonFromAwards(awards),
        ...this.sessionStamp(dto),
      },
      include: { skill: { select: SKILL_SELECT } },
    });

    return {
      session,
      awards,
      kind: early ? ('task_early' as const) : ('task' as const),
      endedEarly: early,
      elapsedMinutes,
      taskLabel: label,
      focusXp: 0,
      disciplineXp: 0,
      specialXp: special.total,
      quest,
    };
  }

  /** Stop after a settled task — log only, no abandon penalty. */
  async closeEarly(dto: CloseEarlyHorologiumDto) {
    const workMinutes = Math.round(Number(dto.workMinutes));
    const restMinutes = Math.round(Number(dto.restMinutes));
    const iterations = Math.max(1, Math.round(Number(dto.iterations) || 1));
    const completedBlocks = Math.max(0, Math.round(Number(dto.completedBlocks) || 0));
    const elapsedMinutes = Math.max(0, Math.round(Number(dto.elapsedMinutes) || 0));
    this.assertDurations(workMinutes, restMinutes);

    const label = dto.taskLabel?.trim() || 'task';
    const elapsedLabel =
      elapsedMinutes < 1 ? 'under 1m' : `${elapsedMinutes}m`;
    const note = `Ended after task — ${label} was already done (${elapsedLabel} elapsed, ${completedBlocks}/${iterations} splits)`;

    const session = await this.prisma.horologiumSession.create({
      data: {
        date: this.localToday(),
        workMinutes,
        restMinutes,
        iterations,
        durationMinutes: Math.max(elapsedMinutes, workMinutes * completedBlocks),
        presetId: dto.presetId?.trim() || null,
        skillId: null,
        xpAwarded: 0,
        activityId: null,
        note,
        outcome: 'task_early',
        endedEarly: true,
        elapsedMinutes,
        questRunId: dto.questRunId
          ? Math.round(Number(dto.questRunId))
          : null,
        taskLabel: dto.taskLabel?.trim() || null,
        focusXpAwarded: 0,
        disciplineXpAwarded: 0,
        ...this.sessionStamp(dto),
      },
      include: { skill: { select: SKILL_SELECT } },
    });

    return { session, kind: 'task_early' as const, endedEarly: true };
  }

  private async awardSpecialLap(input: {
    questRunId?: number;
    questSubtaskId?: number;
    lapIndex?: number;
    laps?: number;
    duration: number;
    label: string;
  }): Promise<{
    awards: Award[];
    total: number;
    noteSuffix: string;
    taskLabel: string | null;
  }> {
    const empty = {
      awards: [] as Award[],
      total: 0,
      noteSuffix: '',
      taskLabel: null as string | null,
    };
    const runId = Math.round(Number(input.questRunId) || 0);
    if (!runId) {
      return empty;
    }
    const ctx = await this.specialContext(runId, input.questSubtaskId);
    if (!ctx) {
      return empty;
    }
    const laps = Math.max(1, Math.round(Number(input.laps) || 1));
    const lapIndex = Math.max(1, Math.round(Number(input.lapIndex) || 1));
    if (lapIndex > laps) {
      return empty;
    }
    const drops = splitXpAcrossLaps(ctx.shares, laps)[lapIndex - 1] ?? {};
    const awards: Award[] = [];
    let total = 0;
    const bits: string[] = [];
    for (const [slug, xp] of Object.entries(drops)) {
      const a = await this.awardBySlug(
        slug,
        xp,
        input.duration,
        `${input.label} · ${ctx.label} lap ${lapIndex}/${laps} · ${slug}`,
      );
      if (a) {
        awards.push(a);
        total += xp;
        bits.push(`${slug} +${xp}`);
      }
    }
    return {
      awards,
      total,
      noteSuffix: bits.length ? ` · ${bits.join(', ')}` : '',
      taskLabel: ctx.label,
    };
  }

  private async awardRemainingSpecials(input: {
    questRunId: number;
    questSubtaskId?: number;
    billedLaps: number;
    fromLap: number;
    remainingLaps: number;
    duration: number;
    label: string;
  }): Promise<{ awards: Award[]; total: number; noteSuffix: string }> {
    const empty = { awards: [] as Award[], total: 0, noteSuffix: '' };
    if (input.remainingLaps <= 0) {
      return empty;
    }
    const ctx = await this.specialContext(input.questRunId, input.questSubtaskId);
    if (!ctx) {
      return empty;
    }
    const perLap = splitXpAcrossLaps(ctx.shares, input.billedLaps);
    const merged: Record<string, number> = {};
    for (let i = input.fromLap; i < input.billedLaps; i++) {
      for (const [slug, xp] of Object.entries(perLap[i] ?? {})) {
        merged[slug] = (merged[slug] ?? 0) + xp;
      }
    }
    const awards: Award[] = [];
    let total = 0;
    const bits: string[] = [];
    for (const [slug, xp] of Object.entries(merged)) {
      const a = await this.awardBySlug(
        slug,
        xp,
        input.duration,
        `Quest daily · ${input.label} · remaining ${slug}`,
      );
      if (a) {
        awards.push(a);
        total += xp;
        bits.push(`${slug} +${xp}`);
      }
    }
    return {
      awards,
      total,
      noteSuffix: bits.length ? ` · ${bits.join(', ')}` : '',
    };
  }

  private async specialContext(
    runId: number,
    subtaskId?: number,
  ): Promise<{
    label: string;
    shares: ReturnType<typeof splitQuestXp>;
  } | null> {
    const run = await this.prisma.questRun.findUnique({
      where: { id: runId },
      include: {
        quest: { include: { subtasks: true } },
      },
    });
    if (!run || run.status !== 'ACTIVE' || run.quest.kind === 'STREAK_LOG') {
      return null;
    }
    const weights = this.parseWeights(run.quest.skillWeightsJson);
    let pool = questDailySpecialPool(
      run.quest.totalXp ?? 0,
      run.quest.durationDays,
    );
    if (subtaskId) {
      const n = Math.max(1, run.quest.subtasks.length);
      pool = Math.max(1, Math.round(pool / n));
    }
    if (pool <= 0 || weights.length === 0) {
      return null;
    }
    const sub = subtaskId
      ? run.quest.subtasks.find((s) => s.id === subtaskId)
      : null;
    return {
      label:
        sub?.title ||
        run.quest.journeyLabel?.trim() ||
        run.quest.name,
      shares: splitQuestXp(pool, weights),
    };
  }

  private parseWeights(raw: string | null) {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as Array<{ slug?: string; weight?: number }>;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((w) => ({
          slug: String(w.slug || '').trim(),
          weight: Math.round(Number(w.weight) || 0),
        }))
        .filter((w) => w.slug && w.weight > 0);
    } catch {
      return [];
    }
  }

  private async awardBySlug(
    slug: string,
    xp: number,
    duration: number,
    note: string,
  ): Promise<Award | null> {
    if (xp <= 0) {
      return null;
    }
    const skill = await this.prisma.skill.findUnique({ where: { slug } });
    if (!skill) {
      return null;
    }
    return this.skillsService.awardXp(skill.id, {
      xpGained: xp,
      duration,
      note,
    });
  }

  private assertDurations(workMinutes: number, restMinutes: number) {
    if (!Number.isFinite(workMinutes) || workMinutes < 1 || workMinutes > 180) {
      throw new BadRequestException('workMinutes must be between 1 and 180');
    }
    if (!Number.isFinite(restMinutes) || restMinutes < 1 || restMinutes > 60) {
      throw new BadRequestException('restMinutes must be between 1 and 60');
    }
  }

  private async requireSkill(slug: string) {
    const skill = await this.prisma.skill.findUnique({ where: { slug } });
    if (!skill) {
      throw new NotFoundException(
        `${slug} skill not found — run prisma seed`,
      );
    }
    return skill;
  }

  private localToday(): string {
    return this.time.today();
  }

  private sessionStamp(dto: SessionStampDto): {
    startedAt: Date | null;
    watchName: string | null;
  } {
    return {
      startedAt: this.parseStartedAt(dto.startedAt),
      watchName: dto.watchName?.trim().slice(0, 80) || null,
    };
  }

  private parseStartedAt(raw?: string): Date | null {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private skillXpJsonFromAwards(awards: Award[]): string | null {
    const rows = this.collectSkillXp(awards);
    return rows.length ? JSON.stringify(rows) : null;
  }

  private collectSkillXp(awards: Award[]): SkillXpRow[] {
    const map = new Map<string, SkillXpRow>();
    for (const award of awards) {
      const skill = award?.skill;
      const xp = award?.activity?.xpGained;
      if (!skill?.slug || !Number.isFinite(xp) || xp === 0) {
        continue;
      }
      const cur = map.get(skill.slug);
      if (cur) {
        cur.xp += xp;
      } else {
        map.set(skill.slug, {
          slug: skill.slug,
          name: skill.name,
          icon: skill.icon ?? null,
          xp,
        });
      }
    }
    return [...map.values()];
  }

  private presentConsuetudo(run: {
    id: number;
    date: string;
    startedAt: Date;
    completedAt: Date | null;
    skippedCount: number;
    completedCount: number;
    plannedSeconds: number;
    elapsedMs: bigint;
    xpAwarded: number;
    routine: { name: string; icon: string | null };
  }) {
    const completedAt = run.completedAt ?? run.startedAt;
    const elapsedMinutes = Math.max(
      0,
      Math.round(Number(run.elapsedMs) / 60_000),
    );
    const plannedMinutes = Math.max(0, Math.round(run.plannedSeconds / 60));
    return {
      id: run.id,
      date: run.date,
      workMinutes: plannedMinutes,
      restMinutes: 0,
      iterations: run.completedCount + run.skippedCount,
      durationMinutes: elapsedMinutes || plannedMinutes,
      presetId: null,
      skillId: null,
      skill: null,
      xpAwarded: run.xpAwarded,
      activityId: null,
      note: `Consuetudo · ${run.routine.name}`,
      completedAt,
      outcome: 'consuetudo',
      endedEarly: run.skippedCount > 0,
      elapsedMinutes,
      questRunId: null,
      taskLabel: run.routine.name,
      focusXpAwarded: 0,
      disciplineXpAwarded: 0,
      startedAt: run.startedAt,
      watchName: null,
      skillXp: [] as SkillXpRow[],
      restTotalMinutes: 0,
      kind: 'consuetudo' as const,
      routineName: run.routine.name,
      routineIcon: run.routine.icon,
    };
  }

  private presentSession<
    T extends {
      startedAt: Date | null;
      completedAt: Date;
      elapsedMinutes: number | null;
      durationMinutes: number;
      restMinutes: number;
      iterations: number;
      skillXpJson: string | null;
      focusXpAwarded: number;
      disciplineXpAwarded: number;
      xpAwarded: number;
      skill: {
        slug: string;
        name: string;
        icon: string | null;
      } | null;
    },
  >(row: T) {
    const { skillXpJson, ...rest } = row;
    const startedAt = row.startedAt ?? this.inferStartedAt(row);
    return {
      ...rest,
      startedAt,
      skillXp: this.parseSkillXp(skillXpJson, row),
      restTotalMinutes: row.restMinutes * Math.max(0, row.iterations - 1),
    };
  }

  private inferStartedAt(row: {
    completedAt: Date;
    elapsedMinutes: number | null;
    durationMinutes: number;
  }): Date {
    const mins = Math.max(0, row.elapsedMinutes ?? row.durationMinutes ?? 0);
    return new Date(row.completedAt.getTime() - mins * 60_000);
  }

  private parseSkillXp(
    raw: string | null,
    row: {
      focusXpAwarded: number;
      disciplineXpAwarded: number;
      xpAwarded: number;
      skill: { slug: string; name: string; icon: string | null } | null;
    },
  ): SkillXpRow[] {
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SkillXpRow[];
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (s) => s && typeof s.slug === 'string' && Number.isFinite(s.xp),
          );
        }
      } catch {
        /* fall through */
      }
    }
    const out: SkillXpRow[] = [];
    if (row.focusXpAwarded) {
      out.push({
        slug: FOCUS_SKILL_SLUG,
        name: row.skill?.slug === FOCUS_SKILL_SLUG ? row.skill.name : 'Focus',
        icon: row.skill?.slug === FOCUS_SKILL_SLUG ? row.skill.icon : '🎯',
        xp: row.focusXpAwarded,
      });
    }
    if (row.disciplineXpAwarded) {
      out.push({
        slug: DISCIPLINE_SKILL_SLUG,
        name:
          row.skill?.slug === DISCIPLINE_SKILL_SLUG
            ? row.skill.name
            : 'Discipline',
        icon:
          row.skill?.slug === DISCIPLINE_SKILL_SLUG ? row.skill.icon : '⚖️',
        xp: row.disciplineXpAwarded,
      });
    }
    if (!out.length && row.skill && row.xpAwarded) {
      out.push({
        slug: row.skill.slug,
        name: row.skill.name,
        icon: row.skill.icon,
        xp: row.xpAwarded,
      });
    }
    return out;
  }
}
