import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import {
  isTabulaPeriod,
  isTabulaPolarity,
  periodLabel,
  periodWindow,
  tabulaTone,
  type TabulaPeriod,
  type TabulaPolarity,
  type TabulaTone,
} from './tabula-period';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type TabulaUpsertInput = {
  name?: string;
  icon?: string | null;
  period?: string;
  polarity?: string;
  normMin?: number;
  normMax?: number;
  step?: number;
  questId?: number | null;
  sortOrder?: number;
  archived?: boolean;
};

export type TabulaView = {
  id: number;
  name: string;
  icon: string | null;
  period: TabulaPeriod;
  polarity: TabulaPolarity;
  normMin: number;
  normMax: number;
  step: number;
  questId: number | null;
  questName: string | null;
  sortOrder: number;
  archived: boolean;
  count: number;
  tone: TabulaTone;
  windowFrom: string;
  windowTo: string;
  windowLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type TabulaClickView = {
  id: number;
  tabulaId: number;
  tabulaName: string;
  tabulaIcon: string | null;
  date: string;
  delta: number;
  createdAt: string;
};

@Injectable()
export class TabulariumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  async list(asOf?: string) {
    const day = this.resolveDay(asOf);
    const rows = await this.prisma.tabula.findMany({
      where: { archived: false },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { quest: { select: { id: true, name: true } } },
    });
    return Promise.all(rows.map((row) => this.present(row, day)));
  }

  async getOne(id: number, asOf?: string) {
    const row = await this.require(id);
    return this.present(row, this.resolveDay(asOf));
  }

  async create(input: TabulaUpsertInput) {
    const parsed = await this.parseInput(input, true);
    const name = String(parsed.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('Name is required');
    }
    const data: Prisma.TabulaUncheckedCreateInput = {
      name,
      icon: parsed.icon ?? null,
      period: parsed.period ?? 'day',
      polarity: parsed.polarity ?? 'vice',
      normMin: parsed.normMin ?? 0,
      normMax: Math.max(parsed.normMax ?? 0, parsed.normMin ?? 0),
      step: parsed.step ?? 1,
      questId: parsed.questId ?? null,
      sortOrder: parsed.sortOrder ?? 0,
    };
    const row = await this.prisma.tabula.create({
      data,
      include: { quest: { select: { id: true, name: true } } },
    });
    return this.present(row, this.time.today());
  }

  async update(id: number, input: TabulaUpsertInput) {
    await this.require(id);
    const parsed = await this.parseInput(input, false);
    const data: Prisma.TabulaUncheckedUpdateInput = { ...parsed };
    const row = await this.prisma.tabula.update({
      where: { id },
      data,
      include: { quest: { select: { id: true, name: true } } },
    });
    return this.present(row, this.time.today());
  }

  async remove(id: number) {
    await this.require(id);
    await this.prisma.tabula.update({
      where: { id },
      data: { archived: true },
    });
    return { deleted: true, id };
  }

  async click(id: number, delta?: number) {
    const row = await this.require(id);
    const step = Math.max(1, row.step);
    const signed = delta == null || delta === 0 ? step : Math.round(delta);
    if (signed === 0) {
      throw new BadRequestException('delta must not be 0');
    }
    await this.prisma.tabulaClick.create({
      data: {
        tabulaId: id,
        date: this.time.today(),
        delta: signed,
      },
    });
    const fresh = await this.require(id);
    return this.present(fresh, this.time.today());
  }

  async undo(id: number) {
    await this.require(id);
    const today = this.time.today();
    const last = await this.prisma.tabulaClick.findFirst({
      where: { tabulaId: id, date: today },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) {
      throw new BadRequestException('Nothing to undo today');
    }
    await this.prisma.tabulaClick.delete({ where: { id: last.id } });
    const fresh = await this.require(id);
    return this.present(fresh, today);
  }

  async calendar(from: string, to: string) {
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    const rows = await this.prisma.tabulaClick.groupBy({
      by: ['date'],
      where: { date: { gte: from, lte: to } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ date: row.date, count: row._count._all }));
  }

  async log(date?: string) {
    const day = this.resolveDay(date);
    const [clicks, board] = await Promise.all([
      this.prisma.tabulaClick.findMany({
        where: { date: day },
        orderBy: { createdAt: 'desc' },
        include: {
          tabula: { select: { id: true, name: true, icon: true } },
        },
      }),
      this.list(day),
    ]);
    return {
      date: day,
      clicks: clicks.map((row) => this.presentClick(row)),
      board,
    };
  }

  private async require(id: number) {
    const row = await this.prisma.tabula.findUnique({
      where: { id },
      include: { quest: { select: { id: true, name: true } } },
    });
    if (!row || row.archived) {
      throw new NotFoundException(`Tabula #${id} not found`);
    }
    return row;
  }

  private async parseInput(input: TabulaUpsertInput, creating: boolean) {
    const name = String(input.name ?? '').trim().slice(0, 80);
    if (creating && !name) {
      throw new BadRequestException('Name is required');
    }
    const data: {
      name?: string;
      icon?: string | null;
      period?: string;
      polarity?: string;
      normMin?: number;
      normMax?: number;
      step?: number;
      questId?: number | null;
      sortOrder?: number;
      archived?: boolean;
    } = {};
    if (input.name != null) {
      if (!name) {
        throw new BadRequestException('Name is required');
      }
      data.name = name;
    }
    if (input.icon !== undefined) {
      const icon = String(input.icon ?? '').trim().slice(0, 8);
      data.icon = icon || null;
    }
    if (input.period != null) {
      const period = String(input.period);
      if (!isTabulaPeriod(period)) {
        throw new BadRequestException('period must be day, week, month, or year');
      }
      data.period = period;
    }
    if (input.polarity != null) {
      const polarity = String(input.polarity);
      if (!isTabulaPolarity(polarity)) {
        throw new BadRequestException('polarity must be vice or virtue');
      }
      data.polarity = polarity;
    }
    if (input.normMin != null) {
      data.normMin = Math.max(0, Math.round(Number(input.normMin) || 0));
    }
    if (input.normMax != null) {
      data.normMax = Math.max(0, Math.round(Number(input.normMax) || 0));
    }
    if (data.normMin != null && data.normMax != null && data.normMax < data.normMin) {
      data.normMax = data.normMin;
    }
    if (input.step != null) {
      data.step = Math.max(1, Math.round(Number(input.step) || 1));
    }
    if (input.questId !== undefined) {
      data.questId = await this.resolveQuest(input.questId);
    }
    if (input.sortOrder != null) {
      data.sortOrder = Math.round(Number(input.sortOrder) || 0);
    }
    if (typeof input.archived === 'boolean') {
      data.archived = input.archived;
    }
    return data;
  }

  private async resolveQuest(raw: number | null) {
    if (raw == null || raw === 0) {
      return null;
    }
    const id = Math.round(Number(raw));
    if (!Number.isFinite(id) || id < 1) {
      return null;
    }
    const quest = await this.prisma.quest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!quest) {
      throw new BadRequestException(`Quest #${id} not found`);
    }
    return quest.id;
  }

  private async present(
    row: {
      id: number;
      name: string;
      icon: string | null;
      period: string;
      polarity: string;
      normMin: number;
      normMax: number;
      step: number;
      questId: number | null;
      sortOrder: number;
      archived: boolean;
      createdAt: Date;
      updatedAt: Date;
      quest: { id: number; name: string } | null;
    },
    asOf: string,
  ): Promise<TabulaView> {
    const period = isTabulaPeriod(row.period) ? row.period : 'day';
    const polarity = isTabulaPolarity(row.polarity) ? row.polarity : 'vice';
    const window = periodWindow(asOf, period, this.time.weekStartsOn());
    const agg = await this.prisma.tabulaClick.aggregate({
      where: {
        tabulaId: row.id,
        date: { gte: window.from, lte: window.to },
      },
      _sum: { delta: true },
    });
    const count = Math.max(0, agg._sum.delta ?? 0);
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      period,
      polarity,
      normMin: row.normMin,
      normMax: row.normMax,
      step: row.step,
      questId: row.questId,
      questName: row.quest?.name ?? null,
      sortOrder: row.sortOrder,
      archived: row.archived,
      count,
      tone: tabulaTone(count, row.normMin, row.normMax, polarity),
      windowFrom: window.from,
      windowTo: window.to,
      windowLabel: periodLabel(period, window, this.time.today()),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private presentClick(row: {
    id: number;
    tabulaId: number;
    date: string;
    delta: number;
    createdAt: Date;
    tabula: { name: string; icon: string | null };
  }): TabulaClickView {
    return {
      id: row.id,
      tabulaId: row.tabulaId,
      tabulaName: row.tabula.name,
      tabulaIcon: row.tabula.icon,
      date: row.date,
      delta: row.delta,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private resolveDay(date?: string) {
    const day = String(date ?? '').trim();
    if (!day) {
      return this.time.today();
    }
    if (!ISO_DATE.test(day)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    return day;
  }
}
