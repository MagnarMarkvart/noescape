import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import {
  calculateDailyTaskXp,
  DAILY_SLOT_COUNTS,
  DAILY_SLOT_MAXIMUMS,
  durationMultiplier,
  effortMultiplier,
  IMPORTANCE_BASE_XP,
  IMPORTANCE_ORDER,
  TaskImportance,
} from '../xp/daily-xp.util';
import { levelFromXp } from '../xp/xp.util';
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
  effortLevel: number;
  durationMinutes: number;
  completed: boolean;
  xpAwarded: number | null;
  activityId: number | null;
  completedAt: Date | string | null;
  isFilled: boolean;
  isEmpty: boolean;
  projectedXp: number;
  breakdown: {
    base: number;
    effortMult: number;
    durationMult: number;
  } | null;
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
  ) {}

  async getBoard(date?: string) {
    const requestedDate = this.normalizeDate(date);
    const pendingSealDate =
      await this.findOldestPendingSealBefore(requestedDate);
    // Unsealed prior days must be sealed manually before working ahead.
    const day = pendingSealDate ?? requestedDate;

    const board = await this.buildBoard(day);
    const sealed = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    const lastLog = await this.prisma.dailyLog.findFirst({
      where: { date: { lt: day } },
      orderBy: { date: 'desc' },
    });

    let incompleteInLastLog = 0;
    if (lastLog) {
      const snap = this.parseSnapshot(lastLog.snapshotJson);
      incompleteInLastLog = this.collectIncomplete(snap).length;
    }

    const sealRequired = Boolean(pendingSealDate);

    return {
      ...board,
      date: day,
      requestedDate,
      pendingSealDate,
      sealRequired,
      isSealed: Boolean(sealed),
      lastLogDate: lastLog?.date ?? null,
      canCopyIncomplete:
        incompleteInLastLog > 0 && !sealed && !sealRequired,
      incompleteInLastLog,
      isBaseFilled: this.isBaseBoardFilled(board),
      canAddRegular:
        !sealed &&
        !sealRequired &&
        (board.tiers.find((t) => t.importance === 'REGULAR')?.capacity ?? 0) <
          DAILY_SLOT_MAXIMUMS.REGULAR,
    };
  }

  async listLogs() {
    const logs = await this.prisma.dailyLog.findMany({
      orderBy: { date: 'desc' },
      take: 60,
    });
    return logs.map((log) => ({
      id: log.id,
      date: log.date,
      sealedAt: log.sealedAt,
      filledCount: log.filledCount,
      completedCount: log.completedCount,
      earnedXp: log.earnedXp,
      projectedXp: log.projectedXp,
    }));
  }

  async getLog(date: string) {
    const day = this.normalizeDate(date);
    const log = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (!log) {
      throw new NotFoundException(`No daily log for ${day}`);
    }
    return {
      id: log.id,
      date: log.date,
      sealedAt: log.sealedAt,
      filledCount: log.filledCount,
      completedCount: log.completedCount,
      earnedXp: log.earnedXp,
      projectedXp: log.projectedXp,
      snapshot: this.parseSnapshot(log.snapshotJson),
    };
  }

  async sealDay(date?: string) {
    const day = this.normalizeDate(date);
    return this.sealDate(day, true);
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
      if (!task.skillId || !task.title.trim()) {
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
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
          completed: false,
          xpAwarded: null,
          completedAt: null,
        },
        update: {
          title: task.title,
          skillId: task.skillId,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
          completed: false,
          xpAwarded: null,
          completedAt: null,
        },
      });
      copied += 1;
    }

    return {
      sourceDate: sourceLog.date,
      targetDate,
      copied,
      board: await this.getBoard(targetDate),
    };
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
    if (!Number.isInteger(dto.skillId) || dto.skillId < 1) {
      throw new BadRequestException('skillId is required');
    }
    await this.skillsService.findOne(dto.skillId);

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
        skillId: dto.skillId,
        effortLevel,
        durationMinutes,
      },
      update: {
        title,
        skillId: dto.skillId,
        effortLevel,
        durationMinutes,
      },
      include: { skill: { select: this.skillSelect() } },
    });

    return this.enrichTask(task);
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

  async complete(id: number) {
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
    const xp = calculateDailyTaskXp({
      importance,
      effortLevel: task.effortLevel,
      durationMinutes: task.durationMinutes,
    });

    const award = await this.skillsService.awardXp(task.skillId, {
      xpGained: xp,
      duration: task.durationMinutes,
      note: `Daily: ${task.title}`,
    });

    const updated = await this.prisma.dailyTask.update({
      where: { id },
      data: {
        completed: true,
        xpAwarded: xp,
        activityId: award.activity.id,
        completedAt: new Date(),
      },
      include: { skill: { select: this.skillSelect() } },
    });

    return {
      task: this.enrichTask(updated),
      award,
    };
  }

  async uncomplete(id: number) {
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
    if (!task.skillId || !task.xpAwarded) {
      throw new BadRequestException('Task has no XP award to reverse');
    }

    let reversal = null;
    if (task.activityId) {
      reversal = await this.skillsService.reverseXp(
        task.skillId,
        task.activityId,
        task.xpAwarded,
      );
    } else {
      // Legacy completes without activityId — still reverse skill XP.
      const skill = await this.prisma.skill.findUnique({
        where: { id: task.skillId },
      });
      if (skill) {
        const newXp = Math.max(0, skill.xp - task.xpAwarded);
        const updated = await this.prisma.skill.update({
          where: { id: skill.id },
          data: { xp: newXp, level: levelFromXp(newXp) },
        });
        reversal = {
          skill: updated,
          xpRemoved: task.xpAwarded,
          leveledDown: updated.level < skill.level,
        };
      }
    }

    const updated = await this.prisma.dailyTask.update({
      where: { id },
      data: {
        completed: false,
        xpAwarded: null,
        activityId: null,
        completedAt: null,
      },
      include: { skill: { select: this.skillSelect() } },
    });

    return {
      task: this.enrichTask(updated),
      reversal,
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

    await this.prisma.dailyLog.create({
      data: {
        date: day,
        filledCount: board.filledCount,
        completedCount: board.completedCount,
        earnedXp: board.earnedXp,
        projectedXp: board.projectedXp,
        snapshotJson: JSON.stringify(snapshot),
      },
    });

    return this.getLog(day);
  }

  private async buildBoard(day: string): Promise<BoardSnapshot> {
    const tasks = await this.prisma.dailyTask.findMany({
      where: { date: day },
      include: { skill: { select: this.skillSelect() } },
    });

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
        return this.enrichTask(existing);
      });

      return {
        importance,
        label: this.importanceLabel(importance),
        baseXp: IMPORTANCE_BASE_XP[importance],
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

  private async assertNotSealed(day: string) {
    const sealed = await this.prisma.dailyLog.findUnique({ where: { date: day } });
    if (sealed) {
      throw new BadRequestException(`Day ${day} is sealed in the logs`);
    }
  }

  private async assertMutableDay(day: string) {
    await this.assertNotSealed(day);
    const pending = await this.findOldestPendingSealBefore(day);
    if (pending && pending !== day) {
      throw new BadRequestException(`Seal ${pending} before continuing`);
    }
  }

  private enrichTask(task: {
    id: number;
    date: string;
    importance: string;
    slotIndex: number;
    title: string;
    skillId: number | null;
    skill: SkillSnap | null;
    effortLevel: number;
    durationMinutes: number;
    completed: boolean;
    xpAwarded: number | null;
    activityId?: number | null;
    completedAt: Date | null;
  }): EnrichedTask {
    const importance = task.importance as TaskImportance;
    const isFilled = Boolean(task.title.trim() && task.skillId);
    const projectedXp = isFilled
      ? calculateDailyTaskXp({
          importance,
          effortLevel: task.effortLevel,
          durationMinutes: task.durationMinutes,
        })
      : 0;

    return {
      ...task,
      importance,
      activityId: task.activityId ?? null,
      isFilled,
      isEmpty: !isFilled,
      projectedXp,
      breakdown: isFilled
        ? {
            base: IMPORTANCE_BASE_XP[importance],
            effortMult: Number(effortMultiplier(task.effortLevel).toFixed(3)),
            durationMult: Number(
              durationMultiplier(task.durationMinutes).toFixed(3),
            ),
          }
        : null,
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
      effortLevel: 5,
      durationMinutes: 45,
      completed: false,
      xpAwarded: null,
      activityId: null,
      completedAt: null,
      isFilled: false,
      isEmpty: true,
      projectedXp: 0,
      breakdown: null,
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

  private normalizeDate(date?: string): string {
    if (!date) {
      return this.localToday();
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return date;
  }

  /** Calendar date in the server local timezone (not UTC). */
  private localToday(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
}
