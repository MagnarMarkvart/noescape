import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class HorologiumWatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status = 'ACTIVE') {
    const rows = await this.prisma.horologiumWatch.findMany({
      where: status === 'all' ? undefined : { status },
      orderBy: [{ running: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((row) => this.view(row));
  }

  async create(name: string, scriptoriumWorkId?: number) {
    let workId: number | null = null;
    let trimmed = name.trim().slice(0, 80);
    if (scriptoriumWorkId != null) {
      const id = Math.round(Number(scriptoriumWorkId));
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
    }
    if (!trimmed) {
      throw new BadRequestException('Watch name is required');
    }
    const row = await this.prisma.horologiumWatch.create({
      data: {
        name: trimmed,
        scriptoriumWorkId: workId,
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
    if (typeof input.running === 'boolean') {
      data.running = input.running;
      data.lastStartedAt = input.running ? new Date() : null;
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
    const elapsed = this.elapsedNow(existing);
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

  elapsedNow(row: {
    elapsedMs: bigint;
    running: boolean;
    lastStartedAt: Date | null;
  }): number {
    let ms = Number(row.elapsedMs);
    if (row.running && row.lastStartedAt) {
      ms += Math.max(0, Date.now() - row.lastStartedAt.getTime());
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
