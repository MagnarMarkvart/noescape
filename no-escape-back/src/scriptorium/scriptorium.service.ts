import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';
import { addDaysIso } from '../time/tallinn';
import {
  parseSkillWeights,
  validateSkillWeights,
} from '../xp/quest-xp.util';

export const SCRIPTORIUM_TIERS = [
  'IMMINENS',
  'TEMPESTIVA',
  'COGITATA',
] as const;

export type ScriptoriumTier = (typeof SCRIPTORIUM_TIERS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DUE_WINDOW_DAYS = 14;

type WorkRow = {
  id: number;
  title: string;
  notes: string;
  icon: string | null;
  tier: string;
  dueDate: string | null;
  durationMinutes: number | null;
  effort: number;
  skillWeightsJson: string | null;
  status: string;
  questId: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  subtasks: Array<{
    id: number;
    title: string;
    done: boolean;
    sortOrder: number;
  }>;
  quest: { id: number; name: string } | null;
};

type SkillMeta = { slug: string; name: string; icon: string | null };

export type ScriptoriumWorkView = {
  id: number;
  title: string;
  notes: string;
  icon: string | null;
  tier: ScriptoriumTier;
  dueDate: string | null;
  durationMinutes: number | null;
  effort: number;
  skillWeights: { slug: string; weight: number }[];
  skillShares: Array<{
    slug: string;
    name: string;
    icon: string | null;
    weight: number;
  }>;
  status: string;
  questId: number | null;
  questName: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  subtasks: Array<{
    id: number;
    title: string;
    done: boolean;
    sortOrder: number;
  }>;
  subtaskDone: number;
  subtaskTotal: number;
};

export type ScriptoriumDueView = ScriptoriumWorkView & {
  dueInDays: number;
  urgency: 'overdue' | 'today' | 'soon' | 'later';
};

export type ScriptoriumUpsertInput = {
  title?: string;
  notes?: string;
  icon?: string | null;
  tier?: string;
  dueDate?: string | null;
  durationMinutes?: number | null;
  effort?: number;
  skillWeights?: { slug: string; weight: number }[];
  subtasks?: Array<string | { title?: string }>;
  status?: string;
  sortOrder?: number;
};

@Injectable()
export class ScriptoriumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: TimeService,
  ) {}

  async list(status = 'OPEN') {
    const rows = await this.prisma.scriptoriumWork.findMany({
      where: status === 'all' ? undefined : { status },
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        quest: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    const skills = await this.skillMap();
    return rows.map((row) => this.view(row, skills));
  }

  async dueSoon(days = DEFAULT_DUE_WINDOW_DAYS) {
    const window = Number.isFinite(days)
      ? Math.min(90, Math.max(1, Math.round(days)))
      : DEFAULT_DUE_WINDOW_DAYS;
    const today = this.time.today();
    const until = addDaysIso(today, window);
    const rows = await this.prisma.scriptoriumWork.findMany({
      where: {
        status: 'OPEN',
        dueDate: { not: null, lte: until },
      },
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        quest: { select: { id: true, name: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { effort: 'desc' }],
    });
    const skills = await this.skillMap();
    return rows.map((row) => this.dueView(row, skills, today));
  }

  async getOne(id: number) {
    const row = await this.load(id);
    const skills = await this.skillMap();
    return this.view(row, skills);
  }

  async create(input: ScriptoriumUpsertInput) {
    const title = input.title?.trim() ?? '';
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    const dueDate = this.parseDue(input.dueDate);
    const tier = this.parseTier(input.tier, dueDate);
    const weights = this.parseWeights(input.skillWeights);
    const subtasks = this.parseSubtasks(input.subtasks);
    const row = await this.prisma.scriptoriumWork.create({
      data: {
        title: title.slice(0, 120),
        notes: (input.notes ?? '').trim().slice(0, 4000),
        icon: this.parseIcon(input.icon),
        tier,
        dueDate,
        durationMinutes: this.parseDuration(input.durationMinutes),
        effort: this.parseEffort(input.effort),
        skillWeightsJson: weights.length ? JSON.stringify(weights) : null,
        sortOrder: Math.max(0, Math.round(Number(input.sortOrder) || 0)),
        subtasks: subtasks.length
          ? {
              create: subtasks.map((rowTitle, i) => ({
                title: rowTitle,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        quest: { select: { id: true, name: true } },
      },
    });
    const skills = await this.skillMap();
    return this.view(row, skills);
  }

  async update(id: number, input: ScriptoriumUpsertInput) {
    await this.load(id);
    const data: Record<string, unknown> = {};
    if (typeof input.title === 'string') {
      const title = input.title.trim();
      if (!title) {
        throw new BadRequestException('Title is required');
      }
      data.title = title.slice(0, 120);
    }
    if (typeof input.notes === 'string') {
      data.notes = input.notes.trim().slice(0, 4000);
    }
    if (input.icon !== undefined) {
      data.icon = this.parseIcon(input.icon);
    }
    if (input.dueDate !== undefined) {
      data.dueDate = this.parseDue(input.dueDate);
    }
    if (typeof input.tier === 'string') {
      data.tier = this.parseTier(input.tier, null, true);
    }
    if (input.durationMinutes !== undefined) {
      data.durationMinutes = this.parseDuration(input.durationMinutes);
    }
    if (input.effort !== undefined) {
      data.effort = this.parseEffort(input.effort);
    }
    if (input.skillWeights !== undefined) {
      const weights = this.parseWeights(input.skillWeights);
      data.skillWeightsJson = weights.length ? JSON.stringify(weights) : null;
    }
    if (input.status === 'ARCHIVED' || input.status === 'OPEN') {
      data.status = input.status;
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = Math.max(0, Math.round(Number(input.sortOrder) || 0));
    }
    const row = await this.prisma.scriptoriumWork.update({
      where: { id },
      data,
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        quest: { select: { id: true, name: true } },
      },
    });
    const skills = await this.skillMap();
    return this.view(row, skills);
  }

  async remove(id: number) {
    await this.load(id);
    await this.prisma.scriptoriumWork.delete({ where: { id } });
    return { deleted: true, id };
  }

  async addSubtask(workId: number, title: string) {
    const work = await this.load(workId);
    const trimmed = title.trim().slice(0, 160);
    if (!trimmed) {
      throw new BadRequestException('Subtask title is required');
    }
    const nextOrder =
      work.subtasks.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    await this.prisma.scriptoriumSubtask.create({
      data: { workId, title: trimmed, sortOrder: nextOrder },
    });
    return this.getOne(workId);
  }

  async updateSubtask(
    workId: number,
    subtaskId: number,
    input: { title?: string; done?: boolean },
  ) {
    const existing = await this.prisma.scriptoriumSubtask.findFirst({
      where: { id: subtaskId, workId },
    });
    if (!existing) {
      throw new NotFoundException(`Subtask #${subtaskId} not found`);
    }
    const data: { title?: string; done?: boolean } = {};
    if (typeof input.title === 'string') {
      const title = input.title.trim().slice(0, 160);
      if (!title) {
        throw new BadRequestException('Subtask title is required');
      }
      data.title = title;
    }
    if (typeof input.done === 'boolean') {
      data.done = input.done;
    }
    await this.prisma.scriptoriumSubtask.update({
      where: { id: subtaskId },
      data,
    });
    return this.getOne(workId);
  }

  async removeSubtask(workId: number, subtaskId: number) {
    const existing = await this.prisma.scriptoriumSubtask.findFirst({
      where: { id: subtaskId, workId },
    });
    if (!existing) {
      throw new NotFoundException(`Subtask #${subtaskId} not found`);
    }
    await this.prisma.scriptoriumSubtask.delete({ where: { id: subtaskId } });
    return this.getOne(workId);
  }

  async linkQuest(workId: number, questId: number) {
    await this.load(workId);
    const quest = await this.prisma.quest.findUnique({
      where: { id: questId },
      select: { id: true },
    });
    if (!quest) {
      throw new NotFoundException(`Quest #${questId} not found`);
    }
    await this.prisma.scriptoriumWork.update({
      where: { id: workId },
      data: { questId },
    });
    return this.getOne(workId);
  }

  private async load(id: number): Promise<WorkRow> {
    const row = await this.prisma.scriptoriumWork.findUnique({
      where: { id },
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        quest: { select: { id: true, name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException(`Scriptorium work #${id} not found`);
    }
    return row;
  }

  private async skillMap(): Promise<Map<string, SkillMeta>> {
    const rows = await this.prisma.skill.findMany({
      select: { slug: true, name: true, icon: true },
    });
    return new Map(rows.map((s) => [s.slug, s]));
  }

  private parseTier(
    raw: string | undefined,
    dueDate: string | null,
    required = false,
  ): ScriptoriumTier {
    const value = (raw ?? '').trim().toUpperCase();
    if (SCRIPTORIUM_TIERS.includes(value as ScriptoriumTier)) {
      return value as ScriptoriumTier;
    }
    if (required && value) {
      throw new BadRequestException(
        'Tier must be IMMINENS, TEMPESTIVA, or COGITATA',
      );
    }
    if (dueDate) {
      const today = this.time.today();
      const soon = addDaysIso(today, 3);
      return dueDate <= soon ? 'IMMINENS' : 'TEMPESTIVA';
    }
    return 'COGITATA';
  }

  private parseDue(raw: string | null | undefined): string | null {
    if (raw == null || raw === '') {
      return null;
    }
    const value = String(raw).trim();
    if (!ISO_DATE.test(value)) {
      throw new BadRequestException('Due date must be YYYY-MM-DD');
    }
    return value;
  }

  private parseIcon(raw: string | null | undefined): string | null {
    if (raw == null) {
      return null;
    }
    const icon = raw.trim().slice(0, 16);
    return icon || null;
  }

  private parseEffort(raw: number | undefined): number {
    if (raw == null) {
      return 5;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) {
      return 5;
    }
    return Math.min(10, Math.max(1, n));
  }

  private parseDuration(raw: number | null | undefined): number | null {
    if (raw == null) {
      return null;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    return Math.min(10080, n);
  }

  private parseSubtasks(raw: unknown): string[] {
    if (raw == null) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new BadRequestException('subtasks must be an array');
    }
    const titles = raw
      .map((row) => {
        if (typeof row === 'string') {
          return row.trim().slice(0, 160);
        }
        if (row && typeof row === 'object' && 'title' in row) {
          return String((row as { title?: unknown }).title ?? '')
            .trim()
            .slice(0, 160);
        }
        return '';
      })
      .filter((title) => title.length > 0);
    return titles;
  }

  private parseWeights(raw: unknown) {
    const { weights, error } = validateSkillWeights(raw ?? [], {
      allowEmpty: true,
    });
    if (error) {
      throw new BadRequestException(error);
    }
    return weights;
  }

  private view(row: WorkRow, skills: Map<string, SkillMeta>): ScriptoriumWorkView {
    const skillWeights = parseSkillWeights(
      row.skillWeightsJson ? JSON.parse(row.skillWeightsJson) : [],
    );
    const skillShares = skillWeights.map((w) => {
      const skill = skills.get(w.slug);
      return {
        slug: w.slug,
        name: skill?.name ?? w.slug,
        icon: skill?.icon ?? null,
        weight: w.weight,
      };
    });
    const subtaskDone = row.subtasks.filter((s) => s.done).length;
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      icon: row.icon,
      tier: SCRIPTORIUM_TIERS.includes(row.tier as ScriptoriumTier)
        ? (row.tier as ScriptoriumTier)
        : 'COGITATA',
      dueDate: row.dueDate,
      durationMinutes: row.durationMinutes,
      effort: row.effort,
      skillWeights,
      skillShares,
      status: row.status,
      questId: row.questId,
      questName: row.quest?.name ?? null,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      subtasks: row.subtasks,
      subtaskDone,
      subtaskTotal: row.subtasks.length,
    };
  }

  private dueView(
    row: WorkRow,
    skills: Map<string, SkillMeta>,
    today: string,
  ): ScriptoriumDueView {
    const dueDate = row.dueDate ?? today;
    const dueInDays = this.diffDays(today, dueDate);
    let urgency: ScriptoriumDueView['urgency'] = 'later';
    if (dueInDays < 0) {
      urgency = 'overdue';
    } else if (dueInDays === 0) {
      urgency = 'today';
    } else if (dueInDays <= 3) {
      urgency = 'soon';
    }
    return { ...this.view(row, skills), dueInDays, urgency };
  }

  private diffDays(fromIso: string, toIso: string): number {
    const from = Date.parse(`${fromIso}T00:00:00Z`);
    const to = Date.parse(`${toIso}T00:00:00Z`);
    return Math.round((to - from) / 86_400_000);
  }
}
