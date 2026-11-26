import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const LOG_KINDS = [
  'horologium',
  'intervals',
  'consuetudo',
  'dailies',
  'habitus',
  'tabularium',
  'activity',
  'levelups',
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABELS: Record<LogKind, { label: string; note: string }> = {
  horologium: { label: 'Horologium sessions', note: 'Horo Log entries.' },
  intervals: {
    label: 'Time intervals',
    note: 'Per-session tracked time rows under dailies, subtasks and Vigilias. Totals on tasks stay.',
  },
  consuetudo: { label: 'Consuetudo walks', note: 'Routine walk history and averages.' },
  dailies: {
    label: 'Sealed day cards',
    note: 'Dailies log cards. Deleting a card unseals that day.',
  },
  habitus: {
    label: 'Habitus check-ins',
    note: 'Habit completions and tally clicks — streaks and calendar colours reset.',
  },
  tabularium: { label: 'Tabularium clicks', note: 'Counter history.' },
  activity: { label: 'XP history', note: 'Activity rows. Skill XP and levels stay.' },
  levelups: { label: 'Level-up history', note: 'Level-up feed. Levels stay.' },
};

const DAY_MS = 86_400_000;

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
  ) as T;
}

@Injectable()
export class LogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    setTimeout(() => void this.applyRetention().catch(() => undefined), 30_000);
    this.timer = setInterval(
      () => void this.applyRetention().catch(() => undefined),
      6 * 60 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  parseKinds(raw: unknown): LogKind[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const set = new Set<LogKind>();
    for (const k of raw) {
      if ((LOG_KINDS as readonly string[]).includes(String(k))) {
        set.add(String(k) as LogKind);
      }
    }
    return [...set];
  }

  /** `before` = delete rows older than this instant; null = everything. */
  private whereFor(kind: LogKind, before: Date | null): Record<string, unknown> {
    if (!before) {
      return {};
    }
    switch (kind) {
      case 'horologium':
        return { completedAt: { lt: before } };
      case 'intervals':
        return { endedAt: { lt: before } };
      case 'consuetudo':
        return { startedAt: { lt: before } };
      case 'dailies':
        return { sealedAt: { lt: before } };
      case 'habitus':
      case 'tabularium':
        return { createdAt: { lt: before } };
      case 'activity':
        return { loggedAt: { lt: before } };
      case 'levelups':
        return { createdAt: { lt: before } };
    }
  }

  private async countKind(kind: LogKind, before: Date | null): Promise<number> {
    const where = this.whereFor(kind, before);
    const p = this.prisma;
    switch (kind) {
      case 'horologium':
        return p.horologiumSession.count({ where });
      case 'intervals':
        return p.workInterval.count({ where });
      case 'consuetudo':
        return p.routineRun.count({ where });
      case 'dailies':
        return p.dailyLog.count({ where });
      case 'habitus':
        return (
          (await p.habitCompletion.count({ where })) +
          (await p.habitClick.count({ where }))
        );
      case 'tabularium':
        return p.tabulaClick.count({ where });
      case 'activity':
        return p.activity.count({ where });
      case 'levelups':
        return p.levelUpEvent.count({ where });
    }
  }

  private async deleteKind(kind: LogKind, before: Date | null): Promise<number> {
    const where = this.whereFor(kind, before);
    const p = this.prisma;
    switch (kind) {
      case 'horologium':
        return (await p.horologiumSession.deleteMany({ where })).count;
      case 'intervals':
        return (await p.workInterval.deleteMany({ where })).count;
      case 'consuetudo':
        return (await p.routineRun.deleteMany({ where })).count;
      case 'dailies':
        return (await p.dailyLog.deleteMany({ where })).count;
      case 'habitus':
        return (
          (await p.habitCompletion.deleteMany({ where })).count +
          (await p.habitClick.deleteMany({ where })).count
        );
      case 'tabularium':
        return (await p.tabulaClick.deleteMany({ where })).count;
      case 'activity':
        return (await p.activity.deleteMany({ where })).count;
      case 'levelups':
        return (await p.levelUpEvent.deleteMany({ where })).count;
    }
  }

  async summary() {
    const character = await this.prisma.character.findFirst();
    const kinds = [] as Array<{ kind: LogKind; label: string; note: string; count: number }>;
    for (const kind of LOG_KINDS) {
      kinds.push({ kind, ...LOG_KIND_LABELS[kind], count: await this.countKind(kind, null) });
    }
    let retentionKinds: LogKind[] = [];
    try {
      retentionKinds = this.parseKinds(JSON.parse(character?.logRetentionKinds ?? '[]'));
    } catch {
      retentionKinds = [];
    }
    return {
      kinds,
      retention: {
        days: character?.logRetentionDays ?? null,
        kinds: retentionKinds,
      },
    };
  }

  async exportAll() {
    const p = this.prisma;
    const data = {
      exportedAt: new Date().toISOString(),
      app: 'noescape',
      logs: {
        horologium: await p.horologiumSession.findMany({ orderBy: { id: 'asc' } }),
        intervals: await p.workInterval.findMany({ orderBy: { id: 'asc' } }),
        consuetudo: await p.routineRun.findMany({
          orderBy: { id: 'asc' },
          include: { steps: true },
        }),
        dailies: await p.dailyLog.findMany({ orderBy: { date: 'asc' } }),
        habitus: {
          completions: await p.habitCompletion.findMany({ orderBy: { id: 'asc' } }),
          clicks: await p.habitClick.findMany({ orderBy: { id: 'asc' } }),
        },
        tabularium: await p.tabulaClick.findMany({ orderBy: { id: 'asc' } }),
        activity: await p.activity.findMany({ orderBy: { id: 'asc' } }),
        levelups: await p.levelUpEvent.findMany({ orderBy: { id: 'asc' } }),
      },
    };
    return jsonSafe(data);
  }

  async purge(input: { kinds?: unknown; before?: string | null; confirm?: string }) {
    if (input.confirm !== 'DELETE') {
      throw new BadRequestException("Send confirm: 'DELETE' to delete logs");
    }
    const kinds = this.parseKinds(input.kinds);
    if (kinds.length === 0) {
      throw new BadRequestException('Pick at least one log kind');
    }
    let before: Date | null = null;
    if (input.before) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.before)) {
        throw new BadRequestException('before must be YYYY-MM-DD');
      }
      before = new Date(`${input.before}T00:00:00Z`);
    }
    const deleted: Partial<Record<LogKind, number>> = {};
    for (const kind of kinds) {
      deleted[kind] = await this.deleteKind(kind, before);
    }
    return { deleted };
  }

  async setRetention(input: { days?: number | null; kinds?: unknown }) {
    const raw = input.days;
    const days =
      raw == null || raw === 0 ? null : Math.round(Number(raw));
    if (days != null && (!Number.isFinite(days) || days < 7 || days > 3650)) {
      throw new BadRequestException('Retention must be between 7 and 3650 days, or off');
    }
    const kinds = this.parseKinds(input.kinds);
    const character = await this.prisma.character.findFirst();
    if (!character) {
      throw new BadRequestException('No character');
    }
    await this.prisma.character.update({
      where: { id: character.id },
      data: {
        logRetentionDays: days,
        logRetentionKinds: JSON.stringify(kinds),
      },
    });
    return this.summary();
  }

  /** Delete rows older than the configured window. Off unless the user set it. */
  async applyRetention(now = new Date()) {
    const character = await this.prisma.character.findFirst();
    const days = character?.logRetentionDays ?? null;
    if (!character || days == null || days < 7) {
      return { deleted: {} };
    }
    let kinds: LogKind[] = [];
    try {
      kinds = this.parseKinds(JSON.parse(character.logRetentionKinds ?? '[]'));
    } catch {
      kinds = [];
    }
    const before = new Date(now.getTime() - days * DAY_MS);
    const deleted: Partial<Record<LogKind, number>> = {};
    for (const kind of kinds) {
      deleted[kind] = await this.deleteKind(kind, before);
    }
    if (Object.values(deleted).some((n) => (n ?? 0) > 0)) {
      this.logger.log(`Retention ${days}d removed ${JSON.stringify(deleted)}`);
    }
    return { deleted };
  }
}
