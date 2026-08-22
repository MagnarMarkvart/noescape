import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LiveClock } from '@prisma/client';
import { DailiesService } from '../dailies/dailies.service';
import { HorologiumService } from '../horologium/horologium.service';
import { HorologiumWatchesService } from '../horologium/horologium-watches.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutinesService } from '../routines/routines.service';
import { ClockEventsService } from './clock-events.service';
import { clockOwnerId } from './clock-owner';
import {
  ClockBoundDaily,
  ClockConsuetudoPayload,
  ClockEvent,
  ClockKind,
  ClockPhase,
  ClockSessioPayload,
  ClockSnapshot,
  ClockStatus,
  StartConsuetudoBody,
  StartSessioBody,
  StartVigiliaBody,
} from './clock.types';

const FOCUS_KINDS: ClockKind[] = ['sessio', 'track', 'consuetudo'];

@Injectable()
export class ClocksService implements OnModuleInit, OnModuleDestroy {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ClockEventsService,
    private readonly horologium: HorologiumService,
    private readonly watches: HorologiumWatchesService,
    private readonly routines: RoutinesService,
    private readonly dailies: DailiesService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.prisma.liveClock.findMany({
      where: { status: 'running' },
    });
    for (const row of rows) {
      this.schedule(row);
    }
  }

  onModuleDestroy(): void {
    for (const handle of this.timers.values()) {
      clearTimeout(handle);
    }
    this.timers.clear();
  }

  owner(): string {
    return clockOwnerId();
  }

  async list(): Promise<{ serverNow: string; clocks: ClockSnapshot[] }> {
    const ownerId = this.owner();
    const rows = await this.prisma.liveClock.findMany({
      where: { ownerId, status: { not: 'idle' } },
    });
    const clocks = rows.map((row) => this.toSnapshot(row));
    const vigilia = await this.listVigilia(ownerId);
    return {
      serverNow: new Date().toISOString(),
      clocks: [...clocks, ...vigilia],
    };
  }

  async startSessio(kind: 'sessio' | 'track', body: StartSessioBody) {
    const ownerId = this.owner();
    await this.clearFocusExcept(ownerId, kind);
    const workMinutes = Math.max(1, Math.round(Number(body.workMinutes) || 25));
    const restMinutes = Math.max(1, Math.round(Number(body.restMinutes) || 5));
    const iterations =
      kind === 'track'
        ? 1
        : Math.max(2, Math.round(Number(body.iterations) || 4));
    const restAfterLast = body.restAfterLast !== false;
    const totalPhaseMs = workMinutes * 60_000;
    const now = new Date();
    const payload: ClockSessioPayload = {
      mode: kind === 'track' ? 'adhoc' : 'planned',
      workMinutes,
      restMinutes,
      iterations,
      restAfterLast,
      presetId: body.presetId,
      currentIteration: 1,
      completedBlocks: 0,
      restCarryMs: 0,
      sessionStartedAt: now.toISOString(),
      watchName: body.watchName ?? null,
      watchId: body.watchId ?? null,
      boundDaily: body.boundDaily ?? null,
      taskCompleted: false,
      disciplineGranted: false,
      awaitingContinue: false,
    };
    const row = await this.upsert(ownerId, kind, {
      status: 'running',
      phase: 'work',
      startedAt: now,
      endsAt: new Date(now.getTime() + totalPhaseMs),
      pausedAccumMs: 0,
      remainingMs: totalPhaseMs,
      totalPhaseMs,
      notes: '',
      payloadJson: JSON.stringify(payload),
    });
    await this.syncLinkedWatch(payload, true);
    this.schedule(row);
    return this.publish(row);
  }

  async startConsuetudo(body: StartConsuetudoBody) {
    const ownerId = this.owner();
    const routineId = Math.round(Number(body.routineId));
    if (!Number.isFinite(routineId) || routineId < 1) {
      throw new BadRequestException('routineId is required');
    }
    const existing = await this.prisma.liveClock.findUnique({
      where: { ownerId_kind: { ownerId, kind: 'consuetudo' } },
    });
    if (existing && existing.status !== 'idle' && existing.status !== 'complete') {
      if (existing.status === 'paused') {
        return this.resume('consuetudo');
      }
      return this.publish(existing);
    }
    const routine = await this.routines.getOne(routineId, true);
    const step = routine.steps[0];
    if (!step) {
      throw new BadRequestException('Practice has no steps');
    }
    await this.clearFocusExcept(ownerId, 'consuetudo');
    const totalPhaseMs = step.durationMinutes * 60_000;
    const now = new Date();
    const payload: ClockConsuetudoPayload = {
      routineId: routine.id,
      routineName: routine.name,
      routineIcon: routine.icon,
      steps: routine.steps.map((s) => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        durationMinutes: s.durationMinutes,
        sortOrder: s.sortOrder,
      })),
      index: 0,
      logs: [],
    };
    const row = await this.upsert(ownerId, 'consuetudo', {
      status: 'running',
      phase: 'step',
      startedAt: now,
      endsAt: new Date(now.getTime() + totalPhaseMs),
      pausedAccumMs: 0,
      remainingMs: totalPhaseMs,
      totalPhaseMs,
      notes: '',
      payloadJson: JSON.stringify(payload),
    });
    return this.publish(row);
  }

  async startVigilia(body: StartVigiliaBody) {
    const watchId = Math.round(Number(body.watchId));
    if (!Number.isFinite(watchId) || watchId < 1) {
      throw new BadRequestException('watchId is required');
    }
    const watch = await this.watches.startRunning(watchId);
    const snapshot = this.vigiliaSnapshot(watch);
    this.events.emit(this.owner(), { snapshot, kind: 'vigilia' });
    return snapshot;
  }

  async pause(kind: ClockKind) {
    if (kind === 'vigilia') {
      throw new BadRequestException('Pass watchId via POST /clocks/vigilia/pause');
    }
    const row = await this.require(kind);
    if (row.status !== 'running') {
      return this.publish(row);
    }
    const remaining = this.liveRemaining(row);
    if (kind === 'sessio' || kind === 'track') {
      await this.syncLinkedWatch(this.sessioPayload(row), false);
    }
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: {
        status: 'paused',
        remainingMs: remaining,
        endsAt: null,
      },
    });
    this.clearTimer(this.key(next));
    return this.publish(next);
  }

  async pauseVigilia(body: StartVigiliaBody) {
    const watchId = Math.round(Number(body.watchId));
    if (!Number.isFinite(watchId) || watchId < 1) {
      throw new BadRequestException('watchId is required');
    }
    const watch = await this.watches.pauseRunning(watchId);
    const snapshot = this.vigiliaSnapshot(watch);
    this.events.emit(this.owner(), { snapshot, kind: 'vigilia' });
    return snapshot;
  }

  async resume(kind: ClockKind) {
    const row = await this.require(kind);
    if (row.status !== 'paused') {
      return this.publish(row);
    }
    const remaining = Math.max(1, row.remainingMs);
    const now = new Date();
    let payloadJson = row.payloadJson;
    if (kind === 'sessio' || kind === 'track') {
      const payload = this.sessioPayload(row);
      payload.awaitingContinue = false;
      payloadJson = JSON.stringify(payload);
    }
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: {
        status: 'running',
        startedAt: now,
        endsAt: new Date(now.getTime() + remaining),
        remainingMs: remaining,
        payloadJson,
      },
    });
    if (kind === 'sessio' || kind === 'track') {
      const payload = this.sessioPayload(next);
      if (next.phase === 'work') {
        await this.syncLinkedWatch(payload, true);
      }
    }
    this.schedule(next);
    return this.publish(next);
  }

  async skip(kind: ClockKind) {
    if (kind !== 'sessio' && kind !== 'track') {
      throw new BadRequestException('Skip is only for sessio/track rest');
    }
    const row = await this.require(kind);
    if (row.phase !== 'rest') {
      throw new BadRequestException('Nothing to skip');
    }
    const leftover = Math.ceil(Math.max(0, this.liveRemaining(row)) / 1000) * 1000;
    const payload = this.sessioPayload(row);
    payload.restCarryMs += leftover;
    const updated = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: { payloadJson: JSON.stringify(payload) },
    });
    return this.advanceSessio(updated, false, false, true);
  }

  async completeStep(outcome: 'COMPLETED' | 'SKIPPED') {
    const row = await this.require('consuetudo');
    if (row.status === 'complete' || row.phase === 'complete') {
      return this.publish(row);
    }
    const payload = this.consuetudoPayload(row);
    const step = payload.steps[payload.index];
    if (!step) {
      throw new BadRequestException('No current step');
    }
    const elapsedMs = this.consuetudoElapsed(row);
    payload.logs.push({
      stepId: step.id > 0 ? step.id : null,
      title: step.title,
      icon: step.icon,
      plannedSeconds: Math.max(0, Math.round(step.durationMinutes * 60)),
      elapsedMs,
      outcome,
    });
    const nextIndex = payload.index + 1;
    if (nextIndex >= payload.steps.length) {
      const notes = row.notes;
      const complete = await this.routines.completeRun(
        payload.routineId,
        { steps: payload.logs, notes },
        true,
      );
      this.clearTimer(this.key(row));
      await this.prisma.liveClock.delete({ where: { id: row.id } });
      const event: ClockEvent = {
        snapshot: null,
        kind: 'consuetudo',
        awards: complete.awards,
        complete,
        toast: `Consuetudo +${complete.xpAwarded} XP${complete.bonusXp > 0 ? ` · +${complete.bonusXp} bonus` : ' · no bonus'}`,
      };
      this.events.emit(this.owner(), event);
      return event;
    }
    const nextStep = payload.steps[nextIndex];
    payload.index = nextIndex;
    const totalPhaseMs = nextStep.durationMinutes * 60_000;
    const now = new Date();
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: {
        status: 'running',
        phase: 'step',
        startedAt: now,
        endsAt: new Date(now.getTime() + totalPhaseMs),
        pausedAccumMs: 0,
        remainingMs: totalPhaseMs,
        totalPhaseMs,
        payloadJson: JSON.stringify(payload),
      },
    });
    return this.publish(next);
  }

  async stop(kind: ClockKind) {
    if (kind === 'vigilia') {
      throw new BadRequestException('Archive or pause a vigilia watch instead');
    }
    const row = await this.find(kind);
    if (!row) {
      return { snapshot: null, kind };
    }
    this.clearTimer(this.key(row));
    let extra: Partial<ClockEvent> = {};
    if (kind === 'sessio' || kind === 'track') {
      const payload = this.sessioPayload(row);
      await this.syncLinkedWatch(payload, false);
      if (payload.taskCompleted) {
        extra = {
          complete: await this.horologium.closeEarly({
            workMinutes: payload.workMinutes,
            restMinutes: payload.restMinutes,
            iterations: payload.mode === 'adhoc' ? 1 : payload.iterations,
            elapsedMinutes: this.elapsedMinutes(payload),
            completedBlocks: payload.completedBlocks,
            questRunId:
              payload.boundDaily?.source === 'quest'
                ? payload.boundDaily.runId
                : undefined,
            taskLabel:
              payload.boundDaily?.journeyLabel?.trim() ||
              payload.boundDaily?.name,
            presetId: payload.presetId,
            startedAt: payload.sessionStartedAt,
            watchName: payload.watchName ?? undefined,
          }),
          toast: 'Sessio closed — task was already done, no penalty',
        };
      } else if (kind === 'sessio') {
        const unfinished = Math.max(
          0,
          payload.iterations - payload.completedBlocks,
        );
        if (unfinished > 0) {
          extra = {
            complete: await this.horologium.abandonSession({
              workMinutes: payload.workMinutes,
              restMinutes: payload.restMinutes,
              iterations: payload.iterations,
              completedBlocks: payload.completedBlocks,
              presetId: payload.presetId,
              startedAt: payload.sessionStartedAt,
              watchName: payload.watchName ?? undefined,
            }),
          };
        }
      }
    }
    await this.prisma.liveClock.delete({ where: { id: row.id } });
    const event: ClockEvent = { snapshot: null, kind, ...extra };
    this.events.emit(this.owner(), event);
    return event;
  }

  async patchNotes(kind: ClockKind, notes: string) {
    const row = await this.require(kind);
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: { notes: String(notes ?? '').slice(0, 4000) },
    });
    return this.publish(next);
  }

  async patchBoundDaily(
    kind: 'sessio' | 'track',
    bound: ClockBoundDaily | null,
  ) {
    const row = await this.require(kind);
    const payload = this.sessioPayload(row);
    const nextBound = bound
      ? {
          source: bound.source,
          runId: Number(bound.runId) || 0,
          dailyTaskId: bound.dailyTaskId ?? null,
          subtaskId: bound.subtaskId ?? null,
          questId: Number(bound.questId) || 0,
          name: String(bound.name ?? '').trim() || 'Task',
          journeyLabel: bound.journeyLabel ?? null,
        }
      : null;
    payload.boundDaily = nextBound;
    payload.taskCompleted = false;
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: { payloadJson: JSON.stringify(payload) },
    });
    return this.publish(next);
  }

  async completeTask(kind: 'sessio' | 'track', endSession: boolean) {
    const row = await this.require(kind);
    const payload = this.sessioPayload(row);
    if (payload.taskCompleted || !payload.boundDaily) {
      throw new BadRequestException('No bound task to complete');
    }
    const daily = payload.boundDaily;
    let complete: unknown;
    if (daily.source === 'daily' && daily.dailyTaskId) {
      complete = await this.dailies.complete(daily.dailyTaskId);
    } else {
      complete = await this.horologium.completeBoundTask({
        workMinutes: payload.workMinutes,
        restMinutes: payload.restMinutes,
        iterations: payload.mode === 'adhoc' ? 1 : payload.iterations,
        mode: payload.mode,
        completedBlocks: payload.completedBlocks,
        elapsedMinutes: this.elapsedMinutes(payload),
        questRunId: daily.runId,
        questSubtaskId:
          daily.source === 'subtask' ? daily.subtaskId ?? undefined : undefined,
        endSession: row.phase === 'complete' ? false : endSession,
        disciplineGranted: payload.disciplineGranted,
        specialLapsAwarded: Math.min(
          payload.completedBlocks,
          payload.mode === 'adhoc' ? 1 : payload.iterations,
        ),
        presetId: payload.presetId,
        startedAt: payload.sessionStartedAt,
        watchName: payload.watchName ?? undefined,
      });
    }
    payload.taskCompleted = true;
    payload.disciplineGranted = true;
    const endedEarly =
      endSession &&
      row.phase !== 'complete' &&
      row.phase !== 'idle' &&
      typeof complete === 'object' &&
      complete !== null &&
      'endedEarly' in complete &&
      Boolean((complete as { endedEarly?: boolean }).endedEarly);
    if (endedEarly || (endSession && daily.source === 'daily' && row.phase !== 'complete')) {
      if (daily.source === 'daily' && endSession && row.phase !== 'complete') {
        await this.horologium.closeEarly({
          workMinutes: payload.workMinutes,
          restMinutes: payload.restMinutes,
          iterations: payload.mode === 'adhoc' ? 1 : payload.iterations,
          elapsedMinutes: this.elapsedMinutes(payload),
          completedBlocks: payload.completedBlocks,
          taskLabel: daily.journeyLabel?.trim() || daily.name,
          presetId: payload.presetId,
          startedAt: payload.sessionStartedAt,
          watchName: payload.watchName ?? undefined,
        });
      }
      this.clearTimer(this.key(row));
      await this.syncLinkedWatch(payload, false);
      await this.prisma.liveClock.delete({ where: { id: row.id } });
      const event: ClockEvent = {
        snapshot: null,
        kind,
        complete,
        toast: `${daily.journeyLabel?.trim() || daily.name} done`,
      };
      this.events.emit(this.owner(), event);
      return event;
    }
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: { payloadJson: JSON.stringify(payload) },
    });
    return this.publish(next, {
      complete,
      toast: `${daily.journeyLabel?.trim() || daily.name} done · full session XP granted. Remaining blocks are extra Focus.`,
    });
  }

  private async advanceSessio(
    row: LiveClock,
    playSound: boolean,
    awardWorkXp: boolean,
    forceContinue = false,
  ) {
    const payload = this.sessioPayload(row);
    const runNow = forceContinue || (await this.sessioAutoContinue());
    let awards: unknown[] | undefined;
    let jingle: 'work' | 'rest' | null = playSound
      ? row.phase === 'work' || row.phase === 'rest'
        ? (row.phase as 'work' | 'rest')
        : null
      : null;
    let toast: string | null = null;

    if (row.phase === 'work') {
      if (awardWorkXp) {
        payload.completedBlocks += 1;
        const result = await this.horologium.awardBlock({
          workMinutes: payload.workMinutes,
          restMinutes: payload.restMinutes,
          mode: payload.mode,
          presetId: payload.presetId,
          questRunId:
            payload.boundDaily?.source === 'quest' ||
            payload.boundDaily?.source === 'subtask'
              ? payload.boundDaily.runId
              : undefined,
          questSubtaskId:
            payload.boundDaily?.source === 'subtask'
              ? payload.boundDaily.subtaskId ?? undefined
              : undefined,
          lapIndex: payload.completedBlocks,
          laps: payload.mode === 'adhoc' ? 1 : payload.iterations,
          specialDrops: !payload.taskCompleted,
          startedAt: payload.sessionStartedAt,
          watchName: payload.watchName ?? undefined,
        });
        awards = result.awards ?? (result.award ? [result.award] : []);
      }
      await this.syncLinkedWatch(payload, false);
      const isLast =
        payload.mode === 'planned' &&
        payload.currentIteration >= payload.iterations;
      if (isLast && !payload.restAfterLast) {
        return this.finishSessio(row, payload, awards, jingle);
      }
      const extra = payload.restCarryMs;
      payload.restCarryMs = 0;
      const totalPhaseMs = payload.restMinutes * 60_000 + extra;
      if (!runNow) {
        toast = 'Focus done. Start rest when ready.';
      }
      return this.commitNextPhase(
        row,
        payload,
        'rest',
        totalPhaseMs,
        { awards, jingle, toast },
        runNow,
      );
    }

    if (row.phase === 'rest') {
      if (
        payload.mode === 'planned' &&
        payload.currentIteration >= payload.iterations
      ) {
        return this.finishSessio(row, payload, awards, jingle);
      }
      payload.currentIteration += 1;
      const totalPhaseMs = payload.workMinutes * 60_000;
      if (!runNow) {
        toast = 'Rest done. Start the next lap when ready.';
      }
      const next = await this.commitNextPhase(
        row,
        payload,
        'work',
        totalPhaseMs,
        { awards, jingle, toast },
        runNow,
      );
      if (runNow) {
        await this.syncLinkedWatch(payload, true);
      }
      return next;
    }

    return this.publish(row);
  }

  private async commitNextPhase(
    row: LiveClock,
    payload: ClockSessioPayload,
    phase: 'work' | 'rest',
    totalPhaseMs: number,
    extra: { awards?: unknown[]; jingle: 'work' | 'rest' | null; toast?: string | null },
    runNow: boolean,
  ) {
    payload.awaitingContinue = !runNow;
    const now = new Date();
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: {
        status: runNow ? 'running' : 'paused',
        phase,
        startedAt: runNow ? now : null,
        endsAt: runNow ? new Date(now.getTime() + totalPhaseMs) : null,
        remainingMs: totalPhaseMs,
        totalPhaseMs,
        payloadJson: JSON.stringify(payload),
      },
    });
    if (runNow) {
      this.schedule(next);
    } else {
      this.clearTimer(this.key(next));
    }
    return this.publish(next, extra);
  }

  private async sessioAutoContinue(): Promise<boolean> {
    const character = await this.prisma.character.findUnique({
      where: { id: 1 },
      select: { pomodoroAutoContinue: true },
    });
    return character?.pomodoroAutoContinue !== false;
  }

  private async finishSessio(
    row: LiveClock,
    payload: ClockSessioPayload,
    awards: unknown[] | undefined,
    jingle: 'work' | 'rest' | null,
  ) {
    await this.syncLinkedWatch(payload, false);
    let bonusAwards = awards ?? [];
    if (!payload.disciplineGranted && payload.mode === 'planned') {
      const bonus = await this.horologium.awardGoalBonus({
        workMinutes: payload.workMinutes,
        restMinutes: payload.restMinutes,
        iterations: payload.iterations,
        restAfterLast: payload.restAfterLast,
        presetId: payload.presetId,
        startedAt: payload.sessionStartedAt,
        watchName: payload.watchName ?? undefined,
      });
      payload.disciplineGranted = true;
      if (bonus.award) {
        bonusAwards = [...bonusAwards, bonus.award, ...(bonus.awards ?? [])];
      }
    }
    this.clearTimer(this.key(row));
    const next = await this.prisma.liveClock.update({
      where: { id: row.id },
      data: {
        status: 'complete',
        phase: 'complete',
        endsAt: null,
        remainingMs: 0,
        payloadJson: JSON.stringify(payload),
      },
    });
    return this.publish(next, { awards: bonusAwards, jingle });
  }

  private schedule(row: LiveClock): void {
    const key = this.key(row);
    this.clearTimer(key);
    if (row.status !== 'running' || !row.endsAt) {
      return;
    }
    if (row.kind === 'consuetudo') {
      return;
    }
    const delay = Math.max(0, row.endsAt.getTime() - Date.now());
    this.timers.set(
      key,
      setTimeout(() => {
        void this.onTimeout(row.ownerId, row.kind as ClockKind);
      }, delay + 15),
    );
  }

  private async onTimeout(ownerId: string, kind: ClockKind): Promise<void> {
    const row = await this.prisma.liveClock.findUnique({
      where: { ownerId_kind: { ownerId, kind } },
    });
    if (!row || row.status !== 'running' || !row.endsAt) {
      return;
    }
    if (row.endsAt.getTime() > Date.now() + 50) {
      this.schedule(row);
      return;
    }
    if (kind === 'sessio' || kind === 'track') {
      await this.advanceSessio(row, true, true);
    }
  }

  private async clearFocusExcept(ownerId: string, keep: ClockKind) {
    for (const kind of FOCUS_KINDS) {
      if (kind === keep) {
        continue;
      }
      const row = await this.prisma.liveClock.findUnique({
        where: { ownerId_kind: { ownerId, kind } },
      });
      if (row) {
        this.clearTimer(this.key(row));
        await this.prisma.liveClock.delete({ where: { id: row.id } });
        this.events.emit(ownerId, { snapshot: null, kind });
      }
    }
  }

  private async upsert(
    ownerId: string,
    kind: ClockKind,
    data: {
      status: ClockStatus;
      phase: ClockPhase;
      startedAt: Date | null;
      endsAt: Date | null;
      pausedAccumMs: number;
      remainingMs: number;
      totalPhaseMs: number;
      notes: string;
      payloadJson: string;
    },
  ) {
    return this.prisma.liveClock.upsert({
      where: { ownerId_kind: { ownerId, kind } },
      create: { ownerId, kind, ...data },
      update: data,
    });
  }

  private async require(kind: ClockKind): Promise<LiveClock> {
    const row = await this.find(kind);
    if (!row) {
      throw new NotFoundException(`No ${kind} clock`);
    }
    return row;
  }

  private async find(kind: ClockKind) {
    return this.prisma.liveClock.findUnique({
      where: { ownerId_kind: { ownerId: this.owner(), kind } },
    });
  }

  private publish(row: LiveClock, extra: Partial<ClockEvent> = {}) {
    const snapshot = this.toSnapshot(row);
    const event: ClockEvent = {
      snapshot,
      kind: row.kind as ClockKind,
      ...extra,
    };
    this.events.emit(row.ownerId, event);
    return event;
  }

  private toSnapshot(row: LiveClock): ClockSnapshot {
    const remaining = this.liveRemaining(row);
    const snapshot: ClockSnapshot = {
      ownerId: row.ownerId,
      kind: row.kind as ClockKind,
      status: row.status as ClockStatus,
      phase: row.phase as ClockPhase,
      startedAt: row.startedAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      pausedAccumMs: row.pausedAccumMs,
      remainingMs: remaining,
      totalPhaseMs: row.totalPhaseMs,
      notes: row.notes,
      serverNow: new Date().toISOString(),
    };
    if (row.kind === 'sessio' || row.kind === 'track') {
      snapshot.sessio = this.sessioPayload(row);
    }
    if (row.kind === 'consuetudo') {
      snapshot.consuetudo = this.consuetudoPayload(row);
    }
    return snapshot;
  }

  private liveRemaining(row: LiveClock): number {
    if (row.status === 'paused' || row.status === 'complete') {
      return row.remainingMs;
    }
    if (!row.endsAt) {
      return row.remainingMs;
    }
    const left = row.endsAt.getTime() - Date.now();
    if (row.kind === 'consuetudo') {
      return left;
    }
    return Math.max(0, left);
  }

  private consuetudoElapsed(row: LiveClock): number {
    return Math.max(0, row.totalPhaseMs - this.liveRemaining(row));
  }

  private sessioPayload(row: LiveClock): ClockSessioPayload {
    return JSON.parse(row.payloadJson) as ClockSessioPayload;
  }

  private consuetudoPayload(row: LiveClock): ClockConsuetudoPayload {
    return JSON.parse(row.payloadJson) as ClockConsuetudoPayload;
  }

  private elapsedMinutes(payload: ClockSessioPayload): number {
    const start = Date.parse(payload.sessionStartedAt);
    if (!Number.isFinite(start)) {
      return 0;
    }
    return Math.max(0, Math.round((Date.now() - start) / 60_000));
  }

  private async syncLinkedWatch(payload: ClockSessioPayload, running: boolean) {
    if (!payload.watchId) {
      return;
    }
    try {
      if (running) {
        await this.watches.startRunning(payload.watchId);
      } else {
        await this.watches.pauseRunning(payload.watchId);
      }
    } catch {
      /* watch may have been archived */
    }
  }

  private async listVigilia(ownerId: string): Promise<ClockSnapshot[]> {
    void ownerId;
    const rows = await this.watches.list('ACTIVE');
    return rows.filter((w) => w.running).map((w) => this.vigiliaSnapshot(w));
  }

  private vigiliaSnapshot(watch: {
    id: number;
    name: string;
    elapsedMs: number;
    running: boolean;
    lastStartedAt: Date | string | null;
  }): ClockSnapshot {
    return {
      ownerId: this.owner(),
      kind: 'vigilia',
      status: watch.running ? 'running' : 'paused',
      phase: 'work',
      startedAt: watch.lastStartedAt
        ? new Date(watch.lastStartedAt).toISOString()
        : null,
      endsAt: null,
      pausedAccumMs: 0,
      remainingMs: 0,
      totalPhaseMs: 0,
      notes: '',
      serverNow: new Date().toISOString(),
      vigilia: {
        watchId: watch.id,
        name: watch.name,
        elapsedMs: watch.elapsedMs,
      },
    };
  }

  private key(row: { ownerId: string; kind: string }): string {
    return `${row.ownerId}:${row.kind}`;
  }

  private clearTimer(key: string): void {
    const handle = this.timers.get(key);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(key);
    }
  }
}
