import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { TimeService } from '../time/time.service';
import { addDaysIso } from '../time/tallinn';
import { calculateDailyTaskXp } from '../xp/daily-xp.util';
import {
  parseSkillWeights,
  validateSkillWeights,
  splitQuestXp,
} from '../xp/quest-xp.util';
import {
  findActiveScriptoriumDailies,
  type ScriptoriumDailyBind,
} from './scriptorium-lock.util';

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
  assignedKind: 'quest' | 'daily' | null;
  assignedDailyDate: string | null;
  assignedDailyTaskId: number | null;
  locked: boolean;
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
    private readonly skillsService: SkillsService,
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
    const binds = await findActiveScriptoriumDailies(
      this.prisma,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.view(row, skills, binds.get(row.id) ?? null));
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
    const binds = await findActiveScriptoriumDailies(
      this.prisma,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.dueView(row, skills, today, binds.get(row.id) ?? null));
  }

  async getOne(id: number) {
    return this.present(await this.load(id));
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
    return this.present(row);
  }

  async update(id: number, input: ScriptoriumUpsertInput) {
    const existing = await this.load(id);
    await this.assertUnlocked(existing);
    if (existing.status === 'ARCHIVED') {
      const restoring =
        input.status === 'OPEN' &&
        input.title === undefined &&
        input.notes === undefined &&
        input.icon === undefined &&
        input.dueDate === undefined &&
        input.tier === undefined &&
        input.durationMinutes === undefined &&
        input.effort === undefined &&
        input.skillWeights === undefined &&
        input.sortOrder === undefined;
      if (!restoring) {
        throw new BadRequestException(
          'Shelved folios cannot be edited. Restore it first.',
        );
      }
    }
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
    return this.present(row);
  }

  async remove(id: number) {
    await this.load(id);
    await this.prisma.scriptoriumWork.delete({ where: { id } });
    return { deleted: true, id };
  }

  async complete(id: number) {
    const work = await this.load(id);
    await this.assertUnlocked(work);
    if (work.status === 'ARCHIVED') {
      throw new BadRequestException('This folio is already shelved');
    }
    const weights = this.parseWeights(
      work.skillWeightsJson ? JSON.parse(work.skillWeightsJson) : [],
    );
    if (weights.length === 0) {
      throw new BadRequestException('Assign skills on the folio before completing');
    }
    const durationMinutes = work.durationMinutes ?? 45;
    const xp = calculateDailyTaskXp({
      effortLevel: work.effort,
      durationMinutes,
    });
    if (xp <= 0) {
      throw new BadRequestException('Set a volume before completing this folio');
    }

    const catalog = await this.prisma.skill.findMany({
      select: { id: true, slug: true },
    });
    const bySlug = new Map(catalog.map((row) => [row.slug, row]));
    const shares = splitQuestXp(xp, weights);
    const note = `Scriptorium: ${work.title}`;
    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];
    try {
      for (const share of shares) {
        if (share.xp <= 0) {
          continue;
        }
        const skill = bySlug.get(share.slug);
        if (!skill) {
          throw new BadRequestException(`Unknown skill '${share.slug}'`);
        }
        awards.push(
          await this.skillsService.awardXp(skill.id, {
            xpGained: share.xp,
            duration: durationMinutes,
            note,
          }),
        );
      }
    } catch (err) {
      for (const awarded of [...awards].reverse()) {
        await this.skillsService.reverseXp(
          awarded.skill.id,
          awarded.activity.xpGained,
          awarded.activity.id,
        );
      }
      throw err;
    }

    await this.prisma.scriptoriumWork.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    return {
      work: await this.getOne(id),
      award: awards[0] ?? null,
      awards,
      xp,
    };
  }

  async addSubtask(workId: number, title: string) {
    const work = await this.load(workId);
    await this.assertUnlocked(work);
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

  async reorderSubtasks(workId: number, ids: number[]) {
    const work = await this.load(workId);
    await this.assertUnlocked(work);
    const existing = new Set(work.subtasks.map((s) => s.id));
    if (
      !Array.isArray(ids) ||
      ids.length !== existing.size ||
      ids.some((id) => !existing.has(id)) ||
      new Set(ids).size !== ids.length
    ) {
      throw new BadRequestException('ids must list every subtask once');
    }
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.scriptoriumSubtask.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    );
    return this.getOne(workId);
  }

  async updateSubtask(
    workId: number,
    subtaskId: number,
    input: { title?: string; done?: boolean },
  ) {
    const work = await this.load(workId);
    await this.assertUnlocked(work);
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
    const work = await this.load(workId);
    await this.assertUnlocked(work);
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
    const work = await this.load(workId);
    await this.assertUnlocked(work);
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

  private async present(row: WorkRow): Promise<ScriptoriumWorkView> {
    const skills = await this.skillMap();
    const binds = await findActiveScriptoriumDailies(this.prisma, [row.id]);
    return this.view(row, skills, binds.get(row.id) ?? null);
  }

  private async assertUnlocked(work: { id: number; questId: number | null }) {
    if (work.questId) {
      throw new BadRequestException(
        'This folio is assigned to a quest and cannot be edited',
      );
    }
    const binds = await findActiveScriptoriumDailies(this.prisma, [work.id]);
    if (binds.has(work.id)) {
      throw new BadRequestException(
        'This folio is assigned to a daily and cannot be edited',
      );
    }
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

  private view(
    row: WorkRow,
    skills: Map<string, SkillMeta>,
    bind: ScriptoriumDailyBind | null = null,
  ): ScriptoriumWorkView {
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
    const assignedKind: ScriptoriumWorkView['assignedKind'] = row.questId
      ? 'quest'
      : bind
        ? 'daily'
        : null;
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
      assignedKind,
      assignedDailyDate: bind?.date ?? null,
      assignedDailyTaskId: bind?.id ?? null,
      locked: assignedKind != null,
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
    bind: ScriptoriumDailyBind | null = null,
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
    return { ...this.view(row, skills, bind), dueInDays, urgency };
  }

  private diffDays(fromIso: string, toIso: string): number {
    const from = Date.parse(`${fromIso}T00:00:00Z`);
    const to = Date.parse(`${toIso}T00:00:00Z`);
    return Math.round((to - from) / 86_400_000);
  }
}
