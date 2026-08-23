import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterService,
  FEATURE_CONSUETUDO,
  FEATURE_HABITUS,
} from '../character/character.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { TimeService } from '../time/time.service';
import { WorkIntervalsService } from '../work-intervals/work-intervals.service';
import {
  QUEST_WEIGHT_TOTAL,
  QuestSkillShare,
  QuestSkillWeight,
  sharesToBonus,
  splitQuestXp,
} from '../xp/quest-xp.util';
import { boostsWealth, parseRewardCents } from '../wealth/money.util';
import { addDaysIso, eachDateInclusive } from '../time/tallinn';
import { formatElapsedShort } from '../time/zone';

type SkillReq = { slug: string; level: number };
type XpPlan = {
  dayXp: number[];
  completionBonus?: Record<string, number>;
};

type SubtaskInput = {
  id?: number;
  title: string;
  gatesJourney?: boolean;
  deadline?: string | null;
  estimateMinutes?: number | string | null;
};

type CreateQuestInput = {
  name: string;
  summary?: string;
  description?: string;
  rules?: string;
  stakes?: string;
  howToWin?: string;
  destination?: string;
  journeyLabel?: string;
  journeyNote?: string;
  commitmentLevel?: number;
  deadline?: string | null;
  coverDataUrl?: string;
  tier?: string;
  skillSlug?: string;
  skillReqs?: SkillReq[];
  unlockReqs?: string[];
  questReqs?: string[];
  subtasks?: Array<string | SubtaskInput>;
  rewards?: {
    title?: string;
    features?: string[];
    permissionKeys?: string[];
  };
  totalXp?: number;
  skillWeights?: QuestSkillWeight[];
  completionBonus?: Record<string, number>;
  wealthCents?: number | null;
  scriptoriumWorkId?: number;
  /// Expected minutes for the main daily-work slice. Optional.
  dailyWorkMinutes?: number | null;
  dailyWorkTitle?: string | null;
};

const MAX_COVER_BYTES = 4 * 1024 * 1024;
const SUBTASK_PROGRESS_CAP = 90;
const DESTINATION_PROGRESS = 10;

export const QUEST_ORDO_DIEI_SLUG = 'ordo-diei';
export const ORDO_DIEI_FORGE_TITLE = 'Forge a Consuetudo';
export const ORDO_DIEI_WALK_TITLE = 'Walk the Consuetudo';

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
    private readonly characterService: CharacterService,
    private readonly time: TimeService,
    private readonly workIntervals: WorkIntervalsService,
  ) {}

  async list(filter: string = 'all') {
    const quests = await this.prisma.quest.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: this.questInclude(false),
    });
    const skillLevels = await this.skillLevelMap();
    const completedSlugs = await this.completedQuestSlugs();
    const features = await this.featureMap();
    const unlocksBySlug = this.unlocksIndex(quests);

    const views = quests.map((q) =>
      this.toQuestView(q, skillLevels, completedSlugs, features, unlocksBySlug),
    );

    switch (filter) {
      case 'available':
        return views.filter((v) => v.availability === 'available');
      case 'locked':
        return views.filter((v) => v.availability === 'locked');
      case 'active':
        return views.filter((v) => v.run?.status === 'ACTIVE');
      case 'completed':
        return views.filter(
          (v) =>
            v.run?.status === 'COMPLETED' || completedSlugs.has(v.slug),
        );
      default:
        return views;
    }
  }

  async listActive() {
    const runs = await this.prisma.questRun.findMany({
      where: { status: 'ACTIVE' },
      include: {
        quest: { include: { subtasks: { orderBy: { sortOrder: 'asc' } } } },
        journeyLogs: { orderBy: { date: 'desc' }, take: 14 },
        subtaskCompletions: true,
      },
      orderBy: { startedAt: 'asc' },
    });
    const today = this.localToday();
    return runs.map((run) => {
      const progress = this.computeProgress(
        run.quest.kind,
        run.quest.durationDays,
        run.status,
        run.streakCount,
        run.destinationDone,
        run.quest.subtasks.length,
        run.subtaskCompletions.filter((c) => c.done).length,
      );
      const gates = run.quest.subtasks.filter((s) => s.gatesJourney);
      const doneIds = new Set(
        run.subtaskCompletions.filter((c) => c.done).map((c) => c.subtaskId),
      );
      const journeyUnlocked =
        gates.length === 0 || gates.every((g) => doneIds.has(g.id));
      const journeyDueToday =
        journeyUnlocked &&
        this.journeyDueOnDate(
          run.quest.kind,
          run.quest.commitmentLevel,
          today,
          run.journeyLogs.map((l) => l.date),
          run.lastLogDate,
        );
      return {
        runId: run.id,
        questId: run.questId,
        slug: run.quest.slug,
        name: run.quest.name,
        tier: run.quest.tier,
        streakCount: run.streakCount,
        bestStreak: run.bestStreak,
        durationDays: run.quest.durationDays,
        kind: run.quest.kind,
        lastLogDate: run.lastLogDate,
        startedAt: run.startedAt,
        progressPercent: progress,
        commitmentLevel: run.quest.commitmentLevel,
        journeyLabel: run.quest.journeyLabel,
        journeyDueToday,
        journeyUnlocked,
        deadline: run.quest.deadline ?? null,
      };
    });
  }

  async getOne(id: number) {
    const quest = await this.prisma.quest.findUnique({
      where: { id },
      include: this.questInclude(true),
    });
    if (!quest) {
      throw new NotFoundException(`Quest #${id} not found`);
    }
    const allQuests = await this.prisma.quest.findMany({
      select: { id: true, slug: true, name: true, questReqsJson: true },
    });
    const skillLevels = await this.skillLevelMap();
    const completedSlugs = await this.completedQuestSlugs();
    const features = await this.featureMap();
    const unlocksBySlug = this.unlocksIndex(allQuests);
    return this.toQuestView(
      quest,
      skillLevels,
      completedSlugs,
      features,
      unlocksBySlug,
    );
  }

  async create(input: CreateQuestInput) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const slug = this.slugify(name);
    const exists = await this.prisma.quest.findUnique({ where: { slug } });
    if (exists) {
      throw new BadRequestException('A quest with this name already exists');
    }

    const commitment = this.clampCommitment(input.commitmentLevel);
    const subtasks = this.normalizeSubtasks(input.subtasks);
    const rules = input.rules?.trim() || null;
    const stakes = input.stakes?.trim() || null;
    const howToWin = input.howToWin?.trim() || null;
    const destination = input.destination?.trim() || null;
    const journeyLabel = input.journeyLabel?.trim() || null;
    const journeyNote = input.journeyNote?.trim() || null;
    const deadline = this.parseDeadline(input.deadline);
    const { totalXp, weights, completionBonus } = this.normalizeSkillXp(input);
    const description =
      input.description?.trim() ||
      [rules, stakes, howToWin, destination].filter(Boolean).join('\n\n') ||
      input.summary?.trim() ||
      name;

    const created = await this.prisma.quest.create({
      data: {
        slug,
        name,
        tier: input.tier?.trim() || 'NOVICE',
        summary: input.summary?.trim() || name,
        description,
        rules,
        stakes,
        howToWin,
        destination,
        journeyLabel,
        journeyNote,
        commitmentLevel: commitment,
        deadline,
        totalXp,
        skillWeightsJson: weights.length ? JSON.stringify(weights) : null,
        wealthCents: boostsWealth(weights)
          ? parseRewardCents(input.wealthCents)
          : 0,
        skillSlug:
          input.skillSlug?.trim() ||
          weights.slice().sort((a, b) => b.weight - a.weight)[0]?.slug ||
          null,
        kind: 'JOURNEY',
        skillReqsJson: input.skillReqs?.length
          ? JSON.stringify(input.skillReqs)
          : null,
        unlockReqsJson: input.unlockReqs?.length
          ? JSON.stringify(input.unlockReqs)
          : null,
        questReqsJson: input.questReqs?.length
          ? JSON.stringify(input.questReqs)
          : null,
        rewardJson: input.rewards
          ? JSON.stringify(input.rewards)
          : null,
        xpPlanJson: completionBonus
          ? JSON.stringify({ dayXp: [0], completionBonus })
          : null,
        createdByUser: true,
        sortOrder: 100,
        dailyWorkMinutes: this.normalizeEstimateMinutes(
          input.dailyWorkMinutes,
        ),
        dailyWorkTitle: input.dailyWorkTitle?.trim() || null,
        subtasks: subtasks.length
          ? {
              create: subtasks.map((row, i) => ({
                title: row.title,
                sortOrder: i,
                gatesJourney: row.gatesJourney,
                deadline: row.deadline,
                estimateMinutes: row.estimateMinutes,
              })),
            }
          : undefined,
      },
    });

    if (input.coverDataUrl?.trim()) {
      const coverImage = await this.saveCover(
        created.id,
        input.coverDataUrl.trim(),
      );
      await this.prisma.quest.update({
        where: { id: created.id },
        data: { coverImage },
      });
    }

    const workId = Number(input.scriptoriumWorkId);
    if (Number.isFinite(workId) && workId > 0) {
      await this.prisma.scriptoriumWork.updateMany({
        where: { id: workId },
        data: { questId: created.id },
      });
    }

    return this.getOne(created.id);
  }

  async update(questId: number, input: CreateQuestInput) {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      include: { subtasks: true },
    });
    if (!quest) {
      throw new NotFoundException(`Quest #${questId} not found`);
    }

    const commitment = this.clampCommitment(
      input.commitmentLevel ?? quest.commitmentLevel,
    );
    const incoming =
      input.subtasks !== undefined
        ? this.normalizeSubtasks(input.subtasks)
        : null;
    const { totalXp, weights, completionBonus } = this.normalizeSkillXp({
      ...input,
      totalXp: input.totalXp ?? quest.totalXp,
      skillWeights:
        input.skillWeights ??
        this.parseJson<QuestSkillWeight[]>(quest.skillWeightsJson) ??
        [],
    });
    const name = input.name?.trim() || quest.name;
    const rules =
      input.rules !== undefined ? input.rules.trim() || null : quest.rules;
    const stakes =
      input.stakes !== undefined ? input.stakes.trim() || null : quest.stakes;
    const howToWin =
      input.howToWin !== undefined
        ? input.howToWin.trim() || null
        : quest.howToWin;
    const destination =
      input.destination !== undefined
        ? input.destination.trim() || null
        : quest.destination;
    const journeyLabel =
      input.journeyLabel !== undefined
        ? input.journeyLabel.trim() || null
        : quest.journeyLabel;
    const journeyNote =
      input.journeyNote !== undefined
        ? input.journeyNote.trim() || null
        : quest.journeyNote;
    const deadline =
      input.deadline !== undefined
        ? this.parseDeadline(input.deadline)
        : quest.deadline;
    const summary = input.summary?.trim() || quest.summary;
    const description =
      input.description?.trim() ||
      [rules, stakes, howToWin, destination].filter(Boolean).join('\n\n') ||
      summary;

    await this.prisma.quest.update({
      where: { id: questId },
      data: {
        name,
        tier: input.tier?.trim() || quest.tier,
        summary,
        description,
        rules,
        stakes,
        howToWin,
        destination,
        journeyLabel,
        journeyNote,
        commitmentLevel: commitment,
        deadline,
        totalXp,
        skillWeightsJson: weights.length ? JSON.stringify(weights) : null,
        wealthCents:
          input.wealthCents !== undefined
            ? boostsWealth(weights)
              ? parseRewardCents(input.wealthCents)
              : 0
            : boostsWealth(weights)
              ? quest.wealthCents
              : 0,
        skillSlug:
          input.skillSlug?.trim() ||
          weights.slice().sort((a, b) => b.weight - a.weight)[0]?.slug ||
          quest.skillSlug,
        skillReqsJson:
          input.skillReqs !== undefined
            ? input.skillReqs.length
              ? JSON.stringify(input.skillReqs)
              : null
            : quest.skillReqsJson,
        questReqsJson:
          input.questReqs !== undefined
            ? input.questReqs.length
              ? JSON.stringify(input.questReqs)
              : null
            : quest.questReqsJson,
        rewardJson:
          input.rewards !== undefined
            ? JSON.stringify(input.rewards)
            : quest.rewardJson,
        xpPlanJson: completionBonus
          ? JSON.stringify({
              dayXp: this.parseXpPlan(quest.xpPlanJson).dayXp,
              completionBonus,
            })
          : quest.xpPlanJson,
        dailyWorkMinutes:
          input.dailyWorkMinutes !== undefined
            ? this.normalizeEstimateMinutes(input.dailyWorkMinutes)
            : quest.dailyWorkMinutes,
        dailyWorkTitle:
          input.dailyWorkTitle !== undefined
            ? input.dailyWorkTitle?.trim() || null
            : quest.dailyWorkTitle,
      },
    });

    if (incoming) {
      const keepIds = new Set(
        incoming
          .map((row) => row.id)
          .filter((id): id is number => Number.isFinite(id)),
      );
      const existingIds = new Set(quest.subtasks.map((s) => s.id));
      await this.prisma.questSubtask.deleteMany({
        where: { questId, id: { notIn: [...keepIds] } },
      });
      for (const [i, row] of incoming.entries()) {
        if (row.id && existingIds.has(row.id)) {
          await this.prisma.questSubtask.update({
            where: { id: row.id },
            data: {
              title: row.title,
              sortOrder: i,
              gatesJourney: row.gatesJourney,
              deadline: row.deadline,
              estimateMinutes: row.estimateMinutes,
            },
          });
        } else {
          await this.prisma.questSubtask.create({
            data: {
              questId,
              title: row.title,
              sortOrder: i,
              gatesJourney: row.gatesJourney,
              deadline: row.deadline,
              estimateMinutes: row.estimateMinutes,
            },
          });
        }
      }
    }

    if (input.coverDataUrl?.trim()) {
      const coverImage = await this.saveCover(questId, input.coverDataUrl.trim());
      await this.prisma.quest.update({
        where: { id: questId },
        data: { coverImage },
      });
    }

    return this.getOne(questId);
  }

  async remove(questId: number) {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: { id: true },
    });
    if (!quest) {
      throw new NotFoundException(`Quest #${questId} not found`);
    }
    await this.prisma.$transaction(async (tx) => {
      const runs = await tx.questRun.findMany({
        where: { questId },
        select: { id: true },
      });
      const runIds = runs.map((r) => r.id);
      if (runIds.length) {
        await tx.horologiumSession.updateMany({
          where: { questRunId: { in: runIds } },
          data: { questRunId: null },
        });
      }
      await tx.quest.delete({ where: { id: questId } });
    });
    return { deleted: true, id: questId };
  }

  async start(questId: number) {
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      include: { subtasks: true },
    });
    if (!quest) {
      throw new NotFoundException(`Quest #${questId} not found`);
    }
    const skillLevels = await this.skillLevelMap();
    const completedSlugs = await this.completedQuestSlugs();
    const features = await this.featureMap();
    const view = this.toQuestView(
      { ...quest, runs: [], subtasks: quest.subtasks },
      skillLevels,
      completedSlugs,
      features,
      new Map(),
    );
    if (view.availability === 'locked') {
      throw new BadRequestException(
        `Requirements not met: ${view.requirements
          .filter((r) => !r.met)
          .map((r) => r.label)
          .join(', ')}`,
      );
    }
    const existing = await this.prisma.questRun.findFirst({
      where: { questId, status: 'ACTIVE' },
    });
    if (existing) {
      return this.getOne(questId);
    }
    await this.prisma.questRun.create({
      data: { questId, status: 'ACTIVE' },
    });
    return this.getOne(questId);
  }

  async logDay(
    runId: number,
    input: { result: 'CLEAN' | 'BROKEN'; date?: string; note?: string },
  ) {
    const run = await this.prisma.questRun.findUnique({
      where: { id: runId },
      include: { quest: true },
    });
    if (!run) {
      throw new NotFoundException(`Quest run #${runId} not found`);
    }
    if (run.status !== 'ACTIVE') {
      throw new BadRequestException('Quest is not active');
    }
    if (run.quest.kind !== 'STREAK_LOG') {
      throw new BadRequestException('This quest does not use daily streak logs');
    }

    const date = input.date?.trim() || this.localToday();
    const existingLog = await this.prisma.questDayLog.findUnique({
      where: { runId_date: { runId, date } },
    });
    if (existingLog) {
      throw new BadRequestException('Already logged for this date');
    }

    let streak = run.streakCount;
    if (run.lastLogDate && run.lastLogDate !== date) {
      const yesterday = this.offsetDate(date, -1);
      if (run.lastLogDate !== yesterday) {
        streak = 0;
      }
    }

    const plan = this.parseXpPlan(run.quest.xpPlanJson);
    let xpAwarded = 0;
    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];

    if (input.result === 'BROKEN') {
      streak = 0;
    } else {
      streak += 1;
      const dayIndex = Math.min(streak, plan.dayXp.length) - 1;
      xpAwarded = plan.dayXp[Math.max(0, dayIndex)] ?? 0;
      if (xpAwarded > 0 && run.quest.skillSlug) {
        const skill = await this.prisma.skill.findUnique({
          where: { slug: run.quest.skillSlug },
        });
        if (skill) {
          awards.push(
            await this.skillsService.awardXp(skill.id, {
              xpGained: xpAwarded,
              note: `${run.quest.name}: day ${streak} clean`,
            }),
          );
        }
      }
    }

    const bestStreak = Math.max(run.bestStreak, streak);
    const targetDays = run.quest.durationDays ?? plan.dayXp.length;
    const completed = input.result === 'CLEAN' && streak >= targetDays;

    await this.prisma.questDayLog.create({
      data: {
        runId,
        date,
        result: input.result,
        xpAwarded,
        note: input.note?.trim() || null,
      },
    });

    await this.prisma.questRun.update({
      where: { id: runId },
      data: {
        streakCount: streak,
        bestStreak,
        lastLogDate: date,
        status: completed ? 'COMPLETED' : 'ACTIVE',
        completedAt: completed ? new Date() : null,
      },
    });

    let completionAwards: typeof awards = [];
    let unlocked: string[] = [];
    if (completed) {
      const result = await this.completeQuest(run.questId, run.quest);
      completionAwards = result.awards;
      unlocked = result.unlocked;
    }

    return {
      streakCount: streak,
      bestStreak,
      xpAwarded,
      completed,
      awards: [...awards, ...completionAwards],
      unlocked,
      quest: await this.getOne(run.questId),
    };
  }

  async logJourney(
    runId: number,
    input: { date?: string; note?: string; done?: boolean },
  ) {
    const run = await this.requireActiveRun(runId);
    const gates = await this.prisma.questSubtask.findMany({
      where: { questId: run.questId, gatesJourney: true },
    });
    if (gates.length > 0) {
      const doneIds = await this.prisma.questSubtaskCompletion.findMany({
        where: { runId, subtaskId: { in: gates.map((g) => g.id) }, done: true },
        select: { subtaskId: true },
      });
      const doneSet = new Set(doneIds.map((d) => d.subtaskId));
      const blocked = gates.filter((g) => !doneSet.has(g.id));
      if (blocked.length) {
        throw new BadRequestException(
          `Complete ${blocked.map((g) => g.title).join(', ')} before the daily check-in`,
        );
      }
    }
    const date = input.date?.trim() || this.localToday();
    const existing = await this.prisma.questJourneyLog.findUnique({
      where: { runId_date: { runId, date } },
    });
    const done = input.done !== false;

    if (!done) {
      if (existing) {
        await this.prisma.questJourneyLog.delete({ where: { id: existing.id } });
      }
      return {
        logged: false,
        date,
        quest: await this.getOne(run.questId),
      };
    }

    if (existing) {
      throw new BadRequestException('Already logged journey for this date');
    }

    await this.prisma.questJourneyLog.create({
      data: {
        runId,
        date,
        note: input.note?.trim() || null,
      },
    });

    return {
      logged: true,
      date,
      quest: await this.getOne(run.questId),
    };
  }

  /** Habitus auto-progress: journey day or subtask on the active run. */
  async applyHabitusProgress(input: {
    questId: number;
    target: 'JOURNEY' | 'SUBTASK';
    subtaskId?: number | null;
    date: string;
    note?: string;
  }): Promise<void> {
    const run = await this.prisma.questRun.findFirst({
      where: { questId: input.questId, status: 'ACTIVE' },
    });
    if (!run) {
      return;
    }
    if (input.target === 'SUBTASK' && input.subtaskId) {
      try {
        await this.toggleSubtask(run.id, input.subtaskId, true);
      } catch {
        /* already done or gated */
      }
      return;
    }
    try {
      await this.logJourney(run.id, {
        date: input.date,
        note: input.note,
        done: true,
      });
    } catch {
      /* already logged today */
    }
  }

  /**
   * Horologium binds a due daily. STREAK_LOG → Clean; JOURNEY → check-in.
   */
  async completeAvailableDaily(
    runId: number,
    note?: string,
  ): Promise<{
    kind: 'streak' | 'journey';
    logged: boolean;
    date: string;
    awards: Awaited<ReturnType<SkillsService['awardXp']>>[];
    quest: Awaited<ReturnType<QuestsService['getOne']>>;
    label: string;
  }> {
    const run = await this.requireActiveRun(runId);
    const today = this.localToday();
    const gates = await this.prisma.questSubtask.findMany({
      where: { questId: run.questId, gatesJourney: true },
    });
    if (gates.length > 0) {
      const doneIds = await this.prisma.questSubtaskCompletion.findMany({
        where: { runId, subtaskId: { in: gates.map((g) => g.id) }, done: true },
        select: { subtaskId: true },
      });
      const doneSet = new Set(doneIds.map((d) => d.subtaskId));
      const blocked = gates.filter((g) => !doneSet.has(g.id));
      if (blocked.length) {
        throw new BadRequestException(
          `Complete ${blocked.map((g) => g.title).join(', ')} before the daily check-in`,
        );
      }
    }
    const journeyDates = (
      await this.prisma.questJourneyLog.findMany({
        where: { runId },
        select: { date: true },
      })
    ).map((l) => l.date);
    const due = this.journeyDueOnDate(
      run.quest.kind,
      run.quest.commitmentLevel,
      today,
      journeyDates,
      run.lastLogDate,
    );
    if (!due) {
      throw new BadRequestException('This daily is not available today');
    }

    const label = run.quest.journeyLabel?.trim() || run.quest.name;
    const tagged = note?.trim() || `Horologium · ${label}`;

    if (run.quest.kind === 'STREAK_LOG') {
      const res = await this.logDay(runId, {
        result: 'CLEAN',
        note: tagged,
      });
      return {
        kind: 'streak',
        logged: true,
        date: today,
        awards: res.awards,
        quest: res.quest,
        label,
      };
    }

    const res = await this.logJourney(runId, { note: tagged, done: true });
    return {
      kind: 'journey',
      logged: res.logged,
      date: res.date,
      awards: [],
      quest: res.quest,
      label,
    };
  }

  async toggleSubtask(runId: number, subtaskId: number, completed: boolean) {
    const run = await this.requireActiveRun(runId);
    const subtask = await this.prisma.questSubtask.findFirst({
      where: { id: subtaskId, questId: run.questId },
    });
    if (!subtask) {
      throw new NotFoundException(`Subtask #${subtaskId} not found`);
    }

    const existing = await this.prisma.questSubtaskCompletion.findUnique({
      where: { runId_subtaskId: { runId, subtaskId } },
    });

    if (completed) {
      if (!existing) {
        await this.prisma.questSubtaskCompletion.create({
          data: { runId, subtaskId, done: true, completedAt: new Date() },
        });
      } else if (!existing.done) {
        await this.prisma.questSubtaskCompletion.update({
          where: { id: existing.id },
          data: { done: true, completedAt: new Date() },
        });
      }
    } else if (existing) {
      await this.prisma.questSubtaskCompletion.update({
        where: { id: existing.id },
        data: { done: false },
      });
      if (run.destinationDone) {
        await this.prisma.questRun.update({
          where: { id: runId },
          data: { destinationDone: false },
        });
      }
    }

    return this.getOne(run.questId);
  }

  /**
   * Absolute elapsed patch from Horologium's task clock bound directly to a
   * subtask. Records the delta as an append-only WorkInterval and, when
   * today's board already carries this subtask as a daily, projects the
   * same delta onto that DailyTask.elapsedMs so both logs agree.
   */
  async addSubtaskElapsed(runId: number, subtaskId: number, elapsedMs: number) {
    const run = await this.requireActiveRun(runId);
    const subtask = await this.prisma.questSubtask.findFirst({
      where: { id: subtaskId, questId: run.questId },
    });
    if (!subtask) {
      throw new NotFoundException(`Subtask #${subtaskId} not found`);
    }
    const existing = await this.prisma.questSubtaskCompletion.findUnique({
      where: { runId_subtaskId: { runId, subtaskId } },
    });
    const ms = Math.max(0, Math.round(Number(elapsedMs) || 0));
    const previousMs = Number(existing?.elapsedMs ?? 0);
    const delta = ms - previousMs;
    const row = await this.prisma.questSubtaskCompletion.upsert({
      where: { runId_subtaskId: { runId, subtaskId } },
      create: {
        runId,
        subtaskId,
        done: false,
        elapsedMs: BigInt(ms),
      },
      update: { elapsedMs: BigInt(ms) },
    });
    if (delta > 0) {
      await this.workIntervals.recordFlush('track', delta, new Date(), {
        questId: run.questId,
        questRunId: runId,
        questSubtaskId: subtaskId,
      });
      const linkedDaily = await this.prisma.dailyTask.findFirst({
        where: {
          date: this.time.today(),
          questRunId: runId,
          questSubtaskId: subtaskId,
        },
      });
      if (linkedDaily) {
        await this.prisma.dailyTask.update({
          where: { id: linkedDaily.id },
          data: { elapsedMs: { increment: BigInt(delta) } },
        });
      }
    }
    return {
      runId,
      subtaskId,
      elapsedMs: Number(row.elapsedMs),
      done: row.done,
    };
  }

  async completeDestination(runId: number) {
    const run = await this.requireActiveRun(runId);
    const subtasks = await this.prisma.questSubtask.findMany({
      where: { questId: run.questId },
    });
    const doneCount = await this.prisma.questSubtaskCompletion.count({
      where: { runId, done: true },
    });
    if (subtasks.length > 0 && doneCount < subtasks.length) {
      throw new BadRequestException(
        'Finish every subtask before completing the destination',
      );
    }

    await this.prisma.questRun.update({
      where: { id: runId },
      data: {
        destinationDone: true,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    const result = await this.completeQuest(run.questId, run.quest);
    return {
      completed: true,
      awards: result.awards,
      unlocked: result.unlocked,
      quest: await this.getOne(run.questId),
    };
  }

  async hasActiveRunBySlug(slug: string): Promise<boolean> {
    const quest = await this.prisma.quest.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!quest) {
      return false;
    }
    const run = await this.prisma.questRun.findFirst({
      where: { questId: quest.id, status: 'ACTIVE' },
      select: { id: true },
    });
    return run != null;
  }

  /** Marks Ordo Diei subtasks; walking the practice completes the destination. */
  async advanceOrdoDiei(kind: 'forge' | 'walk'): Promise<void> {
    const quest = await this.prisma.quest.findUnique({
      where: { slug: QUEST_ORDO_DIEI_SLUG },
      include: { subtasks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quest) {
      return;
    }
    const run = await this.prisma.questRun.findFirst({
      where: { questId: quest.id, status: 'ACTIVE' },
    });
    if (!run) {
      return;
    }
    const titles =
      kind === 'forge'
        ? [ORDO_DIEI_FORGE_TITLE]
        : [ORDO_DIEI_FORGE_TITLE, ORDO_DIEI_WALK_TITLE];
    for (const title of titles) {
      const sub = quest.subtasks.find((row) => row.title === title);
      if (sub) {
        await this.toggleSubtask(run.id, sub.id, true);
      }
    }
    if (kind !== 'walk') {
      return;
    }
    try {
      await this.completeDestination(run.id);
    } catch {
      /* destination still gated or already completed */
    }
  }

  private async requireActiveRun(runId: number) {
    const run = await this.prisma.questRun.findUnique({
      where: { id: runId },
      include: { quest: true },
    });
    if (!run) {
      throw new NotFoundException(`Quest run #${runId} not found`);
    }
    if (run.status !== 'ACTIVE') {
      throw new BadRequestException('Quest is not active');
    }
    return run;
  }

  private async completeQuest(
    questId: number,
    quest: {
      slug: string;
      name: string;
      rewardJson: string | null;
      xpPlanJson: string | null;
      skillSlug: string | null;
      totalXp?: number;
      skillWeightsJson?: string | null;
      wealthCents?: number | null;
    },
  ) {
    const plan = this.parseXpPlan(quest.xpPlanJson);
    const shares = this.skillShares(
      quest.totalXp ?? 0,
      quest.skillWeightsJson ?? null,
      plan.completionBonus,
    );
    const completionBonus =
      sharesToBonus(shares) ?? plan.completionBonus;
    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];
    const unlocked: string[] = [];

    if (completionBonus) {
      for (const [slug, xp] of Object.entries(completionBonus)) {
        const skill = await this.prisma.skill.findUnique({ where: { slug } });
        if (skill && xp > 0) {
          awards.push(
            await this.skillsService.awardXp(skill.id, {
              xpGained: xp,
              note: `${quest.name}: quest complete`,
            }),
          );
        }
      }
    }

    const rewards = this.parseJson<{
      title?: string;
      features?: string[];
      permissionKeys?: string[];
    }>(quest.rewardJson);

    if (rewards?.title) {
      await this.characterService.setTitle(rewards.title);
      unlocked.push(`Title: ${rewards.title}`);
    }
    for (const key of rewards?.features ?? []) {
      await this.characterService.unlockFeature(key);
      unlocked.push(key);
    }
    for (const key of rewards?.permissionKeys ?? []) {
      await this.prisma.reward.updateMany({
        where: { permissionKey: key },
        data: { unlocked: true },
      });
      unlocked.push(key);
    }

    if (quest.slug === 'custodia-mentis') {
      await this.characterService.unlockFeature(FEATURE_HABITUS);
      if (!unlocked.includes(FEATURE_HABITUS)) {
        unlocked.push(FEATURE_HABITUS);
      }
    }
    if (quest.slug === QUEST_ORDO_DIEI_SLUG) {
      await this.characterService.unlockFeature(FEATURE_CONSUETUDO);
      if (!unlocked.includes(FEATURE_CONSUETUDO)) {
        unlocked.push(FEATURE_CONSUETUDO);
      }
    }

    const wealthCents = boostsWealth(
      this.parseJson<QuestSkillWeight[]>(quest.skillWeightsJson ?? null) ?? [],
    )
      ? parseRewardCents(quest.wealthCents)
      : 0;
    if (wealthCents > 0) {
      await this.characterService.adjustWealth({
        deltaCents: wealthCents,
        note: `${quest.name}: quest complete`,
        source: 'quest',
      });
    }

    return { awards, unlocked };
  }

  private questInclude(withLogs: boolean) {
    const logTake = withLogs ? 30 : 14;
    return {
      subtasks: { orderBy: { sortOrder: 'asc' as const } },
      runs: {
        orderBy: { startedAt: 'desc' as const },
        take: 1,
        include: {
          journeyLogs: {
            orderBy: { date: 'desc' as const },
            take: withLogs ? 120 : 60,
          },
          logs: { orderBy: { date: 'desc' as const }, take: logTake },
          subtaskCompletions: { orderBy: { completedAt: 'asc' as const } },
        },
      },
    };
  }

  private toQuestView(
    quest: {
      id: number;
      slug: string;
      name: string;
      tier: string;
      summary: string;
      description: string;
      coverImage: string | null;
      skillSlug: string | null;
      durationDays: number | null;
      kind: string;
      rules?: string | null;
      stakes?: string | null;
      howToWin?: string | null;
      destination?: string | null;
      journeyLabel?: string | null;
      journeyNote?: string | null;
      commitmentLevel?: number;
      deadline?: string | null;
      totalXp?: number;
      skillWeightsJson?: string | null;
      wealthCents?: number | null;
      skillReqsJson: string | null;
      unlockReqsJson: string | null;
      questReqsJson: string | null;
      rewardJson: string | null;
      xpPlanJson: string | null;
      createdByUser: boolean;
      sortOrder: number;
      createdAt: Date;
      dailyWorkMinutes?: number | null;
      dailyWorkTitle?: string | null;
      subtasks?: Array<{
        id: number;
        title: string;
        sortOrder: number;
        gatesJourney?: boolean;
        deadline?: string | null;
        estimateMinutes?: number | null;
      }>;
      runs: Array<{
        id: number;
        status: string;
        streakCount: number;
        bestStreak: number;
        startedAt: Date;
        completedAt: Date | null;
        lastLogDate: string | null;
        destinationDone?: boolean;
        logs?: Array<{
          id: number;
          date: string;
          result: string;
          xpAwarded: number;
          note: string | null;
          createdAt?: Date;
        }>;
        journeyLogs?: Array<{
          id: number;
          date: string;
          note: string | null;
          createdAt: Date;
        }>;
        subtaskCompletions?: Array<{
          subtaskId: number;
          completedAt: Date;
          done?: boolean;
          elapsedMs?: bigint | number;
        }>;
      }>;
    },
    skillLevels: Map<string, { level: number; name: string }>,
    completedSlugs: Set<string>,
    features: Map<string, boolean>,
    unlocksBySlug: Map<string, Array<{ id: number; slug: string; name: string }>>,
  ) {
    const skillReqs = this.parseJson<SkillReq[]>(quest.skillReqsJson) ?? [];
    const unlockReqs = this.parseJson<string[]>(quest.unlockReqsJson) ?? [];
    const questReqs = this.parseJson<string[]>(quest.questReqsJson) ?? [];
    const completedNames = this.questNameLookup();

    const requirements = [
      ...skillReqs.map((r) => {
        const have = skillLevels.get(r.slug)?.level ?? 0;
        const name = skillLevels.get(r.slug)?.name ?? r.slug;
        return {
          kind: 'skill' as const,
          label: `${name} Lv ${r.level}`,
          met: have >= r.level,
          detail: `yours ${have}`,
          slug: r.slug,
          level: r.level,
        };
      }),
      ...unlockReqs.map((key) => ({
        kind: 'unlock' as const,
        label: key,
        met: features.get(key) === true,
        detail: features.get(key) ? 'unlocked' : 'locked',
      })),
      ...questReqs.map((slug) => ({
        kind: 'quest' as const,
        label: `Quest: ${completedNames.get(slug) ?? slug}`,
        met: completedSlugs.has(slug),
        detail: completedSlugs.has(slug) ? 'done' : 'incomplete',
        slug,
      })),
    ];

    const activeRun = quest.runs.find((r) => r.status === 'ACTIVE') ?? null;
    const latestRun = quest.runs[0] ?? null;
    const allMet = requirements.every((r) => r.met);
    let availability: 'available' | 'locked' | 'active' | 'completed' =
      'available';
    if (activeRun) {
      availability = 'active';
    } else if (
      latestRun?.status === 'COMPLETED' ||
      completedSlugs.has(quest.slug)
    ) {
      availability = 'completed';
    } else if (!allMet) {
      availability = 'locked';
    }

    const completions = latestRun?.subtaskCompletions ?? [];
    const doneRows = completions.filter((c) => c.done !== false);
    const completionOrder = new Map(
      [...doneRows]
        .sort(
          (a, b) =>
            new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
        )
        .map((c, i) => [c.subtaskId, i + 1]),
    );
    const doneSubtaskIds = new Set(doneRows.map((c) => c.subtaskId));
    const completionAt = new Map(
      doneRows.map((c) => [c.subtaskId, c.completedAt]),
    );
    const elapsedById = new Map(
      completions.map((c) => [c.subtaskId, Number(c.elapsedMs ?? 0)]),
    );
    const subtasks = (quest.subtasks ?? []).map((s) => {
      const at = completionAt.get(s.id);
      const stamp = at ? this.time.stamp(at) : null;
      const elapsedMs = elapsedById.get(s.id) ?? 0;
      return {
        id: s.id,
        title: s.title,
        sortOrder: s.sortOrder,
        gatesJourney: Boolean(s.gatesJourney),
        deadline: s.deadline ?? null,
        completed: doneSubtaskIds.has(s.id),
        completedAt: stamp?.iso ?? null,
        completedAtLabel: stamp?.label ?? null,
        completedDate: stamp?.date ?? null,
        completionOrder: completionOrder.get(s.id) ?? null,
        elapsedMs,
        estimateMinutes: s.estimateMinutes ?? null,
      };
    });
    const gateSubtasks = subtasks.filter((s) => s.gatesJourney);
    const journeyUnlocked =
      gateSubtasks.length === 0 || gateSubtasks.every((s) => s.completed);
    const gateUnlockAt = gateSubtasks
      .map((s) => s.completedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;
    const destinationDone = Boolean(latestRun?.destinationDone);
    const progressPercent = this.computeProgress(
      quest.kind,
      quest.durationDays,
      latestRun?.status ?? null,
      latestRun?.streakCount ?? 0,
      destinationDone,
      subtasks.length,
      subtasks.filter((s) => s.completed).length,
    );
    const canCompleteDestination =
      availability === 'active' &&
      !destinationDone &&
      subtasks.every((s) => s.completed);
    const journeyLogs = latestRun?.journeyLogs ?? [];
    const today = this.localToday();
    const commitmentLevel = quest.commitmentLevel ?? 7;
    const activityDates =
      quest.kind === 'STREAK_LOG'
        ? (latestRun?.logs ?? []).map((l) => l.date)
        : journeyLogs.map((l) => l.date);
    const journeyUnlockDate = journeyUnlocked
      ? this.time.stamp(
          gateUnlockAt ?? latestRun?.startedAt ?? new Date(),
        ).date
      : null;
    const endDate =
      latestRun?.status === 'COMPLETED' && latestRun.completedAt
        ? this.time.stamp(latestRun.completedAt).date
        : today;
    const missedDays =
      latestRun && journeyUnlockDate
        ? this.missedDays(
            journeyUnlockDate,
            endDate,
            commitmentLevel,
            new Set(activityDates),
            today,
          )
        : [];
    const canLogJourney =
      availability === 'active' && journeyUnlocked;
    const journeyDueToday =
      canLogJourney &&
      this.journeyDueOnDate(
        quest.kind,
        commitmentLevel,
        today,
        activityDates,
        latestRun?.lastLogDate ?? null,
      );

    const xpPlan = this.parseXpPlan(quest.xpPlanJson);
    const skillShares = this.skillShares(
      quest.totalXp ?? 0,
      quest.skillWeightsJson ?? null,
      xpPlan.completionBonus,
      skillLevels,
    );
    if (skillShares.length && !xpPlan.completionBonus) {
      xpPlan.completionBonus = sharesToBonus(skillShares);
    }

    return {
      id: quest.id,
      slug: quest.slug,
      name: quest.name,
      tier: quest.tier,
      summary: quest.summary,
      description: quest.description,
      rules: quest.rules ?? null,
      stakes: quest.stakes ?? null,
      howToWin: quest.howToWin ?? null,
      destination: quest.destination ?? null,
      journeyLabel: quest.journeyLabel ?? null,
      journeyNote: quest.journeyNote ?? null,
      commitmentLevel,
      deadline: quest.deadline ?? null,
      dailyWorkMinutes: quest.dailyWorkMinutes ?? null,
      dailyWorkTitle: quest.dailyWorkTitle ?? null,
      coverImage: quest.coverImage,
      coverUrl: this.coverUrl(quest.coverImage),
      skillSlug: quest.skillSlug,
      durationDays: quest.durationDays,
      kind: quest.kind,
      createdByUser: quest.createdByUser,
      totalXp: quest.totalXp ?? skillShares.reduce((sum, s) => sum + s.xp, 0),
      skillShares,
      wealthCents: parseRewardCents(quest.wealthCents),
      xpPlan,
      rewards: this.parseJson(quest.rewardJson),
      requirements,
      unlocksQuests: unlocksBySlug.get(quest.slug) ?? [],
      availability,
      canStart: availability === 'available' || availability === 'completed',
      progressPercent,
      canCompleteDestination,
      subtasks,
      journeyUnlocked,
      canLogJourney,
      journeyDueToday,
      missedDays,
      chronicle: this.buildChronicle({
        kind: quest.kind,
        journeyLabel: quest.journeyLabel ?? null,
        startedAt: latestRun?.startedAt ?? null,
        completedAt: latestRun?.completedAt ?? null,
        destinationDone,
        subtasks,
        journeyLogs,
        missedDays,
        streakLogs: latestRun?.logs ?? [],
      }),
      week: this.weekView(today, commitmentLevel, activityDates),
      run: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            streakCount: latestRun.streakCount,
            bestStreak: latestRun.bestStreak,
            startedAt: latestRun.startedAt,
            startedAtLabel: this.time.stamp(latestRun.startedAt).label,
            completedAt: latestRun.completedAt,
            completedAtLabel: latestRun.completedAt
              ? this.time.stamp(latestRun.completedAt).label
              : null,
            lastLogDate: latestRun.lastLogDate,
            destinationDone,
            logs: latestRun.logs ?? [],
            journeyLogs: journeyLogs.map((l) => {
              const stamp = this.time.stamp(l.createdAt);
              return {
                id: l.id,
                date: l.date,
                note: l.note,
                at: stamp.iso,
                atLabel: stamp.label,
              };
            }),
          }
        : null,
    };
  }

  private computeProgress(
    kind: string,
    durationDays: number | null,
    status: string | null,
    streakCount: number,
    destinationDone: boolean,
    subtaskTotal: number,
    subtaskDone: number,
  ): number {
    if (status === 'COMPLETED' || destinationDone) {
      return 100;
    }
    if (kind === 'STREAK_LOG') {
      const target = durationDays && durationDays > 0 ? durationDays : 7;
      return Math.min(100, Math.round((streakCount / target) * 100));
    }
    if (subtaskTotal <= 0) {
      return SUBTASK_PROGRESS_CAP;
    }
    return Math.min(
      SUBTASK_PROGRESS_CAP,
      Math.round((subtaskDone / subtaskTotal) * SUBTASK_PROGRESS_CAP) +
        (destinationDone ? DESTINATION_PROGRESS : 0),
    );
  }

  private journeyDueOnDate(
    kind: string,
    commitmentLevel: number,
    date: string,
    journeyDates: string[],
    lastStreakLog: string | null,
  ): boolean {
    if (kind === 'STREAK_LOG') {
      return lastStreakLog !== date;
    }
    if (journeyDates.includes(date)) {
      return false;
    }
    const weekDates = this.time.weekDates(date);
    const loggedThisWeek = journeyDates.filter((d) => weekDates.includes(d))
      .length;
    return loggedThisWeek < this.clampCommitment(commitmentLevel);
  }

  private weekView(
    today: string,
    commitmentLevel: number,
    journeyDates: string[],
  ) {
    const dates = this.time.weekDates(today);
    const logged = dates.filter((d) => journeyDates.includes(d)).length;
    return {
      start: dates[0],
      dates: dates.map((date) => ({
        date,
        logged: journeyDates.includes(date),
        isToday: date === today,
      })),
      expected: this.clampCommitment(commitmentLevel),
      logged,
    };
  }

  private normalizeSubtasks(
    raw?: Array<string | SubtaskInput>,
  ): Array<{
    id?: number;
    title: string;
    gatesJourney: boolean;
    deadline: string | null;
    estimateMinutes: number | null;
  }> {
    return (raw ?? [])
      .map((row) =>
        typeof row === 'string'
          ? {
              title: row.trim(),
              gatesJourney: false,
              deadline: null,
              estimateMinutes: null,
            }
          : {
              id: row.id,
              title: String(row.title || '').trim(),
              gatesJourney: Boolean(row.gatesJourney),
              deadline: this.parseDeadline(row.deadline),
              estimateMinutes: this.normalizeEstimateMinutes(
                row.estimateMinutes,
              ),
            },
      )
      .filter((row) => row.title)
      .slice(0, 24);
  }

  private normalizeEstimateMinutes(raw?: unknown): number | null {
    if (raw == null || raw === '') {
      return null;
    }
    const minutes = Math.round(Number(raw));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return null;
    }
    return Math.min(24 * 60, minutes);
  }

  private parseDeadline(raw?: string | null): string | null {
    if (raw == null) {
      return null;
    }
    const value = String(raw).trim();
    if (!value) {
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('deadline must be YYYY-MM-DD');
    }
    const [year, month, day] = value.split('-').map(Number);
    const stamp = new Date(Date.UTC(year, month - 1, day));
    if (
      stamp.getUTCFullYear() !== year ||
      stamp.getUTCMonth() + 1 !== month ||
      stamp.getUTCDate() !== day
    ) {
      throw new BadRequestException('deadline is not a valid date');
    }
    return value;
  }

  private missedDays(
    unlockDate: string,
    endDate: string,
    commitmentLevel: number,
    logged: Set<string>,
    today: string,
  ) {
    const yesterday = addDaysIso(today, -1);
    const last = endDate < yesterday ? endDate : yesterday;
    const days = eachDateInclusive(unlockDate, last);
    if (commitmentLevel >= 7) {
      return days
        .filter((date) => !logged.has(date))
        .map((date) => ({ date, reason: 'No daily check-in' }));
    }
    const missed: Array<{ date: string; reason: string }> = [];
    const seenWeeks = new Set<string>();
    for (const date of days) {
      const week = this.time.weekDates(date);
      const key = week[0];
      if (seenWeeks.has(key)) {
        continue;
      }
      seenWeeks.add(key);
      const weekEnd = week[6] < last ? week[6] : last;
      const elapsed = week.filter((d) => d >= week[0] && d <= weekEnd);
      const loggedInWeek = elapsed.filter((d) => logged.has(d)).length;
      const shortfall = Math.max(0, commitmentLevel - loggedInWeek);
      if (shortfall <= 0) {
        continue;
      }
      const empty = elapsed.filter((d) => !logged.has(d)).slice(-shortfall);
      for (const d of empty) {
        missed.push({ date: d, reason: `Below ${commitmentLevel}× weekly commitment` });
      }
    }
    return missed;
  }

  private buildChronicle(input: {
    kind: string;
    journeyLabel: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    destinationDone: boolean;
    subtasks: Array<{
      title: string;
      completed: boolean;
      completedAt: string | null;
      completedAtLabel: string | null;
      completedDate: string | null;
      completionOrder: number | null;
      gatesJourney: boolean;
      elapsedMs?: number;
    }>;
    journeyLogs: Array<{ date: string; note: string | null; createdAt: Date }>;
    missedDays: Array<{ date: string; reason: string }>;
    streakLogs: Array<{ date: string; result: string; createdAt?: Date }>;
  }) {
    const events: Array<{
      kind: string;
      at: string;
      atLabel: string;
      date: string;
      title: string;
      order: number | null;
    }> = [];
    if (input.startedAt) {
      const stamp = this.time.stamp(input.startedAt);
      events.push({
        kind: 'started',
        at: stamp.iso,
        atLabel: stamp.label,
        date: stamp.date,
        title: 'Quest started',
        order: null,
      });
    }
    for (const s of input.subtasks) {
      if (s.completed && s.completedAt) {
        events.push({
          kind: 'subtask',
          at: s.completedAt,
          atLabel: s.completedAtLabel ?? s.completedAt,
          date: s.completedDate ?? s.completedAt.slice(0, 10),
          title: `${s.gatesJourney ? `${s.title} (unlocked daily check-in)` : s.title}${
            s.elapsedMs && s.elapsedMs > 0
              ? ` · ${this.formatElapsedShort(s.elapsedMs)}`
              : ''
          }`,
          order: s.completionOrder,
        });
        continue;
      }
      if (s.elapsedMs && s.elapsedMs > 0) {
        const stamp = this.time.stamp();
        events.push({
          kind: 'progress',
          at: stamp.iso,
          atLabel: stamp.label,
          date: stamp.date,
          title: `${s.title} · ${this.formatElapsedShort(s.elapsedMs)} so far`,
          order: null,
        });
      }
    }
    for (const log of input.journeyLogs) {
      const stamp = this.time.stamp(log.createdAt);
      events.push({
        kind: 'journey',
        at: stamp.iso,
        atLabel: stamp.label,
        date: log.date,
        title: log.note || input.journeyLabel || 'Daily check-in',
        order: null,
      });
    }
    for (const log of input.streakLogs) {
      const stamp = this.time.stamp(log.createdAt ?? `${log.date}T12:00:00`);
      events.push({
        kind: log.result === 'BROKEN' ? 'broken' : 'clean',
        at: stamp.iso,
        atLabel: stamp.label,
        date: log.date,
        title: log.result,
        order: null,
      });
    }
    for (const miss of input.missedDays) {
      events.push({
        kind: 'missed',
        at: `${miss.date}T23:59:59.000Z`,
        atLabel: `${miss.date} — missed`,
        date: miss.date,
        title: miss.reason,
        order: null,
      });
    }
    if (input.completedAt && input.destinationDone) {
      const stamp = this.time.stamp(input.completedAt);
      events.push({
        kind: 'destination',
        at: stamp.iso,
        atLabel: stamp.label,
        date: stamp.date,
        title: 'Destination completed',
        order: null,
      });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  private coverUrl(coverImage: string | null): string | null {
    if (!coverImage) {
      return null;
    }
    if (coverImage.startsWith('user:')) {
      return `/uploads/quests/${coverImage.slice(5)}`;
    }
    return `/assets/images/quests/${coverImage}`;
  }

  private async saveCover(questId: number, dataUrl: string): Promise<string> {
    const match =
      /^data:(image\/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i.exec(
        dataUrl,
      );
    if (!match) {
      throw new BadRequestException(
        'Cover must be a PNG, JPEG, WebP, or GIF image',
      );
    }
    const mime = match[1].toLowerCase();
    const buffer = Buffer.from(match[3], 'base64');
    if (buffer.length > MAX_COVER_BYTES) {
      throw new BadRequestException('Cover image is too large (max 4MB)');
    }
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'jpg';
    const dir = join(process.cwd(), 'uploads', 'quests');
    await mkdir(dir, { recursive: true });
    const filename = `${questId}.${ext}`;
    await writeFile(join(dir, filename), buffer);
    return `user:${filename}`;
  }

  private unlocksIndex(
    quests: Array<{
      id: number;
      slug: string;
      name: string;
      questReqsJson: string | null;
    }>,
  ) {
    const map = new Map<
      string,
      Array<{ id: number; slug: string; name: string }>
    >();
    for (const q of quests) {
      const reqs = this.parseJson<string[]>(q.questReqsJson) ?? [];
      for (const slug of reqs) {
        const list = map.get(slug) ?? [];
        list.push({ id: q.id, slug: q.slug, name: q.name });
        map.set(slug, list);
      }
    }
    return map;
  }

  private questNameLookup() {
    // Filled lazily per request via skill map style — names come from questReqs slugs.
    return this._questNames;
  }

  private _questNames = new Map<string, string>();

  private async skillLevelMap() {
    const skills = await this.prisma.skill.findMany({
      select: { slug: true, name: true, level: true },
    });
    const quests = await this.prisma.quest.findMany({
      select: { slug: true, name: true },
    });
    this._questNames = new Map(quests.map((q) => [q.slug, q.name]));
    return new Map(skills.map((s) => [s.slug, { level: s.level, name: s.name }]));
  }

  private async completedQuestSlugs() {
    const rows = await this.prisma.questRun.findMany({
      where: { status: 'COMPLETED' },
      select: { quest: { select: { slug: true } } },
    });
    return new Set(rows.map((r) => r.quest.slug));
  }

  private async featureMap() {
    const rows = await this.prisma.featureUnlock.findMany();
    return new Map(rows.map((r) => [r.key, r.unlocked]));
  }

  private parseXpPlan(raw: string | null): XpPlan {
    const parsed = this.parseJson<XpPlan>(raw);
    return {
      dayXp: parsed?.dayXp?.length ? parsed.dayXp : [0],
      completionBonus: parsed?.completionBonus,
    };
  }

  private normalizeSkillXp(input: CreateQuestInput): {
    totalXp: number;
    weights: QuestSkillWeight[];
    completionBonus: Record<string, number> | undefined;
  } {
    const totalXp = Math.max(0, Math.round(Number(input.totalXp) || 0));
    const raw = (input.skillWeights ?? []).map((w) => ({
      slug: String(w.slug || '').trim(),
      weight: Math.round(Number(w.weight) || 0),
    }));
    const weights = raw.filter((w) => w.slug && w.weight > 0);
    const slugs = new Set(weights.map((w) => w.slug));
    if (slugs.size !== weights.length) {
      throw new BadRequestException('Each integrated skill can appear only once');
    }
    if (weights.length === 0) {
      if (input.completionBonus) {
        return { totalXp, weights, completionBonus: input.completionBonus };
      }
      return { totalXp: 0, weights: [], completionBonus: undefined };
    }
    const sum = weights.reduce((n, w) => n + w.weight, 0);
    if (sum !== QUEST_WEIGHT_TOTAL) {
      throw new BadRequestException(
        `Skill weights must sum to ${QUEST_WEIGHT_TOTAL} (currently ${sum})`,
      );
    }
    const shares = splitQuestXp(totalXp, weights);
    return {
      totalXp,
      weights,
      completionBonus: sharesToBonus(shares),
    };
  }

  private skillShares(
    totalXp: number,
    skillWeightsJson: string | null,
    fallbackBonus: Record<string, number> | undefined,
    skillLevels?: Map<string, { level: number; name: string }>,
  ): Array<QuestSkillShare & { name: string }> {
    const stored = this.parseJson<QuestSkillWeight[]>(skillWeightsJson) ?? [];
    let shares = splitQuestXp(totalXp, stored);
    if (shares.length === 0 && fallbackBonus) {
      const entries = Object.entries(fallbackBonus).filter(([, xp]) => xp > 0);
      const pool = entries.reduce((n, [, xp]) => n + xp, 0);
      shares = entries.map(([slug, xp]) => ({
        slug,
        weight: pool > 0 ? Math.round((xp / pool) * QUEST_WEIGHT_TOTAL) : 0,
        xp,
      }));
    }
    return shares.map((s) => ({
      ...s,
      name: skillLevels?.get(s.slug)?.name ?? s.slug,
    }));
  }

  private parseJson<T>(raw: string | null): T | null {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  private clampCommitment(n?: number): number {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) {
      return 7;
    }
    return Math.min(7, Math.max(1, v));
  }

  private localToday(): string {
    return this.time.today();
  }

  private formatElapsedShort(ms: number): string {
    return formatElapsedShort(ms);
  }

  private offsetDate(iso: string, days: number): string {
    return addDaysIso(iso, days);
  }
}
