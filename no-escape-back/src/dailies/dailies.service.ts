import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  CharacterService,
} from '../character/character.service';
import { HabitsService } from '../habits/habits.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { TimeService } from '../time/time.service';
import { formatElapsedShort } from '../time/zone';
import {
  billedDurationMinutes,
  calculateDailyTaskXp,
  DAILY_SLOT_COUNTS,
  DAILY_SLOT_MAXIMUMS,
  effortXpPerMinute,
  IMPORTANCE_ORDER,
  TaskImportance,
} from '../xp/daily-xp.util';
import {
  parseSkillWeights,
  splitQuestXp,
  validateSkillWeights,
  type QuestSkillWeight,
} from '../xp/quest-xp.util';
import { boostsWealth, parseRewardCents } from '../wealth/money.util';
import { WorkIntervalsService } from '../work-intervals/work-intervals.service';
import { QuestsService } from '../quests/quests.service';
import { findActiveScriptoriumDailies } from '../scriptorium/scriptorium-lock.util';
import { scoreDailyTasks, toneFromGrade, type DayGrade, type DayScore } from './day-score.util';
import { CopyIncompleteDto } from './dto/copy-incomplete.dto';
import { UpsertDailyTaskDto } from './dto/upsert-daily-task.dto';

type SkillSnap = {
  id: number;
  name: string;
  slug: string;
  category: string;
  icon: string | null;
  level: number;
};

type EnrichedTask = {
  id: number | null;
  date: string;
  importance: TaskImportance;
  slotIndex: number;
  title: string;
  skillId: number | null;
  skill: SkillSnap | null;
  habitId: number | null;
  fixedXp: number | null;
  effortLevel: number;
  durationMinutes: number;
  elapsedMs: number;
  completed: boolean;
  xpAwarded: number | null;
  activityId: number | null;
  completedAt: Date | string | null;
  isFilled: boolean;
  isEmpty: boolean;
  projectedXp: number;
  breakdown: {
    billedMinutes: number;
    xpPerMinute: number;
  } | null;
  skillWeights: QuestSkillWeight[];
  skillShares: Array<{
    slug: string;
    name: string;
    weight: number;
    xp: number;
  }>;
  wealthCents: number;
  wealthAwardedCents: number | null;
  questId: number | null;
  questRunId: number | null;
  questSubtaskId: number | null;
  questBindKind: string | null;
  scriptoriumWorkId: number | null;
};

type BoardSnapshot = {
  date: string;
  capacity: number;
  filledCount: number;
  completedCount: number;
  isEmpty: boolean;
  projectedXp: number;
  earnedXp: number;
  tiers: Array<{
    importance: TaskImportance;
    label: string;
    baseXp: number;
    capacity: number;
    filled: number;
    completed: number;
    projectedXp: number;
    earnedXp: number;
    slots: EnrichedTask[];
  }>;
};

type LogSnapshot = {
  board: BoardSnapshot;
  skillTree: unknown;
};

@Injectable()
export class DailiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
    private readonly habitsService: HabitsService,
    private readonly characterService: CharacterService,
    private readonly time: TimeService,
    private readonly workIntervals: WorkIntervalsService,
    @Inject(forwardRef(() => QuestsService))
    private readonly quests: QuestsService,
  ) {}

  async getBoard(date?: string) {
    const requestedDate = this.normalizeDate(date);
    const today = this.localToday();
    const pendingSealDate =
      await this.findOldestPendingSealBefore(requestedDate);

    // Landing on today still forces an unsealed prior day; picking a past date stays there.
    const sealRequired = Boolean(
      pendingSealDate && requestedDate === today,
    );
    const day =
      sealRequired && pendingSealDate ? pendingSealDate : requestedDate;

    const board = await this.buildBoard(day);
    const sealed = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    const lastLog = await this.prisma.dailyLog.findFirst({
      where: { date: { lt: day } },
      orderBy: { date: 'desc' },
    });

    let incompleteInLastLog = 0;
    let copyableCount = 0;
    if (lastLog) {
      const snap = this.parseSnapshot(lastLog.snapshotJson);
      const incomplete = this.collectIncomplete(snap);
      incompleteInLastLog = incomplete.length;
      copyableCount = incomplete.filter((task) => {
        const slot = board.tiers
          .find((tier) => tier.importance === task.importance)
          ?.slots.find((s) => s.slotIndex === task.slotIndex);
        return !slot?.isFilled;
      }).length;
    }

    const activeLogDate = await this.resolveActiveLogDate(today);
    const isEditable = !sealed;

    return {
      ...board,
      date: day,
      requestedDate,
      pendingSealDate,
      sealRequired,
      isSealed: Boolean(sealed),
      lastLogDate: lastLog?.date ?? null,
      activeLogDate,
      isEditable,
      readOnly: !isEditable,
      canCopyIncomplete:
        copyableCount > 0 && isEditable && !lastLog?.incompletesCarried,
      incompleteInLastLog,
      isBaseFilled: this.isBaseBoardFilled(board),
      canAddRegular:
        isEditable &&
        (board.tiers.find((t) => t.importance === 'REGULAR')?.capacity ?? 0) <
          DAILY_SLOT_MAXIMUMS.REGULAR,
      verdict: sealed
        ? this.verdictFromLog(sealed)
        : this.scoreBoard(board),
    };
  }

  async listLogs() {
    const logs = await this.prisma.dailyLog.findMany({
      orderBy: { date: 'desc' },
      take: 60,
    });
    return logs.map((log) => {
      const verdict = this.verdictFromLog(log);
      return {
        id: log.id,
        date: log.date,
        sealedAt: log.sealedAt,
        filledCount: log.filledCount,
        completedCount: log.completedCount,
        earnedXp: log.earnedXp,
        projectedXp: log.projectedXp,
        assignedMinutes: verdict.assignedMinutes,
        trackedCount: verdict.trackedCount,
        score: verdict.score,
        grade: verdict.grade,
        tone: verdict.tone,
        verdict: verdict.label,
        summary: verdict.summary,
      };
    });
  }

  async getLog(date: string) {
    const day = this.normalizeDate(date);
    const log = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (!log) {
      throw new NotFoundException(`No daily log for ${day}`);
    }
    const verdict = this.verdictFromLog(log);
    return {
      id: log.id,
      date: log.date,
      sealedAt: log.sealedAt,
      filledCount: log.filledCount,
      completedCount: log.completedCount,
      earnedXp: log.earnedXp,
      projectedXp: log.projectedXp,
      assignedMinutes: verdict.assignedMinutes,
      trackedCount: verdict.trackedCount,
      score: verdict.score,
      grade: verdict.grade,
      tone: verdict.tone,
      verdict: verdict.label,
      summary: verdict.summary,
      snapshot: this.parseSnapshot(log.snapshotJson),
    };
  }

  async sealDay(date?: string) {
    const day = this.normalizeDate(date);
    return this.sealDate(day, true);
  }

  async unsealDay(date?: string) {
    const day = this.normalizeDate(date);
    const log = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (!log) {
      throw new NotFoundException(`No sealed daily log for ${day}`);
    }
    await this.prisma.dailyLog.delete({ where: { date: day } });
    return this.getBoard(day);
  }

  async copyIncomplete(dto: CopyIncompleteDto) {
    const targetDate = this.normalizeDate(dto.date);
    await this.assertMutableDay(targetDate);

    let sourceLog = dto.sourceDate
      ? await this.prisma.dailyLog.findUnique({
          where: { date: this.normalizeDate(dto.sourceDate) },
        })
      : await this.prisma.dailyLog.findFirst({
          where: { date: { lt: targetDate } },
          orderBy: { date: 'desc' },
        });

    if (!sourceLog) {
      throw new NotFoundException('No sealed daily log to copy from');
    }

    const snap = this.parseSnapshot(sourceLog.snapshotJson);
    const incomplete = this.collectIncomplete(snap);
    if (incomplete.length === 0) {
      throw new BadRequestException('Last log has no incomplete dailies to copy');
    }

    let copied = 0;
    for (const task of incomplete) {
      const existing = await this.prisma.dailyTask.findUnique({
        where: {
          date_importance_slotIndex: {
            date: targetDate,
            importance: task.importance,
            slotIndex: task.slotIndex,
          },
        },
      });
      if (existing?.title.trim() && existing.skillId) {
        continue;
      }
      if (!task.title.trim()) {
        continue;
      }
      const copiedWeights = this.taskWeights(task);
      if (!task.skillId && copiedWeights.length === 0) {
        continue;
      }

      await this.prisma.dailyTask.upsert({
        where: {
          date_importance_slotIndex: {
            date: targetDate,
            importance: task.importance,
            slotIndex: task.slotIndex,
          },
        },
        create: {
          date: targetDate,
          importance: task.importance,
          slotIndex: task.slotIndex,
          title: task.title,
          skillId: task.skillId,
          skillWeightsJson: copiedWeights.length
            ? JSON.stringify(copiedWeights)
            : null,
          habitId: task.habitId ?? null,
          fixedXp: null,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
          elapsedMs: BigInt(Math.max(0, Math.round(Number(task.elapsedMs) || 0))),
          completed: false,
          xpAwarded: null,
          completedAt: null,
          wealthCents: task.wealthCents ?? 0,
          wealthAwardedCents: null,
          questId: task.questId ?? null,
          questRunId: task.questRunId ?? null,
          questSubtaskId: task.questSubtaskId ?? null,
          questBindKind: task.questBindKind ?? null,
          scriptoriumWorkId: task.scriptoriumWorkId ?? null,
        },
        update: {
          title: task.title,
          skillId: task.skillId,
          skillWeightsJson: copiedWeights.length
            ? JSON.stringify(copiedWeights)
            : null,
          habitId: task.habitId ?? null,
          fixedXp: null,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
          elapsedMs: BigInt(Math.max(0, Math.round(Number(task.elapsedMs) || 0))),
          completed: false,
          xpAwarded: null,
          completedAt: null,
          wealthCents: task.wealthCents ?? 0,
          wealthAwardedCents: null,
          questId: task.questId ?? null,
          questRunId: task.questRunId ?? null,
          questSubtaskId: task.questSubtaskId ?? null,
          questBindKind: task.questBindKind ?? null,
          scriptoriumWorkId: task.scriptoriumWorkId ?? null,
        },
      });
      copied += 1;
    }

    await this.prisma.dailyLog.update({
      where: { date: sourceLog.date },
      data: { incompletesCarried: true },
    });

    return {
      sourceDate: sourceLog.date,
      targetDate,
      copied,
      board: await this.getBoard(targetDate),
    };
  }

  async calendar(from: string, to: string) {
    const start = this.normalizeDate(from);
    const end = this.normalizeDate(to);
    const today = this.localToday();
    const [logs, tasks] = await Promise.all([
      this.prisma.dailyLog.findMany({
        where: { date: { gte: start, lte: end } },
        select: {
          date: true,
          filledCount: true,
          completedCount: true,
          incompletesCarried: true,
          score: true,
          grade: true,
          verdict: true,
          assignedMinutes: true,
          trackedCount: true,
          snapshotJson: true,
        },
      }),
      this.prisma.dailyTask.findMany({
        where: { date: { gte: start, lte: end } },
        select: { date: true, title: true, skillId: true },
      }),
    ]);

    const filled = new Set<string>();
    for (const task of tasks) {
      if (task.title.trim() && task.skillId) {
        filled.add(task.date);
      }
    }
    const logByDate = new Map(logs.map((log) => [log.date, log]));
    const dates = new Set([...filled, ...logByDate.keys()]);
    const days: Array<{
      date: string;
      status: 'sealed' | 'abandoned' | 'open';
      grade?: DayGrade;
      score?: number;
      tone?: DayScore['tone'];
    }> = [];

    for (const date of dates) {
      const log = logByDate.get(date);
      if (log) {
        const leftover =
          log.completedCount < log.filledCount && !log.incompletesCarried;
        const verdict = this.verdictFromLog(log);
        days.push({
          date,
          status: leftover ? 'abandoned' : 'sealed',
          grade: verdict.grade,
          score: verdict.score,
          tone: verdict.tone,
        });
        continue;
      }
      if (date < today) {
        days.push({ date, status: 'open' });
      }
    }

    return days.sort((a, b) => a.date.localeCompare(b.date));
  }

  async upsertSlot(dto: UpsertDailyTaskDto) {
    this.assertImportance(dto.importance);
    this.assertSlotIndex(dto.importance, dto.slotIndex);
    const day = this.normalizeDate(dto.date);
    await this.assertMutableDay(day);

    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    const plan = await this.resolveSkillPlan({
      skillId: dto.skillId,
      skillWeights: dto.skillWeights,
    });
    const habitId = await this.resolveHabitId(dto.habitId);

    const effortLevel = this.assertEffort(dto.effortLevel);
    const durationMinutes = this.assertDuration(dto.durationMinutes);

    const existing = await this.prisma.dailyTask.findUnique({
      where: {
        date_importance_slotIndex: {
          date: day,
          importance: dto.importance,
          slotIndex: dto.slotIndex,
        },
      },
    });

    if (existing?.completed) {
      throw new BadRequestException('Completed tasks cannot be edited');
    }
    if (existing?.scriptoriumWorkId) {
      throw new BadRequestException(
        'Scriptorium-bound dailies cannot be edited',
      );
    }

    const questId =
      dto.questId != null && Number(dto.questId) > 0
        ? Math.round(Number(dto.questId))
        : null;
    const questSubtaskId =
      dto.questSubtaskId != null && Number(dto.questSubtaskId) > 0
        ? Math.round(Number(dto.questSubtaskId))
        : null;
    const questBindKind = questSubtaskId
      ? 'subtask'
      : questId
        ? 'daily_work'
        : null;
    let questRunId: number | null = null;
    if (questId) {
      const run = await this.prisma.questRun.findFirst({
        where: { questId, status: 'ACTIVE' },
      });
      questRunId = run?.id ?? null;
    }

    const task = await this.prisma.dailyTask.upsert({
      where: {
        date_importance_slotIndex: {
          date: day,
          importance: dto.importance,
          slotIndex: dto.slotIndex,
        },
      },
      create: {
        date: day,
        importance: dto.importance,
        slotIndex: dto.slotIndex,
        title,
        skillId: plan.skillId,
        skillWeightsJson: JSON.stringify(plan.weights),
        habitId,
        fixedXp: null,
        effortLevel,
        durationMinutes,
        wealthCents: boostsWealth(plan.weights)
          ? parseRewardCents(dto.wealthCents)
          : 0,
        questId,
        questSubtaskId,
        questBindKind,
        questRunId,
      },
      update: {
        title,
        skillId: plan.skillId,
        skillWeightsJson: JSON.stringify(plan.weights),
        habitId,
        fixedXp: null,
        effortLevel,
        durationMinutes,
        wealthCents: boostsWealth(plan.weights)
          ? parseRewardCents(dto.wealthCents)
          : 0,
        questId,
        questSubtaskId,
        questBindKind,
        questRunId,
      },
      include: { skill: { select: this.skillSelect() } },
    });

    return this.enrichTask(task);
  }

  async reorderSlot(dto: {
    date?: string;
    from: { importance: TaskImportance; slotIndex: number };
    to: { importance: TaskImportance; slotIndex: number };
  }) {
    this.assertImportance(dto.from.importance);
    this.assertImportance(dto.to.importance);
    this.assertSlotIndex(dto.from.importance, dto.from.slotIndex);
    this.assertSlotIndex(dto.to.importance, dto.to.slotIndex);
    const day = this.normalizeDate(dto.date);
    await this.assertMutableDay(day);

    if (
      dto.from.importance === dto.to.importance &&
      dto.from.slotIndex === dto.to.slotIndex
    ) {
      return this.getBoard(day);
    }

    const fromRow = await this.prisma.dailyTask.findUnique({
      where: {
        date_importance_slotIndex: {
          date: day,
          importance: dto.from.importance,
          slotIndex: dto.from.slotIndex,
        },
      },
    });
    if (!fromRow?.title.trim() || !fromRow.skillId) {
      throw new BadRequestException('No task to move');
    }

    const toRow = await this.prisma.dailyTask.findUnique({
      where: {
        date_importance_slotIndex: {
          date: day,
          importance: dto.to.importance,
          slotIndex: dto.to.slotIndex,
        },
      },
    });

    const tempSlot = 99;
    await this.prisma.$transaction(async (tx) => {
      if (toRow) {
        await tx.dailyTask.update({
          where: { id: fromRow.id },
          data: { slotIndex: tempSlot },
        });
        await tx.dailyTask.update({
          where: { id: toRow.id },
          data: {
            importance: fromRow.importance,
            slotIndex: fromRow.slotIndex,
          },
        });
        await tx.dailyTask.update({
          where: { id: fromRow.id },
          data: {
            importance: toRow.importance,
            slotIndex: toRow.slotIndex,
          },
        });
        return;
      }
      await tx.dailyTask.update({
        where: { id: fromRow.id },
        data: {
          importance: dto.to.importance,
          slotIndex: dto.to.slotIndex,
        },
      });
    });

    return this.getBoard(day);
  }

  /**
   * Add a quest subtask (or the quest's daily-work slice when
   * questSubtaskId is omitted) to today's board. Copies title, skill
   * weights, and expected duration from the quest so the daily needs no
   * further setup, and flags it quest-linked so Horologium can track it as
   * both a daily and a quest task.
   */
  async fromQuest(input: {
    date?: string;
    questId: number;
    questSubtaskId?: number | null;
    importance?: TaskImportance;
    slotIndex?: number;
  }) {
    const day = this.normalizeDate(input.date);
    await this.assertMutableDay(day);

    const questId = Math.round(Number(input.questId));
    if (!Number.isFinite(questId) || questId < 1) {
      throw new BadRequestException('questId is required');
    }
    const quest = await this.prisma.quest.findUnique({ where: { id: questId } });
    if (!quest) {
      throw new NotFoundException(`Quest #${questId} not found`);
    }
    const run = await this.prisma.questRun.findFirst({
      where: { questId, status: 'ACTIVE' },
    });
    if (!run) {
      throw new BadRequestException('Quest is not active');
    }

    let subtask: {
      id: number;
      title: string;
      estimateMinutes: number | null;
    } | null = null;
    if (input.questSubtaskId != null) {
      const subtaskId = Math.round(Number(input.questSubtaskId));
      subtask = await this.prisma.questSubtask.findFirst({
        where: { id: subtaskId, questId },
        select: { id: true, title: true, estimateMinutes: true },
      });
      if (!subtask) {
        throw new NotFoundException(
          `Subtask #${subtaskId} not found on this quest`,
        );
      }
    }

    const bindKind = subtask ? 'subtask' : 'daily_work';
    const existing = await this.prisma.dailyTask.findFirst({
      where: {
        date: day,
        questId,
        questBindKind: bindKind,
        questSubtaskId: subtask ? subtask.id : null,
      },
    });
    if (existing) {
      return this.getBoard(day);
    }

    const title = (
      subtask?.title ||
      quest.dailyWorkTitle ||
      quest.journeyLabel ||
      quest.name
    ).trim();
    const weights =
      this.parseJson<QuestSkillWeight[]>(quest.skillWeightsJson) ?? [];
    const plan = await this.resolveSkillPlan({ skillWeights: weights });
    const durationMinutes = this.assertDuration(
      subtask?.estimateMinutes ?? quest.dailyWorkMinutes ?? 45,
    );

    const target = await this.resolveTargetSlot(
      day,
      input.importance,
      input.slotIndex,
    );

    await this.prisma.dailyTask.create({
      data: {
        date: day,
        importance: target.importance,
        slotIndex: target.slotIndex,
        title,
        skillId: plan.skillId,
        skillWeightsJson: JSON.stringify(plan.weights),
        effortLevel: 5,
        durationMinutes,
        wealthCents: boostsWealth(plan.weights) ? quest.wealthCents ?? 0 : 0,
        questId,
        questRunId: run.id,
        questSubtaskId: subtask?.id ?? null,
        questBindKind: bindKind,
      },
    });

    return this.getBoard(day);
  }

  /**
   * Scriptorium catalogue → today's board. Copies title, skills, effort, and
   * volume from the folio and locks it until the daily is completed or the
   * day is sealed without a carry-over.
   */
  async fromScriptorium(input: {
    date?: string;
    workId: number;
    importance?: TaskImportance;
    slotIndex?: number;
  }) {
    const day = this.normalizeDate(input.date);
    await this.assertMutableDay(day);

    const workId = Math.round(Number(input.workId));
    if (!Number.isFinite(workId) || workId < 1) {
      throw new BadRequestException('workId is required');
    }
    const work = await this.prisma.scriptoriumWork.findUnique({
      where: { id: workId },
    });
    if (!work) {
      throw new NotFoundException(`Scriptorium work #${workId} not found`);
    }
    if (work.status === 'ARCHIVED') {
      throw new BadRequestException('Shelved folios cannot be assigned');
    }
    if (work.questId) {
      throw new BadRequestException(
        'This folio is already assigned to a quest',
      );
    }

    const binds = await findActiveScriptoriumDailies(this.prisma, [workId]);
    const bind = binds.get(workId);
    if (bind) {
      if (bind.date === day) {
        return this.getBoard(day);
      }
      throw new BadRequestException(
        'This folio is already assigned to a daily',
      );
    }

    const weights = parseSkillWeights(
      work.skillWeightsJson ? JSON.parse(work.skillWeightsJson) : [],
    );
    if (weights.length === 0) {
      throw new BadRequestException(
        'Assign skills on the folio before binding it to a daily',
      );
    }
    const plan = await this.resolveSkillPlan({ skillWeights: weights });
    const durationMinutes = this.assertDuration(work.durationMinutes ?? 45);
    const target = await this.resolveTargetSlot(
      day,
      input.importance,
      input.slotIndex,
    );

    await this.prisma.dailyTask.create({
      data: {
        date: day,
        importance: target.importance,
        slotIndex: target.slotIndex,
        title: work.title,
        skillId: plan.skillId,
        skillWeightsJson: JSON.stringify(plan.weights),
        effortLevel: work.effort,
        durationMinutes,
        scriptoriumWorkId: workId,
      },
    });

    return this.getBoard(day);
  }

  /**
   * Quest log → today's board. No-op when that day is already sealed.
   * Creates the bound slot if missing, then marks it complete/open.
   */
  async mirrorQuestCompletion(input: {
    questId: number;
    date: string;
    subtaskId: number | null;
    completed: boolean;
  }): Promise<void> {
    const day = this.normalizeDate(input.date);
    const sealed = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (sealed) {
      return;
    }
    const bindKind = input.subtaskId ? 'subtask' : 'daily_work';
    let task = await this.prisma.dailyTask.findFirst({
      where: {
        date: day,
        questId: input.questId,
        questBindKind: bindKind,
        questSubtaskId: input.subtaskId,
      },
    });
    if (!task && input.completed) {
      if (input.subtaskId == null) {
        const quest = await this.prisma.quest.findUnique({
          where: { id: input.questId },
          select: { dailyWorkTitle: true },
        });
        if (!quest?.dailyWorkTitle) {
          return;
        }
      }
      try {
        await this.fromQuest({
          date: day,
          questId: input.questId,
          questSubtaskId: input.subtaskId,
        });
        task = await this.prisma.dailyTask.findFirst({
          where: {
            date: day,
            questId: input.questId,
            questBindKind: bindKind,
            questSubtaskId: input.subtaskId,
          },
        });
      } catch {
        return;
      }
    }
    if (!task) {
      return;
    }
    if (input.completed && !task.completed) {
      if (!task.title.trim() || !task.skillId) {
        await this.prisma.dailyTask.update({
          where: { id: task.id },
          data: { completed: true, completedAt: new Date() },
        });
        return;
      }
      await this.complete(task.id, { skipQuest: true });
      return;
    }
    if (!input.completed && task.completed) {
      await this.uncomplete(task.id, { skipQuest: true });
    }
  }

  private async resolveTargetSlot(
    day: string,
    importance?: TaskImportance,
    slotIndex?: number,
  ): Promise<{ importance: TaskImportance; slotIndex: number }> {
    if (importance != null && Number.isInteger(slotIndex)) {
      this.assertImportance(importance);
      this.assertSlotIndex(importance, slotIndex as number);
      const existing = await this.prisma.dailyTask.findUnique({
        where: {
          date_importance_slotIndex: {
            date: day,
            importance,
            slotIndex: slotIndex as number,
          },
        },
      });
      if (existing?.title?.trim()) {
        throw new BadRequestException('That slot is already filled');
      }
      return { importance, slotIndex: slotIndex as number };
    }
    const regularTasks = await this.prisma.dailyTask.findMany({
      where: { date: day, importance: 'REGULAR' },
      select: { slotIndex: true, title: true },
    });
    const capacity = this.tierCapacity('REGULAR', regularTasks);
    const filledIdx = new Set(
      regularTasks.filter((t) => t.title.trim()).map((t) => t.slotIndex),
    );
    for (let i = 0; i < capacity; i += 1) {
      if (!filledIdx.has(i)) {
        return { importance: 'REGULAR', slotIndex: i };
      }
    }
    if (capacity >= DAILY_SLOT_MAXIMUMS.REGULAR) {
      throw new BadRequestException(
        'No empty Regular slot — free one or raise the cap first',
      );
    }
    return { importance: 'REGULAR', slotIndex: capacity };
  }

  async listTemplates() {
    const rows = await this.prisma.dailyTaskTemplate.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: this.templateInclude(),
    });
    const catalog = await this.skillCatalog();
    return rows.map((row) => this.serializeTemplate(row, catalog));
  }

  async createTemplate(input: {
    name: string;
    icon?: string;
    skillId?: number;
    skillWeights?: Array<{ slug: string; weight: number }>;
    habitId?: number | null;
    effortLevel?: number;
    durationMinutes?: number;
    wealthCents?: number | null;
  }) {
    const data = await this.buildTemplateData(input);
    const existing = await this.prisma.dailyTaskTemplate.findFirst({
      where: { name: data.name, active: true },
    });
    if (existing) {
      return this.updateTemplate(existing.id, input);
    }
    const created = await this.prisma.dailyTaskTemplate.create({
      data: {
        ...data,
        fixedXp: 0,
        createdByUser: true,
        sortOrder: 100,
      },
      include: this.templateInclude(),
    });
    return this.serializeTemplate(created);
  }

  async updateTemplate(
    id: number,
    input: {
      name?: string;
      icon?: string;
      skillId?: number;
      skillWeights?: Array<{ slug: string; weight: number }>;
      habitId?: number | null;
      effortLevel?: number;
      durationMinutes?: number;
      wealthCents?: number | null;
    },
  ) {
    const row = await this.prisma.dailyTaskTemplate.findUnique({
      where: { id },
    });
    if (!row || !row.active) {
      throw new NotFoundException(`Template #${id} not found`);
    }

    const name = input.name != null ? input.name.trim() : row.name;
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const plan = await this.resolveSkillPlan({
      skillId: input.skillId ?? row.skillId,
      skillWeights:
        input.skillWeights ?? this.parseJson(row.skillWeightsJson),
    });

    const habitId =
      input.habitId === undefined
        ? row.habitId
        : await this.resolveHabitId(input.habitId);

    const updated = await this.prisma.dailyTaskTemplate.update({
      where: { id },
      data: {
        name,
        icon:
          input.icon != null ? input.icon.trim() || '◆' : row.icon,
        skillId: plan.skillId,
        skillWeightsJson: JSON.stringify(plan.weights),
        habitId,
        effortLevel:
          input.effortLevel != null
            ? this.assertEffort(input.effortLevel)
            : row.effortLevel,
        durationMinutes:
          input.durationMinutes != null
            ? this.assertDuration(input.durationMinutes)
            : row.durationMinutes,
        wealthCents:
          input.wealthCents !== undefined
            ? boostsWealth(plan.weights)
              ? parseRewardCents(input.wealthCents)
              : 0
            : boostsWealth(plan.weights)
              ? row.wealthCents
              : 0,
        fixedXp: 0,
      },
      include: this.templateInclude(),
    });
    return this.serializeTemplate(updated);
  }

  async removeTemplate(id: number) {
    const row = await this.prisma.dailyTaskTemplate.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Template #${id} not found`);
    }
    if (!row.createdByUser) {
      // Soft-hide seeded presets instead of hard delete.
      await this.prisma.dailyTaskTemplate.update({
        where: { id },
        data: { active: false },
      });
      return { deleted: true, id, soft: true };
    }
    await this.prisma.dailyTaskTemplate.delete({ where: { id } });
    return { deleted: true, id, soft: false };
  }

  async logQuick(input: {
    title?: string;
    skillId?: number;
    skillWeights?: Array<{ slug: string; weight: number }>;
    effortLevel?: number;
    durationMinutes?: number;
    templateId?: number | null;
    wealthCents?: number | null;
  }) {
    const title = String(input.title ?? '').trim().slice(0, 120);
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    const plan = await this.resolveSkillPlan({
      skillId: input.skillId,
      skillWeights: input.skillWeights,
    });
    const effortLevel = Math.min(10, Math.max(1, Math.round(Number(input.effortLevel) || 5)));
    const durationMinutes = billedDurationMinutes(
      Math.max(1, Math.round(Number(input.durationMinutes) || 5)),
    );
    const xp = calculateDailyTaskXp({ effortLevel, durationMinutes });
    const catalog = await this.skillCatalog();
    const shares = splitQuestXp(xp, plan.weights);
    const note = `Quick: ${title}`;
    const primarySlug = plan.weights.length
      ? plan.weights.reduce((best, row) =>
          row.weight > best.weight ? row : best,
        ).slug
      : '';
    const primary = catalog.get(primarySlug);

    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];
    try {
      for (const share of shares) {
        if (share.xp <= 0) {
          continue;
        }
        const skill = catalog.get(share.slug);
        if (!skill) {
          throw new BadRequestException(`Unknown skill '${share.slug}'`);
        }
        awards.push(
          await this.skillsService.awardXp(skill.id, {
            xpGained: share.xp,
            duration: durationMinutes,
            note,
          }),
        );
      }
    } catch (err) {
      for (const awarded of [...awards].reverse()) {
        await this.skillsService.reverseXp(
          awarded.skill.id,
          awarded.activity.xpGained,
          awarded.activity.id,
        );
      }
      throw err;
    }

    const wealthCents = boostsWealth(plan.weights)
      ? parseRewardCents(input.wealthCents)
      : 0;
    const activityIds = awards.map((a) => a.activity.id);
    const log = await this.prisma.quickTaskLog.create({
      data: {
        date: this.localToday(),
        title,
        icon: primary?.icon ?? null,
        templateId:
          input.templateId != null && Number(input.templateId) > 0
            ? Math.round(Number(input.templateId))
            : null,
        skillWeightsJson: JSON.stringify(plan.weights),
        effortLevel,
        durationMinutes,
        xpAwarded: xp,
        activityIdsJson: activityIds.length ? JSON.stringify(activityIds) : null,
        wealthCents,
      },
    });

    if (wealthCents > 0) {
      await this.characterService.adjustWealth({
        deltaCents: wealthCents,
        note,
        source: 'quick',
        sourceId: log.id,
        date: log.date,
      });
    }

    return {
      log: this.serializeQuickLog(log, catalog),
      award: awards[0] ?? null,
      awards,
    };
  }

  async listQuick(limit = 12) {
    const take = Math.min(40, Math.max(1, Math.round(Number(limit) || 12)));
    const rows = await this.prisma.quickTaskLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    const catalog = await this.skillCatalog();
    return rows.map((row) => this.serializeQuickLog(row, catalog));
  }

  private serializeQuickLog(
    row: {
      id: number;
      date: string;
      title: string;
      icon: string | null;
      templateId: number | null;
      skillWeightsJson: string;
      effortLevel: number;
      durationMinutes: number;
      xpAwarded: number;
      wealthCents: number;
      createdAt: Date;
    },
    catalog: Map<string, { name: string; icon: string | null }>,
  ) {
    const weights = this.taskWeights({ skillWeightsJson: row.skillWeightsJson });
    const skillShares = splitQuestXp(row.xpAwarded, weights).map((share) => ({
      ...share,
      name: catalog.get(share.slug)?.name ?? share.slug,
      icon: catalog.get(share.slug)?.icon ?? null,
    }));
    return {
      id: row.id,
      date: row.date,
      title: row.title,
      icon: row.icon,
      templateId: row.templateId,
      effortLevel: row.effortLevel,
      durationMinutes: row.durationMinutes,
      xpAwarded: row.xpAwarded,
      wealthCents: row.wealthCents,
      createdAt: row.createdAt.toISOString(),
      skillWeights: weights,
      skillShares,
    };
  }

  async clearSlot(id: number) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Daily task #${id} not found`);
    }
    await this.assertMutableDay(task.date);
    if (task.completed) {
      throw new BadRequestException('Completed tasks cannot be cleared');
    }
    await this.prisma.dailyTask.delete({ where: { id } });
    return { ok: true };
  }

  async addRegularSlot(date?: string) {
    const day = this.normalizeDate(date);
    await this.assertMutableDay(day);

    const regularTasks = await this.prisma.dailyTask.findMany({
      where: { date: day, importance: 'REGULAR' },
      select: { slotIndex: true },
    });
    const capacity = this.tierCapacity('REGULAR', regularTasks);
    if (capacity >= DAILY_SLOT_MAXIMUMS.REGULAR) {
      throw new BadRequestException(
        `Regular slots are capped at ${DAILY_SLOT_MAXIMUMS.REGULAR}`,
      );
    }

    const slotIndex = capacity;
    await this.prisma.dailyTask.create({
      data: {
        date: day,
        importance: 'REGULAR',
        slotIndex,
        title: '',
        skillId: null,
        effortLevel: 5,
        durationMinutes: 45,
      },
    });

    return this.getBoard(day);
  }

  async complete(id: number, opts?: { skipQuest?: boolean; elapsedMs?: number }) {
    const task = await this.prisma.dailyTask.findUnique({
      where: { id },
      include: { skill: { select: this.skillSelect() } },
    });

    if (!task) {
      throw new NotFoundException(`Daily task #${id} not found`);
    }
    await this.assertMutableDay(task.date);
    if (task.completed) {
      throw new BadRequestException('Task is already completed');
    }
    if (!task.title.trim() || !task.skillId) {
      throw new BadRequestException(
        'Task must have a title and skill before completing',
      );
    }

    const importance = task.importance as TaskImportance;
    let elapsed = Number(task.elapsedMs ?? 0);
    if (elapsed <= 0 && (opts?.elapsedMs ?? 0) > 0) {
      await this.setElapsed(id, opts!.elapsedMs!, 'manual');
      elapsed = opts!.elapsedMs!;
    }
    const xp = calculateDailyTaskXp({
      importance,
      effortLevel: task.effortLevel,
      durationMinutes: task.durationMinutes,
    });

    const catalog = await this.skillCatalog();
    const weights = this.taskWeights(task);
    const shares = splitQuestXp(xp, weights);
    const note =
      elapsed > 0
        ? `Daily: ${task.title} · tracked ${formatElapsedShort(elapsed)}`
        : `Daily: ${task.title}`;

    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];
    try {
      for (const share of shares) {
        if (share.xp <= 0) {
          continue;
        }
        const skill = catalog.get(share.slug);
        if (!skill) {
          throw new BadRequestException(`Unknown skill '${share.slug}'`);
        }
        awards.push(
          await this.skillsService.awardXp(skill.id, {
            xpGained: share.xp,
            duration: task.durationMinutes,
            note,
          }),
        );
      }
    } catch (err) {
      for (const awarded of [...awards].reverse()) {
        await this.skillsService.reverseXp(
          awarded.skill.id,
          awarded.activity.xpGained,
          awarded.activity.id,
        );
      }
      throw err;
    }

    const activityIds = awards.map((a) => a.activity.id);
    const wealthCents = parseRewardCents(task.wealthCents);
    const updated = await this.prisma.dailyTask.update({
      where: { id },
      data: {
        completed: true,
        xpAwarded: xp,
        activityId: activityIds[0] ?? null,
        activityIdsJson: activityIds.length ? JSON.stringify(activityIds) : null,
        completedAt: new Date(),
        wealthAwardedCents: wealthCents > 0 ? wealthCents : null,
      },
      include: { skill: { select: this.skillSelect() } },
    });

    if (wealthCents > 0) {
      await this.characterService.adjustWealth({
        deltaCents: wealthCents,
        note: `Daily: ${updated.title}`,
        source: 'daily',
        sourceId: updated.id,
        date: updated.date,
      });
    }

    if (updated.habitId) {
      await this.habitsService.markComplete(
        updated.habitId,
        updated.date,
        'daily',
        updated.id,
      );
    }

    if (!opts?.skipQuest) {
      await this.quests.applyDailyProgress({
        questRunId: updated.questRunId,
        questBindKind: updated.questBindKind,
        questSubtaskId: updated.questSubtaskId,
        date: updated.date,
        completed: true,
      });
    }

    if (updated.scriptoriumWorkId) {
      await this.prisma.scriptoriumWork.updateMany({
        where: { id: updated.scriptoriumWorkId },
        data: { status: 'ARCHIVED' },
      });
    }

    return {
      task: this.enrichTask(updated, catalog),
      award: awards[0] ?? null,
      awards,
    };
  }

  async uncomplete(id: number, opts?: { skipQuest?: boolean }) {
    const task = await this.prisma.dailyTask.findUnique({
      where: { id },
      include: { skill: { select: this.skillSelect() } },
    });

    if (!task) {
      throw new NotFoundException(`Daily task #${id} not found`);
    }
    await this.assertMutableDay(task.date);
    if (!task.completed) {
      throw new BadRequestException('Task is not completed');
    }

    const activityIds = this.parseIdList(task.activityIdsJson);
    if (task.activityId != null && !activityIds.includes(task.activityId)) {
      activityIds.unshift(task.activityId);
    }

    const reversals: Awaited<ReturnType<SkillsService['reverseXp']>>[] = [];
    if (activityIds.length) {
      const activities = await this.prisma.activity.findMany({
        where: { id: { in: activityIds } },
      });
      const byId = new Map(activities.map((a) => [a.id, a]));
      for (const id of activityIds) {
        const activity = byId.get(id);
        if (!activity) {
          continue;
        }
        reversals.push(
          await this.skillsService.reverseXp(
            activity.skillId,
            activity.xpGained,
            activity.id,
          ),
        );
      }
    } else if (task.skillId && task.xpAwarded) {
      reversals.push(
        await this.skillsService.reverseXp(
          task.skillId,
          task.xpAwarded,
          task.activityId,
        ),
      );
    } else if (!task.wealthAwardedCents) {
      throw new BadRequestException('Task has no XP award to reverse');
    }

    const awardedWealth = parseRewardCents(task.wealthAwardedCents);
    if (awardedWealth > 0) {
      await this.characterService.adjustWealth({
        deltaCents: -awardedWealth,
        note: `Undo daily: ${task.title}`,
        source: 'daily',
        sourceId: task.id,
        date: task.date,
      });
    }

    const updated = await this.prisma.dailyTask.update({
      where: { id },
      data: {
        completed: false,
        xpAwarded: null,
        activityId: null,
        activityIdsJson: null,
        completedAt: null,
        wealthAwardedCents: null,
      },
      include: { skill: { select: this.skillSelect() } },
    });

    if (updated.habitId) {
      try {
        await this.habitsService.uncomplete(updated.habitId, updated.date);
      } catch {
        /* habit may already be open */
      }
    }

    if (!opts?.skipQuest) {
      await this.quests.applyDailyProgress({
        questRunId: updated.questRunId,
        questBindKind: updated.questBindKind,
        questSubtaskId: updated.questSubtaskId,
        date: updated.date,
        completed: false,
      });
    }

    if (updated.scriptoriumWorkId) {
      await this.prisma.scriptoriumWork.updateMany({
        where: { id: updated.scriptoriumWorkId, status: 'ARCHIVED' },
        data: { status: 'OPEN' },
      });
    }

    return {
      task: this.enrichTask(updated),
      reversal: reversals[0] ?? null,
      reversals,
    };
  }

  /**
   * Absolute elapsed patch from Horologium's task clock (sessio/track bound
   * to this daily). Records the delta as an append-only WorkInterval and, when
   * this daily is quest-linked, projects the same delta onto the subtask's
   * QuestSubtaskCompletion so both logs agree — daily.elapsedMs itself stays
   * the running total callers already read.
   */
  async setElapsed(
    id: number,
    elapsedMs: number,
    clockKind: 'track' | 'manual' = 'track',
  ) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Daily task #${id} not found`);
    }
    await this.assertMutableDay(task.date);
    const ms = Math.max(0, Math.round(Number(elapsedMs) || 0));
    const previousMs = Number(task.elapsedMs ?? 0);
    const delta = ms - previousMs;
    const updated = await this.prisma.dailyTask.update({
      where: { id },
      data: { elapsedMs: BigInt(ms) },
      include: { skill: { select: this.skillSelect() } },
    });
    if (delta > 0) {
      const endedAt = new Date();
      await this.workIntervals.recordFlush(clockKind, delta, endedAt, {
        dailyTaskId: id,
        questId: task.questId ?? undefined,
        questRunId: task.questRunId ?? undefined,
        questSubtaskId: task.questSubtaskId ?? undefined,
      });
      if (task.questSubtaskId && task.questRunId) {
        await this.prisma.questSubtaskCompletion.upsert({
          where: {
            runId_subtaskId: {
              runId: task.questRunId,
              subtaskId: task.questSubtaskId,
            },
          },
          create: {
            runId: task.questRunId,
            subtaskId: task.questSubtaskId,
            done: false,
            elapsedMs: BigInt(delta),
          },
          update: { elapsedMs: { increment: BigInt(delta) } },
        });
      }
    }
    return this.enrichTask(updated);
  }

  async postpone(id: number, targetDateRaw: string) {
    const task = await this.prisma.dailyTask.findUnique({
      where: { id },
      include: { skill: { select: this.skillSelect() } },
    });
    if (!task) {
      throw new NotFoundException(`Daily task #${id} not found`);
    }
    if (task.completed) {
      throw new BadRequestException('Completed tasks cannot be postponed');
    }
    if (!task.title.trim() || !task.skillId) {
      throw new BadRequestException('Only filled tasks can be postponed');
    }

    await this.assertMutableDay(task.date);
    const targetDate = this.normalizeDate(targetDateRaw);
    if (targetDate === task.date) {
      throw new BadRequestException('Pick a different date');
    }
    await this.assertMutableDay(targetDate);

    const importance = task.importance as TaskImportance;
    const targetBoard = await this.buildBoard(targetDate);
    const tier = targetBoard.tiers.find((t) => t.importance === importance);
    if (!tier) {
      throw new BadRequestException('Invalid importance');
    }

    let slotIndex = task.slotIndex;
    const preferred = tier.slots.find((s) => s.slotIndex === slotIndex);
    if (preferred?.isFilled) {
      const free = tier.slots.find((s) => s.isEmpty);
      if (free) {
        slotIndex = free.slotIndex;
      } else if (importance === 'REGULAR') {
        slotIndex = tier.capacity;
        if (slotIndex >= DAILY_SLOT_MAXIMUMS.REGULAR) {
          throw new BadRequestException('No free Regular slots on target date');
        }
      } else {
        throw new BadRequestException('No free slot on target date');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyTask.delete({ where: { id: task.id } });
      await tx.dailyTask.upsert({
        where: {
          date_importance_slotIndex: {
            date: targetDate,
            importance,
            slotIndex,
          },
        },
        create: {
          date: targetDate,
          importance,
          slotIndex,
          title: task.title,
          skillId: task.skillId,
          skillWeightsJson: task.skillWeightsJson,
          habitId: task.habitId ?? null,
          fixedXp: null,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
          elapsedMs: task.elapsedMs ?? BigInt(0),
          completed: false,
          xpAwarded: null,
          activityId: null,
          completedAt: null,
          wealthCents: task.wealthCents ?? 0,
          wealthAwardedCents: null,
          questId: task.questId ?? null,
          questRunId: task.questRunId ?? null,
          questSubtaskId: task.questSubtaskId ?? null,
          questBindKind: task.questBindKind ?? null,
          scriptoriumWorkId: task.scriptoriumWorkId ?? null,
        },
        update: {
          title: task.title,
          skillId: task.skillId,
          skillWeightsJson: task.skillWeightsJson,
          habitId: task.habitId ?? null,
          fixedXp: null,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
          elapsedMs: task.elapsedMs ?? BigInt(0),
          completed: false,
          xpAwarded: null,
          activityId: null,
          completedAt: null,
          wealthCents: task.wealthCents ?? 0,
          wealthAwardedCents: null,
          questId: task.questId ?? null,
          questRunId: task.questRunId ?? null,
          questSubtaskId: task.questSubtaskId ?? null,
          questBindKind: task.questBindKind ?? null,
          scriptoriumWorkId: task.scriptoriumWorkId ?? null,
        },
      });
    });

    return {
      fromDate: task.date,
      toDate: targetDate,
      board: await this.getBoard(task.date),
    };
  }

  /** Oldest prior day that still has filled tasks and is not sealed. */
  private async findOldestPendingSealBefore(day: string): Promise<string | null> {
    const distinct = await this.prisma.dailyTask.findMany({
      where: { date: { lt: day } },
      distinct: ['date'],
      select: { date: true },
      orderBy: { date: 'asc' },
    });

    for (const row of distinct) {
      const existing = await this.prisma.dailyLog.findUnique({
        where: { date: row.date },
      });
      if (existing) {
        continue;
      }
      const prior = await this.buildBoard(row.date);
      if (prior.filledCount > 0) {
        return row.date;
      }
    }
    return null;
  }

  private async sealDate(day: string, requireFilled: boolean) {
    const existing = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (existing) {
      return this.getLog(day);
    }

    const board = await this.buildBoard(day);
    if (requireFilled && board.filledCount === 0) {
      throw new BadRequestException('Nothing to seal — board is empty');
    }
    if (board.filledCount === 0) {
      return null;
    }

    const skillTree = await this.skillsService.findGrouped();
    const snapshot: LogSnapshot = { board, skillTree };
    const verdict = this.scoreBoard(board);

    await this.prisma.dailyLog.create({
      data: {
        date: day,
        filledCount: board.filledCount,
        completedCount: board.completedCount,
        earnedXp: board.earnedXp,
        projectedXp: board.projectedXp,
        snapshotJson: JSON.stringify(snapshot),
        score: verdict.score,
        grade: verdict.grade,
        assignedMinutes: verdict.assignedMinutes,
        trackedCount: verdict.trackedCount,
        verdict: verdict.label,
      },
    });

    return this.getLog(day);
  }

  private async buildBoard(day: string): Promise<BoardSnapshot> {
    const tasks = await this.prisma.dailyTask.findMany({
      where: { date: day },
      include: { skill: { select: this.skillSelect() } },
    });
    const catalog = await this.skillCatalog();

    const byKey = new Map(
      tasks.map((task) => [`${task.importance}:${task.slotIndex}`, task]),
    );

    const tiers = IMPORTANCE_ORDER.map((importance) => {
      const tierTasks = tasks.filter((task) => task.importance === importance);
      const capacity = this.tierCapacity(importance, tierTasks);
      const slots = Array.from({ length: capacity }, (_, slotIndex) => {
        const existing = byKey.get(`${importance}:${slotIndex}`);
        if (!existing) {
          return this.emptySlot(day, importance, slotIndex);
        }
        return this.enrichTask(existing, catalog);
      });

      return {
        importance,
        label: this.importanceLabel(importance),
        baseXp: 0,
        capacity,
        filled: slots.filter((slot) => slot.isFilled).length,
        completed: slots.filter((slot) => slot.completed).length,
        projectedXp: slots.reduce((sum, slot) => sum + (slot.projectedXp ?? 0), 0),
        earnedXp: slots.reduce((sum, slot) => sum + (slot.xpAwarded ?? 0), 0),
        slots,
      };
    });

    const allSlots = tiers.flatMap((tier) => tier.slots);
    const filledCount = allSlots.filter((slot) => slot.isFilled).length;
    const completedCount = allSlots.filter((slot) => slot.completed).length;

    return {
      date: day,
      capacity: 9,
      filledCount,
      completedCount,
      isEmpty: filledCount === 0,
      projectedXp: tiers.reduce((sum, tier) => sum + tier.projectedXp, 0),
      earnedXp: tiers.reduce((sum, tier) => sum + tier.earnedXp, 0),
      tiers,
    };
  }

  private collectIncomplete(snap: LogSnapshot): EnrichedTask[] {
    return snap.board.tiers
      .flatMap((tier) => tier.slots)
      .filter((slot) => slot.isFilled && !slot.completed);
  }

  private parseSnapshot(json: string): LogSnapshot {
    return JSON.parse(json) as LogSnapshot;
  }

  private scoreBoard(board: BoardSnapshot): DayScore {
    const tasks = board.tiers
      .flatMap((tier) => tier.slots)
      .filter((slot) => slot.isFilled);
    return scoreDailyTasks(
      tasks.map((slot) => ({
        importance: slot.importance,
        completed: slot.completed,
        durationMinutes: slot.durationMinutes,
        elapsedMs: slot.elapsedMs,
      })),
    );
  }

  private verdictFromLog(log: {
    verdict?: string | null;
    score?: number | null;
    grade?: string | null;
    filledCount: number;
    completedCount: number;
    assignedMinutes?: number | null;
    trackedCount?: number | null;
    snapshotJson?: string | null;
  }): DayScore {
    const live = log.snapshotJson
      ? this.scoreBoard(this.parseSnapshot(log.snapshotJson).board)
      : scoreDailyTasks([]);
    if (!log.verdict) {
      return live;
    }
    const grade: DayGrade =
      log.grade === 'peak' ||
      log.grade === 'strong' ||
      log.grade === 'average' ||
      log.grade === 'poor'
        ? log.grade
        : live.grade;
    return {
      ...live,
      score: Number(log.score) || live.score,
      grade,
      tone: toneFromGrade(grade),
      label: log.verdict,
      assignedMinutes: Number(log.assignedMinutes) || live.assignedMinutes,
      trackedCount: Number(log.trackedCount) || live.trackedCount,
    };
  }

  private async assertMutableDay(day: string) {
    const sealed = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (sealed) {
      throw new BadRequestException('Day is sealed. Unseal to edit.');
    }
  }

  /** Latest day that may still be edited (pending unsealed day, else today). */
  private async resolveActiveLogDate(today: string): Promise<string> {
    const pending = await this.findOldestPendingSealBefore(
      this.addDaysIso(today, 1),
    );
    return pending ?? today;
  }

  private addDaysIso(iso: string, delta: number): string {
    const next = new Date(`${iso}T12:00:00`);
    next.setDate(next.getDate() + delta);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private enrichTask(
    task: {
      id: number;
      date: string;
      importance: string;
      slotIndex: number;
      title: string;
      skillId: number | null;
      skill: SkillSnap | null;
      habitId?: number | null;
      fixedXp?: number | null;
      skillWeightsJson?: string | null;
      effortLevel: number;
      durationMinutes: number;
      elapsedMs?: bigint | number;
      completed: boolean;
      xpAwarded: number | null;
      activityId?: number | null;
      completedAt: Date | null;
      wealthCents?: number | null;
      wealthAwardedCents?: number | null;
      questId?: number | null;
      questRunId?: number | null;
      questSubtaskId?: number | null;
      questBindKind?: string | null;
      scriptoriumWorkId?: number | null;
    },
    catalog?: Map<string, SkillSnap>,
  ): EnrichedTask {
    const importance = task.importance as TaskImportance;
    const skillWeights = this.taskWeights(task);
    const isFilled = Boolean(task.title.trim() && (task.skillId || skillWeights.length));
    const projectedXp = isFilled
      ? calculateDailyTaskXp({
          importance,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
        })
      : 0;
    const skillShares = splitQuestXp(projectedXp, skillWeights).map((share) => ({
      ...share,
      name:
        catalog?.get(share.slug)?.name ??
        (task.skill?.slug === share.slug ? task.skill.name : share.slug),
    }));

    return {
      ...task,
      elapsedMs: Number(task.elapsedMs ?? 0),
      importance,
      habitId: task.habitId ?? null,
      fixedXp: null,
      activityId: task.activityId ?? null,
      isFilled,
      isEmpty: !isFilled,
      projectedXp,
      breakdown: isFilled
        ? {
            billedMinutes: billedDurationMinutes(task.durationMinutes),
            xpPerMinute: effortXpPerMinute(task.effortLevel),
          }
        : null,
      skillWeights,
      skillShares,
      wealthCents: parseRewardCents(task.wealthCents),
      wealthAwardedCents:
        task.wealthAwardedCents == null
          ? null
          : parseRewardCents(task.wealthAwardedCents),
      questId: task.questId ?? null,
      questRunId: task.questRunId ?? null,
      questSubtaskId: task.questSubtaskId ?? null,
      questBindKind: task.questBindKind ?? null,
      scriptoriumWorkId: task.scriptoriumWorkId ?? null,
    };
  }

  private emptySlot(
    date: string,
    importance: TaskImportance,
    slotIndex: number,
  ): EnrichedTask {
    return {
      id: null,
      date,
      importance,
      slotIndex,
      title: '',
      skillId: null,
      skill: null,
      habitId: null,
      fixedXp: null,
      effortLevel: 5,
      durationMinutes: 45,
      elapsedMs: 0,
      completed: false,
      xpAwarded: null,
      activityId: null,
      completedAt: null,
      isFilled: false,
      isEmpty: true,
      projectedXp: 0,
      breakdown: null,
      skillWeights: [],
      skillShares: [],
      wealthCents: 0,
      wealthAwardedCents: null,
      questId: null,
      questRunId: null,
      questSubtaskId: null,
      questBindKind: null,
      scriptoriumWorkId: null,
    };
  }

  private tierCapacity(
    importance: TaskImportance,
    tierTasks: Array<{ slotIndex: number }>,
  ): number {
    const maxIndex = tierTasks.reduce(
      (max, task) => Math.max(max, task.slotIndex),
      -1,
    );
    return Math.min(
      DAILY_SLOT_MAXIMUMS[importance],
      Math.max(DAILY_SLOT_COUNTS[importance], maxIndex + 1),
    );
  }

  private isBaseBoardFilled(board: BoardSnapshot): boolean {
    const mi = board.tiers.find((t) => t.importance === 'MOST_IMPORTANT');
    const important = board.tiers.find((t) => t.importance === 'IMPORTANT');
    const regular = board.tiers.find((t) => t.importance === 'REGULAR');
    if (!mi || !important || !regular) {
      return false;
    }
    const baseRegularFilled = regular.slots
      .slice(0, DAILY_SLOT_COUNTS.REGULAR)
      .filter((slot) => slot.isFilled).length;
    return (
      mi.filled >= DAILY_SLOT_COUNTS.MOST_IMPORTANT &&
      important.filled >= DAILY_SLOT_COUNTS.IMPORTANT &&
      baseRegularFilled >= DAILY_SLOT_COUNTS.REGULAR
    );
  }

  private skillSelect() {
    return {
      id: true,
      name: true,
      slug: true,
      category: true,
      icon: true,
      level: true,
    } as const;
  }

  private templateInclude() {
    return {
      skill: { select: this.skillSelect() },
      habit: {
        select: { id: true, name: true, icon: true, active: true },
      },
    } as const;
  }

  private serializeTemplate(row: {
    id: number;
    name: string;
    icon: string | null;
    skillId: number;
    skill: SkillSnap;
    skillWeightsJson?: string | null;
    habitId: number | null;
    habit: {
      id: number;
      name: string;
      icon: string | null;
      active: boolean;
    } | null;
    effortLevel: number;
    durationMinutes: number;
    sortOrder: number;
    createdByUser: boolean;
    wealthCents?: number | null;
  },
    catalog?: Map<string, SkillSnap>,
  ) {
    const habitActive = row.habit?.active === true;
    const skillWeights = this.taskWeights({
      skillWeightsJson: row.skillWeightsJson,
      skill: row.skill,
    });
    const skillShares = splitQuestXp(0, skillWeights).map((share) => ({
      ...share,
      name:
        catalog?.get(share.slug)?.name ??
        (share.slug === row.skill.slug ? row.skill.name : share.slug),
    }));
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      skillId: row.skillId,
      skill: row.skill,
      habitId: habitActive ? row.habitId : null,
      habit: habitActive && row.habit
        ? { id: row.habit.id, name: row.habit.name, icon: row.habit.icon }
        : null,
      effortLevel: row.effortLevel,
      durationMinutes: row.durationMinutes,
      sortOrder: row.sortOrder,
      createdByUser: row.createdByUser,
      skillWeights,
      skillShares,
      wealthCents: parseRewardCents(row.wealthCents),
    };
  }

  private async buildTemplateData(input: {
    name: string;
    icon?: string;
    skillId?: number;
    skillWeights?: Array<{ slug: string; weight: number }>;
    habitId?: number | null;
    effortLevel?: number;
    durationMinutes?: number;
    wealthCents?: number | null;
  }) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const plan = await this.resolveSkillPlan({
      skillId: input.skillId,
      skillWeights: input.skillWeights,
    });
    return {
      name,
      icon: input.icon?.trim() || '◆',
      skillId: plan.skillId,
      skillWeightsJson: JSON.stringify(plan.weights),
      habitId: await this.resolveHabitId(input.habitId),
      effortLevel: this.assertEffort(input.effortLevel ?? 5),
      durationMinutes: this.assertDuration(input.durationMinutes ?? 30),
      wealthCents: boostsWealth(plan.weights)
        ? parseRewardCents(input.wealthCents)
        : 0,
    };
  }

  /** Archived or missing habits become no-habit — never cascade-delete the default. */
  private async resolveHabitId(habitId?: number | null): Promise<number | null> {
    if (habitId == null || !Number.isInteger(habitId) || habitId < 1) {
      return null;
    }
    const habit = await this.prisma.habit.findUnique({
      where: { id: habitId },
      select: { id: true, active: true, allowInDailies: true, kind: true },
    });
    if (!habit?.active || habit.allowInDailies === false || habit.kind === 'tally') {
      return null;
    }
    return habit.id;
  }

  private normalizeDate(date?: string): string {
    if (!date) {
      return this.localToday();
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return date;
  }

  /** Civil log day in the player's timezone (respects start-of-day). */
  private localToday(): string {
    return this.time.today();
  }

  private assertImportance(value: string): asserts value is TaskImportance {
    if (!IMPORTANCE_ORDER.includes(value as TaskImportance)) {
      throw new BadRequestException(
        'importance must be MOST_IMPORTANT, IMPORTANT, or REGULAR',
      );
    }
  }

  private assertSlotIndex(importance: TaskImportance, slotIndex: number) {
    const max = DAILY_SLOT_MAXIMUMS[importance];
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= max) {
      throw new BadRequestException(
        `slotIndex for ${importance} must be 0–${max - 1}`,
      );
    }
  }

  private assertEffort(effortLevel: number) {
    if (!Number.isInteger(effortLevel) || effortLevel < 1 || effortLevel > 10) {
      throw new BadRequestException('effortLevel must be an integer from 1 to 10');
    }
    return effortLevel;
  }

  private assertDuration(durationMinutes: number) {
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 24 * 60
    ) {
      throw new BadRequestException('durationMinutes must be between 1 and 1440');
    }
    return Math.floor(durationMinutes);
  }

  private importanceLabel(importance: TaskImportance) {
    switch (importance) {
      case 'MOST_IMPORTANT':
        return 'Most Important';
      case 'IMPORTANT':
        return 'Important';
      case 'REGULAR':
        return 'Regular';
    }
  }

  private async skillCatalog(): Promise<Map<string, SkillSnap>> {
    const rows = await this.prisma.skill.findMany({
      select: this.skillSelect(),
    });
    return new Map(rows.map((row) => [row.slug, row]));
  }

  private parseJson<T>(raw: string | null | undefined): T | null {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private parseIdList(raw: string | null | undefined): number[] {
    const parsed = this.parseJson<unknown>(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((id) => Math.round(Number(id) || 0))
      .filter((id) => id > 0);
  }

  private taskWeights(task: {
    skillWeightsJson?: string | null;
    skillWeights?: QuestSkillWeight[] | null;
    skill?: { slug: string } | null;
  }): QuestSkillWeight[] {
    if (task.skillWeights?.length) {
      return parseSkillWeights(task.skillWeights);
    }
    const stored = parseSkillWeights(this.parseJson(task.skillWeightsJson));
    if (stored.length) {
      return stored;
    }
    if (task.skill?.slug) {
      return [{ slug: task.skill.slug, weight: 10 }];
    }
    return [];
  }

  private async resolveSkillPlan(input: {
    skillId?: number | null;
    skillWeights?: unknown;
  }): Promise<{ skillId: number; weights: QuestSkillWeight[] }> {
    const catalog = await this.prisma.skill.findMany({
      select: this.skillSelect(),
    });
    const bySlug = new Map(catalog.map((s) => [s.slug, s]));
    const byId = new Map(catalog.map((s) => [s.id, s]));

    const hasWeights =
      Array.isArray(input.skillWeights) && input.skillWeights.length > 0;
    if (hasWeights) {
      const { weights, error } = validateSkillWeights(input.skillWeights);
      if (error) {
        throw new BadRequestException(error);
      }
      for (const weight of weights) {
        if (!bySlug.has(weight.slug)) {
          throw new BadRequestException(`Unknown skill '${weight.slug}'`);
        }
      }
      const primary = weights.reduce((best, row) =>
        row.weight > best.weight ? row : best,
      );
      const skill = bySlug.get(primary.slug);
      if (!skill) {
        throw new BadRequestException('skillId is required');
      }
      return { skillId: skill.id, weights };
    }

    const skillId = input.skillId;
    if (!Number.isInteger(skillId) || (skillId ?? 0) < 1) {
      throw new BadRequestException('skillId is required');
    }
    const skill = byId.get(skillId as number);
    if (!skill) {
      throw new BadRequestException(`Skill #${skillId} not found`);
    }
    return {
      skillId: skill.id,
      weights: [{ slug: skill.slug, weight: 10 }],
    };
  }
}
