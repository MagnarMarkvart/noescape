import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { assertKnownSkillSlugs } from '../skills/known-skills.util';
import { tallinnToday } from '../time/tallinn';
import { UNITS, bestOf, meetsTarget, xpForAttempt } from './palmares.logic';

export type RecordInput = {
  name?: string;
  icon?: string | null;
  unit?: string;
  higherIsBetter?: boolean;
  target?: number | null;
  skillSlug?: string | null;
  archived?: boolean;
};

export type AttemptInput = { value?: number; date?: string; note?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class PalmaresService {
  private readonly logger = new Logger(PalmaresService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly skills?: SkillsService,
  ) {}

  async list(includeArchived = false) {
    const records = await this.prisma.palmaresRecord.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: { attempts: { orderBy: { createdAt: 'desc' } } },
    });
    return records.map((r) => this.view(r));
  }

  async getOne(id: number) {
    const r = await this.prisma.palmaresRecord.findUnique({
      where: { id },
      include: { attempts: { orderBy: { createdAt: 'desc' } } },
    });
    if (!r) throw new NotFoundException(`Record #${id} not found`);
    return this.view(r);
  }

  async create(input: RecordInput) {
    const data = await this.clean(input, true);
    const max = await this.prisma.palmaresRecord.aggregate({ _max: { sortOrder: true } });
    const r = await this.prisma.palmaresRecord.create({
      data: { ...(data as { name: string }), sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return this.getOne(r.id);
  }

  async update(id: number, input: RecordInput) {
    await this.getOne(id);
    const data = await this.clean(input, false);
    await this.prisma.palmaresRecord.update({ where: { id }, data });
    return this.getOne(id);
  }

  async remove(id: number) {
    await this.getOne(id);
    await this.prisma.palmaresRecord.delete({ where: { id } });
    return { ok: true };
  }

  async addAttempt(id: number, input: AttemptInput) {
    const record = await this.getOne(id);
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
      throw new BadRequestException('value must be a positive number');
    }
    const date = input.date ?? tallinnToday();
    if (!DATE_RE.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    const note = String(input.note ?? '').trim().slice(0, 300);
    const rounded = Math.round(value * 100) / 100;
    const outcome = xpForAttempt(rounded, record.best, record.target, record.higherIsBetter);

    let xpAwarded = 0;
    let award: unknown = null;
    if (outcome.xp > 0 && record.skillSlug && this.skills) {
      const skill = await this.prisma.skill.findUnique({ where: { slug: record.skillSlug } });
      if (skill) {
        try {
          award = await this.skills.awardXp(skill.id, {
            xpGained: outcome.xp,
            note: `Palmares: ${record.name} ${outcome.pb ? 'PB ' : ''}${rounded} ${record.unit}`,
          });
          xpAwarded = outcome.xp;
        } catch (err) {
          this.logger.warn(`PB XP not awarded: ${(err as Error).message}`);
        }
      }
    }

    const attempt = await this.prisma.palmaresAttempt.create({
      data: { recordId: id, value: rounded, date, note, isPb: outcome.pb, xpAwarded },
    });
    return {
      record: await this.getOne(id),
      attempt,
      pb: outcome.pb,
      firstAttempt: record.best == null,
      targetReached: outcome.targetReached,
      xp: xpAwarded,
      award,
    };
  }

  async removeAttempt(attemptId: number) {
    const a = await this.prisma.palmaresAttempt.findUnique({ where: { id: attemptId } });
    if (!a) throw new NotFoundException(`Attempt #${attemptId} not found`);
    await this.prisma.palmaresAttempt.delete({ where: { id: attemptId } });
    return this.getOne(a.recordId);
  }

  private async clean(input: RecordInput, creating: boolean) {
    const out: Record<string, unknown> = {};
    if (creating || input.name !== undefined) {
      const name = String(input.name ?? '').trim();
      if (!name || name.length > 60) throw new BadRequestException('name is required (max 60 chars)');
      out.name = name;
    }
    if (input.icon !== undefined) out.icon = input.icon ? String(input.icon).slice(0, 16) : null;
    if (input.unit !== undefined) {
      if (!(UNITS as readonly string[]).includes(input.unit)) {
        throw new BadRequestException(`unit must be one of ${UNITS.join(', ')}`);
      }
      out.unit = input.unit;
    }
    if (input.higherIsBetter !== undefined) out.higherIsBetter = Boolean(input.higherIsBetter);
    if (input.target !== undefined) {
      if (input.target === null) out.target = null;
      else {
        const t = Number(input.target);
        if (!Number.isFinite(t) || t <= 0) throw new BadRequestException('target must be positive');
        out.target = t;
      }
    }
    if (input.skillSlug !== undefined) {
      const slug = input.skillSlug ? String(input.skillSlug).trim() : null;
      if (slug) await assertKnownSkillSlugs(this.prisma, [slug]);
      out.skillSlug = slug;
    }
    if (input.archived !== undefined) out.archived = Boolean(input.archived);
    return out;
  }

  private view(r: {
    id: number;
    name: string;
    icon: string | null;
    unit: string;
    higherIsBetter: boolean;
    target: number | null;
    skillSlug: string | null;
    archived: boolean;
    attempts: Array<{ id: number; value: number; date: string; note: string; isPb: boolean; xpAwarded: number; createdAt: Date }>;
  }) {
    const values = r.attempts.map((a) => a.value);
    const best = bestOf(values, r.higherIsBetter);
    const bestAttempt = best == null ? null : r.attempts.filter((a) => a.value === best).at(-1) ?? null;
    return {
      id: r.id,
      name: r.name,
      icon: r.icon,
      unit: r.unit,
      higherIsBetter: r.higherIsBetter,
      target: r.target,
      skillSlug: r.skillSlug,
      archived: r.archived,
      best,
      bestDate: bestAttempt?.date ?? null,
      targetMet: meetsTarget(best, r.target, r.higherIsBetter),
      attemptCount: r.attempts.length,
      last: r.attempts[0] ?? null,
      attempts: r.attempts.slice(0, 30),
    };
  }
}
