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
    const startedAt = new Date(endedAt.getTime() - ms);
    const same = {
      clockKind,
      watchId: targets.watchId ?? null,
      dailyTaskId: targets.dailyTaskId ?? null,
      questRunId: targets.questRunId ?? null,
      questSubtaskId: targets.questSubtaskId ?? null,
      questId: targets.questId ?? null,
      scriptoriumWorkId: targets.scriptoriumWorkId ?? null,
    };
    // A running clock flushes periodically; contiguous flushes of the same
    // clock/target extend one row so a session reads as one log line. A pause
    // or stop leaves a gap, so the next run starts a new row.
    const prev = await this.prisma.workInterval.findFirst({
      where: {
        ...same,
        endedAt: {
          gte: new Date(startedAt.getTime() - CONTIGUOUS_GAP_MS),
          lte: new Date(endedAt.getTime()),
        },
      },
      orderBy: { endedAt: 'desc' },
    });
    if (prev) {
      await this.prisma.workInterval.update({
        where: { id: prev.id },
        data: {
          endedAt,
          elapsedMs: { increment: ms },
        },
      });
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
    const raw = await this.prisma.workInterval.findMany({
      where,
      orderBy: { endedAt: 'desc' },
      take: Math.min(2000, take * 40),
    });
    const rows = mergeContiguous(raw).slice(0, take);
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

/** Max gap between two flushes that still count as one running session. */
export const CONTIGUOUS_GAP_MS = 5_000;

type IntervalRow = {
  id: number;
  clockKind: string;
  watchId: number | null;
  dailyTaskId: number | null;
  questRunId: number | null;
  questSubtaskId: number | null;
  questId: number | null;
  scriptoriumWorkId: number | null;
  startedAt: Date;
  endedAt: Date;
  elapsedMs: number;
};

/**
 * Display-side merge for rows written before flush coalescing existed:
 * newest-first rows of the same clock/target that touch each other become one.
 */
export function mergeContiguous<T extends IntervalRow>(rows: T[]): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (
      last &&
      last.clockKind === row.clockKind &&
      last.watchId === row.watchId &&
      last.dailyTaskId === row.dailyTaskId &&
      last.questRunId === row.questRunId &&
      last.questSubtaskId === row.questSubtaskId &&
      last.questId === row.questId &&
      last.scriptoriumWorkId === row.scriptoriumWorkId &&
      last.startedAt.getTime() - row.endedAt.getTime() <= CONTIGUOUS_GAP_MS
    ) {
      out[out.length - 1] = {
        ...last,
        startedAt: row.startedAt,
        elapsedMs: Number(last.elapsedMs) + Number(row.elapsedMs),
      };
      continue;
    }
    out.push({ ...row });
  }
  return out;
}
