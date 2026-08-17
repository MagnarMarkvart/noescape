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

  async create(name: string) {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) {
      throw new BadRequestException('Watch name is required');
    }
    const row = await this.prisma.horologiumWatch.create({
      data: { name: trimmed },
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

  async archive(id: number) {
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
    createdAt: Date;
    updatedAt: Date;
  }): HorologiumWatchDto {
    return {
      ...row,
      elapsedMs: Number(row.elapsedMs),
    };
  }
}
