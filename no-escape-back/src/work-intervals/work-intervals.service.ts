import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type WorkIntervalClockKind = 'sessio' | 'track' | 'vigilia' | 'manual';

export type WorkIntervalTargetInput = {
  watchId?: number | null;
  dailyTaskId?: number | null;
  questRunId?: number | null;
  questSubtaskId?: number | null;
  questId?: number | null;
  scriptoriumWorkId?: number | null;
};

/**
 * Single writer for `WorkInterval` rows. Clocks and Vigilia watches call
 * `recordFlush` whenever a slice of tracked work time is committed — never
 * dailies/quests directly. Rows here are an append-only log; daily/subtask
 * `elapsedMs` stay the running totals callers already maintain, this table
 * exists so every flush is auditable per target and never double-applied.
 */
@Injectable()
export class WorkIntervalsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordFlush(
    clockKind: WorkIntervalClockKind,
    elapsedMs: number,
    endedAt: Date,
    targets: WorkIntervalTargetInput,
  ): Promise<void> {
    const ms = Math.round(elapsedMs);
    if (!Number.isFinite(ms) || ms <= 0) {
      return;
    }
    const hasTarget =
      targets.dailyTaskId != null ||
      targets.questSubtaskId != null ||
      targets.questId != null ||
      targets.questRunId != null ||
      targets.scriptoriumWorkId != null ||
      targets.watchId != null;
    if (!hasTarget) {
      return;
    }
    await this.prisma.workInterval.create({
      data: {
        clockKind,
        watchId: targets.watchId ?? null,
        dailyTaskId: targets.dailyTaskId ?? null,
        questRunId: targets.questRunId ?? null,
        questSubtaskId: targets.questSubtaskId ?? null,
        questId: targets.questId ?? null,
        scriptoriumWorkId: targets.scriptoriumWorkId ?? null,
        startedAt: new Date(endedAt.getTime() - ms),
        endedAt,
        elapsedMs: ms,
      },
    });
  }

  async listForTarget(target: WorkIntervalTargetInput, take = 50) {
    const where: Record<string, number | null> = {};
    if (target.dailyTaskId != null) where.dailyTaskId = target.dailyTaskId;
    if (target.questSubtaskId != null) {
      where.questSubtaskId = target.questSubtaskId;
    }
    if (target.questId != null) {
      where.questId = target.questId;
      // Quest-only queries (no subtask given) mean "the daily-work slice" —
      // exclude subtask rows so it doesn't double up with per-subtask logs.
      if (target.questSubtaskId == null && target.dailyTaskId == null) {
        where.questSubtaskId = null;
      }
    }
    if (target.scriptoriumWorkId != null)
      where.scriptoriumWorkId = target.scriptoriumWorkId;
    if (target.watchId != null) where.watchId = target.watchId;
    if (
      target.questRunId != null &&
      target.questId == null &&
      target.questSubtaskId == null &&
      target.dailyTaskId == null &&
      target.watchId == null
    ) {
      // Whole-quest Vigilia flushes: run-scoped, no daily-work questId, no subtask.
      where.questRunId = target.questRunId;
      where.questId = null;
      where.questSubtaskId = null;
    }
    if (Object.keys(where).length === 0) {
      return [];
    }
    const rows = await this.prisma.workInterval.findMany({
      where,
      orderBy: { endedAt: 'desc' },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      clockKind: row.clockKind,
      watchId: row.watchId,
      dailyTaskId: row.dailyTaskId,
      questRunId: row.questRunId,
      questSubtaskId: row.questSubtaskId,
      questId: row.questId,
      scriptoriumWorkId: row.scriptoriumWorkId,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      elapsedMs: row.elapsedMs,
    }));
  }
}
