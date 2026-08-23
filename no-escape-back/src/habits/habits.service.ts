import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CharacterService } from '../character/character.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  isTabulaPeriod,
  isTabulaPolarity,
  periodLabel,
  periodWindow,
  tabulaTone,
  type TabulaPeriod,
  type TabulaPolarity,
} from '../tabularium/tabula-period';
import { TimeService } from '../time/time.service';
import { FINANCE_SKILL_SLUG, parseRewardCents } from '../wealth/money.util';
import {
  parseSkillWeights,
  validateSkillWeights,
} from '../xp/quest-xp.util';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type HabitKind = 'check' | 'tally';
export type HabitStatsGrain = 'day' | 'week' | 'month' | 'year' | 'all';

export type HabitWriteInput = {
  name?: string;
  icon?: string;
  skillId?: number | null;
  cadence?: string;
  everyNDays?: number;
  wealthCents?: number | null;
  skillWeights?: Array<{ slug: string; weight: number }>;
  effortLevel?: number;
  durationMinutes?: number;
  allowInDailies?: boolean;
  kind?: string;
  period?: string;
  polarity?: string;
  normMin?: number;
  normMax?: number;
  step?: number;
  questId?: number | null;
};

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characterService: CharacterService,
    private readonly time: TimeService,
  ) {}

  todayIso(): string {
    return this.localToday();
  }

  async assertUnlocked(_devBypass = false) {
    return;
  }

  async list(devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habits = await this.prisma.habit.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: this.habitInclude(),
    });
    return Promise.all(habits.map((h) => this.present(h)));
  }

  /** All habits ever created (active + archived), with full stats. */
  async listProgression(devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habits = await this.prisma.habit.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: this.habitInclude(true),
    });
    return Promise.all(habits.map((h) => this.present(h)));
  }

  async getOne(habitId: number, devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habit = await this.prisma.habit.findUnique({
      where: { id: habitId },
      include: this.habitInclude(true),
    });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    return this.present(habit);
  }

  async create(input: HabitWriteInput, devBypass = false) {
    await this.assertUnlocked(devBypass);
    const name = String(input.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const data = await this.resolveWrite(input, true);
    const habit = await this.prisma.habit.create({
      data: {
        name,
        icon: String(input.icon ?? '').trim() || '◆',
        ...data,
      },
      include: this.habitInclude(),
    });
    return this.present(habit);
  }

  async update(habitId: number, input: HabitWriteInput, devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habit = await this.require(habitId);
    const data = await this.resolveWrite(input, false, habit);
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) {
        throw new BadRequestException('name is required');
      }
      data.name = name;
    }
    if (input.icon !== undefined) {
      data.icon = String(input.icon ?? '').trim() || '◆';
    }
    const updated = await this.prisma.habit.update({
      where: { id: habitId },
      data,
      include: this.habitInclude(),
    });
    return this.present(updated);
  }

  async setArchived(habitId: number, archived: boolean, devBypass = false) {
    await this.assertUnlocked(devBypass);
    await this.require(habitId);
    if (archived) {
      await this.detachHabitFromDailies(habitId);
    }
    const updated = await this.prisma.habit.update({
      where: { id: habitId },
      data: { active: !archived },
      include: this.habitInclude(true),
    });
    return this.present(updated);
  }

  async remove(habitId: number, devBypass = false) {
    await this.assertUnlocked(devBypass);
    await this.require(habitId);
    await this.detachHabitFromDailies(habitId);
    await this.prisma.habit.delete({ where: { id: habitId } });
    return { deleted: true, id: habitId };
  }

  /**
   * Defaults and unfinished dailies keep their other fields; the habit
   * link is cleared. Completing a daily must not fail if the habit is gone.
   */
  private async detachHabitFromDailies(habitId: number) {
    await this.prisma.dailyTaskTemplate.updateMany({
      where: { habitId },
      data: { habitId: null },
    });
    await this.prisma.dailyTask.updateMany({
      where: { habitId, completed: false },
      data: { habitId: null },
    });
  }

  async rangeLog(
    habitId: number,
    from: string,
    to: string,
    devBypass = false,
  ) {
    await this.assertUnlocked(devBypass);
    if (!ISO.test(from) || !ISO.test(to)) {
      throw new BadRequestException('from/to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be ≤ to');
    }
    const habit = await this.prisma.habit.findUnique({
      where: { id: habitId },
      include: this.habitInclude(true),
    });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    const completions = await this.prisma.habitCompletion.findMany({
      where: { habitId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    const clicks = await this.prisma.habitClick.findMany({
      where: { habitId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    const byDate = new Map(completions.map((c) => [c.date, c]));
    const clickSum = new Map<string, number>();
    for (const click of clicks) {
      clickSum.set(click.date, (clickSum.get(click.date) ?? 0) + click.delta);
    }
    const days: Array<{
      date: string;
      completed: boolean;
      source: string | null;
      count: number;
    }> = [];
    let cursor = from;
    while (cursor <= to) {
      const hit = byDate.get(cursor);
      const count = clickSum.get(cursor) ?? (hit ? 1 : 0);
      days.push({
        date: cursor,
        completed: Boolean(hit) || count > 0,
        source: hit?.source ?? null,
        count,
      });
      cursor = this.offsetDate(cursor, 1);
    }
    return {
      habit: await this.present(habit),
      from,
      to,
      days,
      completedCount: days.filter((d) => d.completed).length,
    };
  }

  async monthLog(
    habitId: number,
    year: number,
    month: number,
    devBypass = false,
  ) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const last = new Date(year, month, 0).getDate();
    const from = `${prefix}-01`;
    const to = `${prefix}-${String(last).padStart(2, '0')}`;
    const range = await this.rangeLog(habitId, from, to, devBypass);
    return {
      habit: range.habit,
      year,
      month,
      days: range.days,
      completedCount: range.completedCount,
    };
  }

  async markComplete(
    habitId: number,
    date: string,
    source = 'manual',
    dailyTaskId?: number | null,
  ) {
    if (!ISO.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (date > this.localToday()) {
      throw new BadRequestException('Cannot log habits in the future');
    }
    const habit = await this.require(habitId);
    if (!habit.active) {
      if (source === 'manual') {
        throw new BadRequestException('Habit is archived');
      }
      return null;
    }
    if (habit.kind === 'tally' && source === 'daily') {
      await this.prisma.habitClick.create({
        data: { habitId, date, delta: Math.max(1, habit.step) },
      });
    }
    const existing = await this.prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });
    if (existing) {
      if (source === 'daily') {
        return this.prisma.habitCompletion.update({
          where: { habitId_date: { habitId, date } },
          data: { source, dailyTaskId: dailyTaskId ?? null },
        });
      }
      return existing;
    }
    const created = await this.prisma.habitCompletion.create({
      data: {
        habitId,
        date,
        source,
        dailyTaskId: dailyTaskId ?? null,
      },
    });
    const wealthCents = parseRewardCents(habit.wealthCents);
    if (source === 'manual' && habit.kind !== 'tally' && wealthCents > 0) {
      await this.characterService.adjustWealth({
        deltaCents: wealthCents,
        note: `Habit: ${habit.name}`,
        source: 'habit',
        sourceId: created.id,
        date,
      });
      return this.prisma.habitCompletion.update({
        where: { id: created.id },
        data: { wealthAwardedCents: wealthCents },
      });
    }
    return created;
  }

  async uncomplete(habitId: number, date: string) {
    if (!ISO.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const habit = await this.require(habitId);
    if (!habit.active) {
      throw new BadRequestException('Habit is archived');
    }
    const existing = await this.prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });
    if (!existing) {
      return { removed: false, date };
    }
    const awarded = parseRewardCents(existing.wealthAwardedCents);
    if (awarded > 0) {
      await this.characterService.adjustWealth({
        deltaCents: -awarded,
        note: `Undo habit: ${habit.name}`,
        source: 'habit',
        sourceId: existing.id,
        date,
      });
    }
    await this.prisma.habitCompletion.delete({
      where: { habitId_date: { habitId, date } },
    });
    return { removed: true, date };
  }

  async click(habitId: number, delta?: number) {
    const habit = await this.require(habitId);
    if (!habit.active) {
      throw new BadRequestException('Habit is archived');
    }
    if (habit.kind !== 'tally') {
      throw new BadRequestException('This habit is not a tally');
    }
    const step = Math.max(1, habit.step);
    const signed = delta == null || delta === 0 ? step : Math.round(delta);
    if (signed === 0) {
      throw new BadRequestException('delta must not be 0');
    }
    const date = this.localToday();
    await this.prisma.habitClick.create({
      data: { habitId, date, delta: signed },
    });
    await this.ensureCompletion(habitId, date, signed > 0);
    const fresh = await this.prisma.habit.findUnique({
      where: { id: habitId },
      include: this.habitInclude(),
    });
    return this.present(fresh!);
  }

  async undo(habitId: number) {
    const habit = await this.require(habitId);
    if (!habit.active) {
      throw new BadRequestException('Habit is archived');
    }
    if (habit.kind !== 'tally') {
      throw new BadRequestException('This habit is not a tally');
    }
    const today = this.localToday();
    const last = await this.prisma.habitClick.findFirst({
      where: { habitId, date: today },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) {
      throw new BadRequestException('Nothing to undo today');
    }
    await this.prisma.habitClick.delete({ where: { id: last.id } });
    const remaining = await this.prisma.habitClick.aggregate({
      where: { habitId, date: today },
      _sum: { delta: true },
    });
    await this.ensureCompletion(
      habitId,
      today,
      (remaining._sum.delta ?? 0) > 0,
    );
    const fresh = await this.prisma.habit.findUnique({
      where: { id: habitId },
      include: this.habitInclude(),
    });
    return this.present(fresh!);
  }

  async stats(input: {
    from?: string;
    to?: string;
    ids?: number[];
    grain?: string;
  }) {
    const grain = this.parseGrain(input.grain);
    const today = this.localToday();
    let from = input.from && ISO.test(input.from) ? input.from : today;
    let to = input.to && ISO.test(input.to) ? input.to : today;
    const habits = await this.prisma.habit.findMany({
      where: {
        active: true,
        ...(input.ids?.length ? { id: { in: input.ids } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { quest: { select: { id: true, name: true } } },
    });
    const ids = habits.map((h) => h.id);
    if (ids.length === 0) {
      const days: Array<{
        date: string;
        points: number;
        completions: number;
        clicks: number;
      }> = [];
      if (grain !== 'all') {
        let cursor = from;
        while (cursor <= to) {
          days.push({ date: cursor, points: 0, completions: 0, clicks: 0 });
          cursor = this.offsetDate(cursor, 1);
        }
      }
      return {
        from,
        to: grain === 'all' ? today : to,
        grain,
        points: 0,
        completions: 0,
        clicks: 0,
        series: [],
        days,
        habits: [],
      };
    }
    if (grain === 'all') {
      const [firstCompletion, firstClick] = await Promise.all([
        this.prisma.habitCompletion.findFirst({
          where: { habitId: { in: ids } },
          orderBy: { date: 'asc' },
          select: { date: true },
        }),
        this.prisma.habitClick.findFirst({
          where: { habitId: { in: ids } },
          orderBy: { date: 'asc' },
          select: { date: true },
        }),
      ]);
      const dates = [firstCompletion?.date, firstClick?.date].filter(
        Boolean,
      ) as string[];
      from = dates.sort()[0] ?? today;
      to = today;
    } else if (from > to) {
      throw new BadRequestException('from must be ≤ to');
    }

    const [completions, clicks] = await Promise.all([
      this.prisma.habitCompletion.findMany({
        where: { habitId: { in: ids }, date: { gte: from, lte: to } },
        select: { habitId: true, date: true },
      }),
      this.prisma.habitClick.findMany({
        where: { habitId: { in: ids }, date: { gte: from, lte: to } },
        select: { habitId: true, date: true, delta: true },
      }),
    ]);

    const dayMap = new Map<
      string,
      { points: number; completions: number; clicks: number }
    >();
    const bump = (date: string, field: 'points' | 'completions' | 'clicks', n: number) => {
      const row = dayMap.get(date) ?? { points: 0, completions: 0, clicks: 0 };
      row[field] += n;
      if (field !== 'points') {
        row.points += n;
      }
      dayMap.set(date, row);
    };
    const byHabit = new Map<
      number,
      { points: number; completions: number; clicks: number }
    >();
    const bumpHabit = (
      habitId: number,
      field: 'points' | 'completions' | 'clicks',
      n: number,
    ) => {
      const row = byHabit.get(habitId) ?? {
        points: 0,
        completions: 0,
        clicks: 0,
      };
      row[field] += n;
      if (field !== 'points') {
        row.points += n;
      }
      byHabit.set(habitId, row);
    };

    for (const row of completions) {
      bump(row.date, 'completions', 1);
      bumpHabit(row.habitId, 'completions', 1);
    }
    for (const row of clicks) {
      bump(row.date, 'clicks', row.delta);
      bumpHabit(row.habitId, 'clicks', row.delta);
    }

    const days: Array<{
      date: string;
      points: number;
      completions: number;
      clicks: number;
    }> = [];
    let cursor = from;
    while (cursor <= to) {
      const row = dayMap.get(cursor) ?? { points: 0, completions: 0, clicks: 0 };
      days.push({ date: cursor, ...row });
      cursor = this.offsetDate(cursor, 1);
    }

    const seriesMap = new Map<string, { key: string; label: string; value: number }>();
    for (const day of days) {
      const bucket = this.bucketKey(day.date, grain);
      const prev = seriesMap.get(bucket.key) ?? {
        key: bucket.key,
        label: bucket.label,
        value: 0,
      };
      prev.value += day.points;
      seriesMap.set(bucket.key, prev);
    }

    const totals = days.reduce(
      (acc, d) => ({
        points: acc.points + d.points,
        completions: acc.completions + d.completions,
        clicks: acc.clicks + d.clicks,
      }),
      { points: 0, completions: 0, clicks: 0 },
    );

    return {
      from,
      to,
      grain,
      ...totals,
      series: [...seriesMap.values()],
      days,
      habits: habits.map((h) => {
        const stats = byHabit.get(h.id) ?? {
          points: 0,
          completions: 0,
          clicks: 0,
        };
        return {
          id: h.id,
          name: h.name,
          icon: h.icon,
          kind: h.kind === 'tally' ? 'tally' : 'check',
          questName: h.quest?.name ?? null,
          ...stats,
        };
      }),
    };
  }

  private parseGrain(raw?: string): HabitStatsGrain {
    if (raw === 'week' || raw === 'month' || raw === 'year' || raw === 'all') {
      return raw;
    }
    return 'day';
  }

  private bucketKey(
    iso: string,
    grain: HabitStatsGrain,
  ): { key: string; label: string } {
    if (grain === 'year' || grain === 'all') {
      const year = iso.slice(0, 4);
      return { key: year, label: year };
    }
    if (grain === 'month') {
      const key = iso.slice(0, 7);
      return { key, label: key };
    }
    if (grain === 'week') {
      const start = this.time.weekDates(iso)[0];
      return { key: start, label: `Week of ${start}` };
    }
    return { key: iso, label: iso };
  }

  private async ensureCompletion(
    habitId: number,
    date: string,
    keep: boolean,
  ) {
    const existing = await this.prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });
    if (keep && !existing) {
      await this.prisma.habitCompletion.create({
        data: { habitId, date, source: 'manual' },
      });
      return;
    }
    if (!keep && existing && existing.source === 'manual') {
      await this.prisma.habitCompletion.delete({
        where: { habitId_date: { habitId, date } },
      });
    }
  }

  private async require(id: number) {
    const habit = await this.prisma.habit.findUnique({ where: { id } });
    if (!habit) {
      throw new NotFoundException(`Habit #${id} not found`);
    }
    return habit;
  }

  private async resolveWrite(
    input: HabitWriteInput,
    creating: boolean,
    current?: {
      skillId: number | null;
      cadence: string;
      everyNDays: number;
      wealthCents: number;
      skillWeightsJson: string | null;
      effortLevel: number;
      durationMinutes: number;
      allowInDailies: boolean;
      kind: string;
      period: string;
      polarity: string;
      normMin: number;
      normMax: number;
      step: number;
      questId: number | null;
      sortOrder: number;
    },
  ) {
    const data: Record<string, unknown> = {};
    const cadence =
      input.cadence === 'EVERY_N_DAYS'
        ? 'EVERY_N_DAYS'
        : input.cadence === 'DAILY' || creating
          ? 'DAILY'
          : (current?.cadence ?? 'DAILY');
    if (input.cadence !== undefined || creating) {
      data.cadence = cadence;
    }
    if (input.everyNDays !== undefined || creating) {
      const n = Math.max(1, Math.round(input.everyNDays || current?.everyNDays || 1));
      data.everyNDays = cadence === 'DAILY' ? 1 : n;
    }

    let skillId =
      input.skillId === undefined
        ? (current?.skillId ?? null)
        : await this.resolveSkillId(input.skillId);

    if (input.skillWeights !== undefined) {
      const parsed = validateSkillWeights(input.skillWeights, {
        allowEmpty: true,
      });
      if (parsed.error) {
        throw new BadRequestException(parsed.error);
      }
      data.skillWeightsJson = parsed.weights.length
        ? JSON.stringify(parsed.weights)
        : null;
      if (parsed.weights.length) {
        const primary = parsed.weights.reduce((best, row) =>
          row.weight > best.weight ? row : best,
        );
        const skill = await this.prisma.skill.findUnique({
          where: { slug: primary.slug },
          select: { id: true },
        });
        if (skill) {
          skillId = skill.id;
        }
      }
    } else if (creating) {
      data.skillWeightsJson = null;
    }

    if (input.skillId !== undefined || input.skillWeights !== undefined || creating) {
      data.skillId = skillId;
    }

    if (input.wealthCents !== undefined || creating) {
      data.wealthCents = await this.resolveWealthCents(
        (data.skillId as number | null | undefined) ?? skillId,
        input.wealthCents !== undefined
          ? input.wealthCents
          : (current?.wealthCents ?? 0),
      );
    }

    if (input.effortLevel !== undefined || creating) {
      data.effortLevel = Math.min(
        10,
        Math.max(1, Math.round(input.effortLevel ?? current?.effortLevel ?? 5)),
      );
    }
    if (input.durationMinutes !== undefined || creating) {
      data.durationMinutes = Math.min(
        24 * 60,
        Math.max(
          1,
          Math.round(input.durationMinutes ?? current?.durationMinutes ?? 30),
        ),
      );
    }
    if (input.allowInDailies !== undefined || creating) {
      data.allowInDailies =
        input.allowInDailies ?? current?.allowInDailies ?? true;
    }

    const kind: HabitKind =
      input.kind === 'tally' || (creating && input.kind === 'tally')
        ? 'tally'
        : input.kind === 'check' || creating
          ? 'check'
          : current?.kind === 'tally'
            ? 'tally'
            : 'check';
    if (input.kind !== undefined || creating) {
      data.kind = kind;
    }

    if (input.period !== undefined || creating) {
      const period = String(input.period ?? current?.period ?? 'day');
      if (!isTabulaPeriod(period)) {
        throw new BadRequestException('period must be day, week, month, or year');
      }
      data.period = period;
    }
    if (input.polarity !== undefined || creating) {
      const polarity = String(input.polarity ?? current?.polarity ?? 'virtue');
      if (!isTabulaPolarity(polarity)) {
        throw new BadRequestException('polarity must be vice or virtue');
      }
      data.polarity = polarity;
    }
    if (input.normMin !== undefined || creating) {
      data.normMin = Math.max(
        0,
        Math.round(input.normMin ?? current?.normMin ?? 0),
      );
    }
    if (input.normMax !== undefined || creating) {
      data.normMax = Math.max(
        0,
        Math.round(input.normMax ?? current?.normMax ?? 1),
      );
    }
    if (
      typeof data.normMin === 'number' &&
      typeof data.normMax === 'number' &&
      data.normMax < data.normMin
    ) {
      data.normMax = data.normMin;
    }
    if (input.step !== undefined || creating) {
      data.step = Math.max(1, Math.round(input.step ?? current?.step ?? 1));
    }
    if (input.questId !== undefined || creating) {
      data.questId = await this.resolveQuestId(
        input.questId === undefined ? (current?.questId ?? null) : input.questId,
      );
    }
    return data as Record<string, unknown> & {
      name?: string;
      icon?: string;
    };
  }

  private async resolveQuestId(raw: number | null | undefined) {
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

  private habitInclude(allCompletions = false) {
    return {
      skill: {
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
          level: true,
        },
      },
      quest: { select: { id: true, name: true } },
      completions: {
        orderBy: { date: 'desc' as const },
        ...(allCompletions ? {} : { take: 120 }),
      },
    };
  }

  private async present(habit: {
    id: number;
    name: string;
    icon: string | null;
    skillId: number | null;
    cadence: string;
    everyNDays: number;
    wealthCents?: number | null;
    active: boolean;
    createdAt: Date;
    skillWeightsJson?: string | null;
    effortLevel?: number;
    durationMinutes?: number;
    allowInDailies?: boolean;
    kind?: string;
    period?: string;
    polarity?: string;
    normMin?: number;
    normMax?: number;
    step?: number;
    questId?: number | null;
    sortOrder?: number;
    skill: {
      id: number;
      name: string;
      slug: string;
      icon: string | null;
      level: number;
    } | null;
    quest?: { id: number; name: string } | null;
    completions: Array<{ date: string }>;
  }) {
    const base = this.enrich(habit);
    const kind: HabitKind = habit.kind === 'tally' ? 'tally' : 'check';
    const weights = parseSkillWeights(this.parseJson(habit.skillWeightsJson));
    const today = this.localToday();
    const doneToday = base.recentDates.includes(today);
    const shared = {
      ...base,
      kind,
      skillWeights: weights,
      effortLevel: habit.effortLevel ?? 5,
      durationMinutes: habit.durationMinutes ?? 30,
      allowInDailies: habit.allowInDailies !== false,
      period: (isTabulaPeriod(habit.period ?? '')
        ? habit.period
        : 'day') as TabulaPeriod,
      polarity: (isTabulaPolarity(habit.polarity ?? '')
        ? habit.polarity
        : 'virtue') as TabulaPolarity,
      normMin: habit.normMin ?? 0,
      normMax: habit.normMax ?? 1,
      step: Math.max(1, habit.step ?? 1),
      questId: habit.questId ?? null,
      questName: habit.quest?.name ?? null,
      sortOrder: habit.sortOrder ?? 0,
      doneToday,
    };
    if (kind !== 'tally') {
      return {
        ...shared,
        count: doneToday ? 1 : 0,
        tone: null as string | null,
        windowFrom: today,
        windowTo: today,
        windowLabel: 'Today',
      };
    }
    const period = shared.period;
    const polarity = shared.polarity;
    const window = periodWindow(today, period, this.time.weekStartsOn());
    const agg = await this.prisma.habitClick.aggregate({
      where: {
        habitId: habit.id,
        date: { gte: window.from, lte: window.to },
      },
      _sum: { delta: true },
    });
    const count = Math.max(0, agg._sum.delta ?? 0);
    return {
      ...shared,
      count,
      tone: tabulaTone(count, shared.normMin, shared.normMax, polarity),
      windowFrom: window.from,
      windowTo: window.to,
      windowLabel: periodLabel(period, window, today),
    };
  }

  private parseJson(raw: string | null | undefined): unknown {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private enrich(habit: {
    id: number;
    name: string;
    icon: string | null;
    skillId: number | null;
    cadence: string;
    everyNDays: number;
    wealthCents?: number | null;
    active: boolean;
    createdAt: Date;
    skill: {
      id: number;
      name: string;
      slug: string;
      icon: string | null;
      level: number;
    } | null;
    completions: Array<{ date: string }>;
  }) {
    const dates = [...new Set(habit.completions.map((c) => c.date))].sort();
    const { currentStreak, bestStreak } = this.computeStreaks(dates);
    const firstLog = dates[0] ?? null;
    const lastLog = dates[dates.length - 1] ?? null;
    return {
      id: habit.id,
      name: habit.name,
      icon: habit.icon,
      skillId: habit.skillId,
      skill: habit.skill,
      cadence: habit.cadence,
      everyNDays: habit.everyNDays,
      wealthCents: parseRewardCents(habit.wealthCents),
      active: habit.active,
      archived: !habit.active,
      createdAt: habit.createdAt,
      totalCompletions: dates.length,
      currentStreak: habit.active ? currentStreak : 0,
      bestStreak,
      firstLog,
      lastLog,
      recentDates: dates.slice(-14),
    };
  }

  private async resolveSkillId(raw: unknown): Promise<number | null> {
    const id = Math.round(Number(raw) || 0);
    if (id <= 0) {
      return null;
    }
    const skill = await this.prisma.skill.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!skill) {
      throw new BadRequestException(`Unknown skill #${id}`);
    }
    return skill.id;
  }

  private async resolveWealthCents(
    skillId: number | null,
    raw: unknown,
  ): Promise<number> {
    if (!skillId) {
      return 0;
    }
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
      select: { slug: true },
    });
    if (skill?.slug !== FINANCE_SKILL_SLUG) {
      return 0;
    }
    return parseRewardCents(raw);
  }

  private computeStreaks(sortedDates: string[]) {
    if (sortedDates.length === 0) {
      return { currentStreak: 0, bestStreak: 0 };
    }
    let best = 1;
    let run = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = sortedDates[i - 1];
      const cur = sortedDates[i];
      if (this.dayDiff(prev, cur) === 1) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 1;
      }
    }
    const today = this.localToday();
    const yesterday = this.offsetDate(today, -1);
    let current = 0;
    if (
      sortedDates[sortedDates.length - 1] === today ||
      sortedDates[sortedDates.length - 1] === yesterday
    ) {
      current = 1;
      for (let i = sortedDates.length - 2; i >= 0; i--) {
        if (this.dayDiff(sortedDates[i], sortedDates[i + 1]) === 1) {
          current += 1;
        } else {
          break;
        }
      }
    }
    return { currentStreak: current, bestStreak: Math.max(best, current) };
  }

  private dayDiff(a: string, b: string): number {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    const da = Date.UTC(ay, am - 1, ad);
    const db = Date.UTC(by, bm - 1, bd);
    return Math.round((db - da) / 86400000);
  }

  private localToday(): string {
    return this.time.today();
  }

  private offsetDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
}
