import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import { WorkIntervalsService } from '../work-intervals/work-intervals.service';

export type VigiliaBindKind =
  | 'custom'
  | 'quest'
  | 'quest_daily_work'
  | 'daily'
  | 'subtask'
  | 'scriptorium';

export type HorologiumWatchDto = {
  id: number;
  name: string;
  status: string;
  elapsedMs: number;
  running: boolean;
  startedAt: Date;
  lastStartedAt: Date | null;
  archivedAt: Date | null;
  scriptoriumWorkId: number | null;
  bindKind: VigiliaBindKind;
  questId: number | null;
  questRunId: number | null;
  questSubtaskId: number | null;
  dailyTaskId: number | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CreateWatchInput = {
  name?: string;
  bindKind?: string;
  scriptoriumWorkId?: number;
  questId?: number;
  questRunId?: number;
  questSubtaskId?: number;
  dailyTaskId?: number;
};

const BIND_KINDS: VigiliaBindKind[] = [
  'custom',
  'quest',
  'quest_daily_work',
  'daily',
  'subtask',
  'scriptorium',
];

@Injectable()
export class HorologiumWatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workIntervals: WorkIntervalsService,
    private readonly time: TimeService,
  ) {}

  async list(status = 'ACTIVE') {
    const rows = await this.prisma.horologiumWatch.findMany({
      where: status === 'all' ? undefined : { status },
      orderBy: [{ running: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((row) => this.view(row));
  }

  /** Vigilia bind kinds currently allowed by Character settings. */
  async allowedBindKinds(): Promise<Set<VigiliaBindKind>> {
    const character = await this.prisma.character.findUnique({
      where: { id: 1 },
      select: {
        vigiliaTrackQuests: true,
        vigiliaTrackDailies: true,
        vigiliaTrackScriptorium: true,
        vigiliaTrackCustom: true,
      },
    });
    const allowed = new Set<VigiliaBindKind>();
    if (character?.vigiliaTrackQuests !== false) {
      allowed.add('quest');
      allowed.add('quest_daily_work');
      allowed.add('subtask');
    }
    if (character?.vigiliaTrackDailies === true) {
      allowed.add('daily');
    }
    if (character?.vigiliaTrackScriptorium === true) {
      allowed.add('scriptorium');
    }
    if (character?.vigiliaTrackCustom === true) {
      allowed.add('custom');
    }
    return allowed;
  }

  async create(input: CreateWatchInput) {
    const bindKind: VigiliaBindKind = BIND_KINDS.includes(
      input.bindKind as VigiliaBindKind,
    )
      ? (input.bindKind as VigiliaBindKind)
      : input.scriptoriumWorkId != null
        ? 'scriptorium'
        : 'custom';
    const allowed = await this.allowedBindKinds();
    if (!allowed.has(bindKind)) {
      throw new BadRequestException(
        `Vigilia is not set up to track ${bindKind.replace('_', ' ')} — enable it in Settings → Vigilia`,
      );
    }

    let trimmed = String(input.name ?? '').trim().slice(0, 80);
    let workId: number | null = null;
    let questId: number | null = null;
    let questRunId: number | null = null;
    let questSubtaskId: number | null = null;
    let dailyTaskId: number | null = null;

    if (bindKind === 'scriptorium') {
      const id = Math.round(Number(input.scriptoriumWorkId));
      if (!Number.isFinite(id) || id <= 0) {
        throw new BadRequestException('Invalid Scriptorium work');
      }
      const work = await this.prisma.scriptoriumWork.findUnique({
        where: { id },
        select: { id: true, title: true, status: true },
      });
      if (!work || work.status !== 'OPEN') {
        throw new NotFoundException(`Scriptorium work #${id} not found`);
      }
      const existing = await this.prisma.horologiumWatch.findFirst({
        where: { scriptoriumWorkId: id, status: 'ACTIVE' },
      });
      if (existing) {
        return this.view(existing);
      }
      workId = id;
      trimmed = trimmed || work.title.trim().slice(0, 80);
    } else if (bindKind === 'quest' || bindKind === 'quest_daily_work') {
      const qId = Math.round(Number(input.questId));
      if (!Number.isFinite(qId) || qId <= 0) {
        throw new BadRequestException('questId is required');
      }
      const quest = await this.prisma.quest.findUnique({
        where: { id: qId },
        select: { id: true, name: true, dailyWorkTitle: true, journeyLabel: true },
      });
      if (!quest) {
        throw new NotFoundException(`Quest #${qId} not found`);
      }
      const run = await this.prisma.questRun.findFirst({
        where: { questId: qId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!run) {
        throw new BadRequestException('Quest is not active');
      }
      const existing = await this.prisma.horologiumWatch.findFirst({
        where: { bindKind, questId: qId, status: 'ACTIVE' },
      });
      if (existing) {
        return this.view(existing);
      }
      questId = qId;
      questRunId = run.id;
      trimmed =
        trimmed ||
        (bindKind === 'quest_daily_work'
          ? quest.dailyWorkTitle || quest.journeyLabel || quest.name
          : quest.name);
    } else if (bindKind === 'subtask') {
      const sId = Math.round(Number(input.questSubtaskId));
      if (!Number.isFinite(sId) || sId <= 0) {
        throw new BadRequestException('questSubtaskId is required');
      }
      const subtask = await this.prisma.questSubtask.findUnique({
        where: { id: sId },
        select: { id: true, title: true, questId: true },
      });
      if (!subtask) {
        throw new NotFoundException(`Subtask #${sId} not found`);
      }
      const run = await this.prisma.questRun.findFirst({
        where: { questId: subtask.questId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!run) {
        throw new BadRequestException('Quest is not active');
      }
      const existing = await this.prisma.horologiumWatch.findFirst({
        where: { bindKind: 'subtask', questSubtaskId: sId, status: 'ACTIVE' },
      });
      if (existing) {
        return this.view(existing);
      }
      questId = subtask.questId;
      questRunId = run.id;
      questSubtaskId = sId;
      trimmed = trimmed || subtask.title;
    } else if (bindKind === 'daily') {
      const dId = Math.round(Number(input.dailyTaskId));
      if (!Number.isFinite(dId) || dId <= 0) {
        throw new BadRequestException('dailyTaskId is required');
      }
      const daily = await this.prisma.dailyTask.findUnique({
        where: { id: dId },
        select: { id: true, title: true },
      });
      if (!daily) {
        throw new NotFoundException(`Daily #${dId} not found`);
      }
      const existing = await this.prisma.horologiumWatch.findFirst({
        where: { bindKind: 'daily', dailyTaskId: dId, status: 'ACTIVE' },
      });
      if (existing) {
        return this.view(existing);
      }
      dailyTaskId = dId;
      trimmed = trimmed || daily.title || 'Daily';
    }

    if (!trimmed) {
      throw new BadRequestException('Watch name is required');
    }
    const row = await this.prisma.horologiumWatch.create({
      data: {
        name: trimmed,
        bindKind,
        scriptoriumWorkId: workId,
        questId,
        questRunId,
        questSubtaskId,
        dailyTaskId,
      },
    });
    return this.view(row);
  }

  async update(
    id: number,
    input: {
      name?: string;
      status?: string;
      elapsedMs?: number;
      running?: boolean;
    },
  ) {
    const existing = await this.prisma.horologiumWatch.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Watch #${id} not found`);
    }
    const data: {
      name?: string;
      status?: string;
      elapsedMs?: bigint;
      running?: boolean;
      lastStartedAt?: Date | null;
      archivedAt?: Date | null;
    } = {};
    if (typeof input.name === 'string') {
      const trimmed = input.name.trim().slice(0, 80);
      if (!trimmed) {
        throw new BadRequestException('Watch name is required');
      }
      data.name = trimmed;
    }
    if (typeof input.elapsedMs === 'number' && Number.isFinite(input.elapsedMs)) {
      data.elapsedMs = BigInt(Math.max(0, Math.round(input.elapsedMs)));
    }
    if (input.running === false) {
      // Flush the open interval (and any linked daily/subtask projection)
      // before applying other field changes, so combined calls like
      // archive() -> update({ status: 'ARCHIVED', running: false }) still
      // record the time instead of skipping straight to the status change.
      await this.pauseRunning(id);
    } else if (input.running === true) {
      data.running = true;
      data.lastStartedAt = new Date();
    }
    if (input.status === 'ARCHIVED') {
      data.status = 'ARCHIVED';
      data.running = false;
      data.lastStartedAt = null;
      data.archivedAt = new Date();
    } else if (input.status === 'ACTIVE') {
      data.status = 'ACTIVE';
      data.archivedAt = null;
    }
    if (Object.keys(data).length === 0) {
      const row = await this.prisma.horologiumWatch.findUniqueOrThrow({
        where: { id },
      });
      return this.view(row);
    }
    const row = await this.prisma.horologiumWatch.update({
      where: { id },
      data,
    });
    return this.view(row);
  }

  async startRunning(id: number) {
    const existing = await this.prisma.horologiumWatch.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Watch #${id} not found`);
    }
    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException('Watch is archived');
    }
    if (existing.bindKind === 'quest' && existing.completedAt) {
      throw new BadRequestException('This Vigilia was already closed');
    }
    if (existing.running && existing.lastStartedAt) {
      return this.view(existing);
    }
    const row = await this.prisma.horologiumWatch.update({
      where: { id },
      data: { running: true, lastStartedAt: new Date() },
    });
    return this.view(row);
  }

  async pauseRunning(id: number) {
    const existing = await this.prisma.horologiumWatch.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Watch #${id} not found`);
    }
    const now = new Date();
    const elapsed = this.elapsedNow(existing, now);
    if (existing.running && existing.lastStartedAt) {
      const delta = now.getTime() - existing.lastStartedAt.getTime();
      await this.workIntervals.recordFlush('vigilia', delta, now, {
        watchId: existing.id,
        dailyTaskId: existing.dailyTaskId ?? undefined,
        questRunId: existing.questRunId ?? undefined,
        questSubtaskId: existing.questSubtaskId ?? undefined,
        questId:
          existing.bindKind === 'quest_daily_work'
            ? existing.questId ?? undefined
            : undefined,
        scriptoriumWorkId: existing.scriptoriumWorkId ?? undefined,
      });
      await this.projectVigiliaDelta(existing, delta);
    }
    const row = await this.prisma.horologiumWatch.update({
      where: { id },
      data: {
        running: false,
        lastStartedAt: null,
        elapsedMs: BigInt(elapsed),
      },
    });
    return this.view(row);
  }

  /**
   * Complete this Vigilia from the dial. Flushes time and marks it closed.
   * Never marks the underlying quest/daily/subtask done — that still goes
   * through the normal complete endpoints. A whole-quest Vigilia cannot be
   * completed at all; pause/resume only.
   */
  async completeWatch(id: number) {
    const existing = await this.prisma.horologiumWatch.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Watch #${id} not found`);
    }
    if (existing.bindKind === 'quest') {
      throw new BadRequestException(
        'A whole-quest Vigilia cannot finish the quest — finish it from the quest briefing',
      );
    }
    const paused = existing.running
      ? await this.pauseRunning(id)
      : this.view(existing);
    const row = await this.prisma.horologiumWatch.update({
      where: { id },
      data: { completedAt: new Date() },
    });
    return { ...this.view(row), elapsedMs: paused.elapsedMs };
  }

  /**
   * Vigilia is an extra count-up layer, but for `daily` / `subtask` binds it
   * is also the tracker of record for that target's own elapsedMs (e.g. no
   * pomodoro running). Project the flushed delta the same way dailies/quests
   * project their own absolute elapsed patches, so a Vigilia-only session
   * still shows tracked time on the daily/subtask/quest views.
   */
  private async projectVigiliaDelta(
    watch: {
      bindKind: string;
      dailyTaskId: number | null;
      questRunId: number | null;
      questSubtaskId: number | null;
    },
    delta: number,
  ): Promise<void> {
    if (delta <= 0) {
      return;
    }
    if (watch.bindKind === 'quest' && watch.questRunId) {
      await this.prisma.questRun.update({
        where: { id: watch.questRunId },
        data: { elapsedMs: { increment: BigInt(delta) } },
      });
      return;
    }
    if (watch.bindKind === 'quest_daily_work' && watch.questRunId) {
      await this.prisma.questRun.update({
        where: { id: watch.questRunId },
        data: { journeyElapsedMs: { increment: BigInt(delta) } },
      });
      return;
    }
    if (watch.bindKind === 'daily' && watch.dailyTaskId) {
      await this.prisma.dailyTask.update({
        where: { id: watch.dailyTaskId },
        data: { elapsedMs: { increment: BigInt(delta) } },
      });
      return;
    }
    if (watch.bindKind === 'subtask' && watch.questRunId && watch.questSubtaskId) {
      await this.prisma.questSubtaskCompletion.upsert({
        where: {
          runId_subtaskId: {
            runId: watch.questRunId,
            subtaskId: watch.questSubtaskId,
          },
        },
        create: {
          runId: watch.questRunId,
          subtaskId: watch.questSubtaskId,
          done: false,
          elapsedMs: BigInt(delta),
        },
        update: { elapsedMs: { increment: BigInt(delta) } },
      });
      const linkedDaily = await this.prisma.dailyTask.findFirst({
        where: {
          date: this.time.today(),
          questRunId: watch.questRunId,
          questSubtaskId: watch.questSubtaskId,
        },
      });
      if (linkedDaily) {
        await this.prisma.dailyTask.update({
          where: { id: linkedDaily.id },
          data: { elapsedMs: { increment: BigInt(delta) } },
        });
      }
    }
  }

  elapsedNow(
    row: { elapsedMs: bigint; running: boolean; lastStartedAt: Date | null },
    now: Date = new Date(),
  ): number {
    let ms = Number(row.elapsedMs);
    if (row.running && row.lastStartedAt) {
      ms += Math.max(0, now.getTime() - row.lastStartedAt.getTime());
    }
    return ms;
  }

  async archive(id: number): Promise<HorologiumWatchDto> {
    return this.update(id, { status: 'ARCHIVED', running: false });
  }

  private view(row: {
    id: number;
    name: string;
    status: string;
    elapsedMs: bigint;
    running: boolean;
    startedAt: Date;
    lastStartedAt: Date | null;
    archivedAt: Date | null;
    scriptoriumWorkId?: number | null;
    bindKind?: string | null;
    questId?: number | null;
    questRunId?: number | null;
    questSubtaskId?: number | null;
    dailyTaskId?: number | null;
    completedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): HorologiumWatchDto {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      elapsedMs: Number(row.elapsedMs),
      running: row.running,
      startedAt: row.startedAt,
      lastStartedAt: row.lastStartedAt,
      archivedAt: row.archivedAt,
      scriptoriumWorkId: row.scriptoriumWorkId ?? null,
      bindKind: (BIND_KINDS.includes(row.bindKind as VigiliaBindKind)
        ? row.bindKind
        : 'custom') as VigiliaBindKind,
      questId: row.questId ?? null,
      questRunId: row.questRunId ?? null,
      questSubtaskId: row.questSubtaskId ?? null,
      dailyTaskId: row.dailyTaskId ?? null,
      completedAt: row.completedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
