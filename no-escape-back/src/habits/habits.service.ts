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
import { QuestsService } from '../quests/quests.service';
import { SkillsService } from '../skills/skills.service';
import {
  addIsoDays as addIsoDays,
  evaluateHabitQuest as evaluateHabitQuest,
  parseHabitQuestRule,
  parseHabitQuestTarget,
} from './habit-quest.util';
import {
  grantHabitBoardXp,
  parseActivityIds,
  reverseHabitBoardXp,
} from './habits.xp';

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
  groupId?: number | null;
  questLink?: {
    questId: number;
    target?: string;
    subtaskId?: number | null;
    rule?: string;
    requiredCount?: number;
    windowDays?: number | null;
  } | null;
};

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly characterService: CharacterService,
    private readonly time: TimeService,
    private readonly skills: SkillsService,
    private readonly quests: QuestsService,
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
    if (input.questLink !== undefined) {
      await this.upsertQuestLink(habit.id, input.questLink);
      return this.getOne(habit.id, devBypass);
    }
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
    if (input.questLink !== undefined) {
      await this.upsertQuestLink(habitId, input.questLink);
      return this.getOne(habitId, devBypass);
    }
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
      return { habit: null, awards: [] as unknown[] };
    }
    if (habit.kind === 'tally' && source === 'daily') {
      await this.prisma.habitClick.create({
        data: { habitId, date, delta: Math.max(1, habit.step) },
      });
      return this.syncTallySuccess(habitId, date, source, dailyTaskId);
    }
    const existing = await this.prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });
    if (existing) {
      if (source === 'daily') {
        await this.prisma.habitCompletion.update({
          where: { habitId_date: { habitId, date } },
          data: { source, dailyTaskId: dailyTaskId ?? null },
        });
      }
      const view = await this.getOne(habitId);
      return { habit: view, awards: [] as unknown[] };
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
      await this.prisma.habitCompletion.update({
        where: { id: created.id },
        data: { wealthAwardedCents: wealthCents },
      });
    }
    let awards: unknown[] = [];
    if (source !== 'daily') {
      const granted = await grantHabitBoardXp({
        prisma: this.prisma,
        skills: this.skills,
        habit,
        source,
      });
      awards = granted.awards;
      if (granted.xp > 0) {
        await this.prisma.habitCompletion.update({
          where: { id: created.id },
          data: {
            xpAwarded: granted.xp,
            xpActivityIdsJson: JSON.stringify(granted.activityIds),
          },
        });
      }
    }
    await this.recordQuestDay(habitId, date, true, false);
    const view = await this.getOne(habitId);
    return { habit: view, awards };
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
      return { removed: false, date, habit: await this.getOne(habitId), awards: [] };
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
    const reversals = await reverseHabitBoardXp({
      skills: this.skills,
      prisma: this.prisma,
      activityIds: parseActivityIds(existing.xpActivityIdsJson),
    });
    await this.prisma.habitCompletion.delete({
      where: { habitId_date: { habitId, date } },
    });
    await this.recordQuestDay(habitId, date, false, false);
    return {
      removed: true,
      date,
      habit: await this.getOne(habitId),
      awards: reversals,
    };
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
    let signed = delta == null || delta === 0 ? step : Math.round(delta);
    if (signed === 0) {
      throw new BadRequestException('delta must not be 0');
    }
    const date = this.localToday();
    const period = (isTabulaPeriod(habit.period) ? habit.period : 'day') as TabulaPeriod;
    const window = periodWindow(date, period, this.time.weekStartsOn());
    const agg = await this.prisma.habitClick.aggregate({
      where: {
        habitId,
        date: { gte: window.from, lte: window.to },
      },
      _sum: { delta: true },
    });
    const current = Math.max(0, agg._sum.delta ?? 0);
    if (signed < 0 && current + signed < 0) {
      signed = -current;
    }
    if (signed === 0) {
      return { habit: await this.getOne(habitId), awards: [] as unknown[] };
    }
    await this.prisma.habitClick.create({
      data: { habitId, date, delta: signed },
    });
    return this.syncTallySuccess(habitId, date, 'manual');
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
    return this.syncTallySuccess(habitId, today, 'manual');
  }

  async listGroups() {
    return this.prisma.habitGroup.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createGroup(name: string) {
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) {
      throw new BadRequestException('name is required');
    }
    const max = await this.prisma.habitGroup.aggregate({ _max: { sortOrder: true } });
    return this.prisma.habitGroup.create({
      data: { name: trimmed, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  }

  async renameGroup(id: number, name: string) {
    await this.requireGroup(id);
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) {
      throw new BadRequestException('name is required');
    }
    return this.prisma.habitGroup.update({ where: { id }, data: { name: trimmed } });
  }

  async removeGroup(id: number) {
    await this.requireGroup(id);
    await this.prisma.habit.updateMany({
      where: { groupId: id },
      data: { groupId: null },
    });
    await this.prisma.habitGroup.delete({ where: { id } });
    return { deleted: true, id };
  }

  async placeHabit(habitId: number, groupId: number | null, sortOrder?: number) {
    await this.require(habitId);
    const resolved =
      groupId != null && groupId > 0 ? groupId : null;
    if (resolved != null) {
      await this.requireGroup(resolved);
    }
    return this.present(
      await this.prisma.habit.update({
        where: { id: habitId },
        data: {
          groupId: resolved,
          ...(sortOrder != null ? { sortOrder } : {}),
        },
        include: this.habitInclude(),
      }),
    );
  }

  async upsertQuestLink(
    habitId: number,
    link: HabitWriteInput['questLink'] | undefined | null,
  ) {
    await this.require(habitId);
    if (link === undefined) {
      return this.getOne(habitId);
    }
    if (link === null || !link.questId) {
      await this.prisma.habitQuestLink.deleteMany({ where: { habitId } });
      await this.prisma.habit.update({
        where: { id: habitId },
        data: { questId: null },
      });
      return this.getOne(habitId);
    }
    const questId = await this.resolveQuestId(link.questId);
    if (!questId) {
      throw new BadRequestException('questId is required');
    }
    const target = parseHabitQuestTarget(link.target);
    let subtaskId: number | null = null;
    if (target === 'SUBTASK') {
      const sid = Math.round(Number(link.subtaskId) || 0);
      if (sid < 1) {
        throw new BadRequestException('subtaskId is required for SUBTASK links');
      }
      const sub = await this.prisma.questSubtask.findFirst({
        where: { id: sid, questId },
        select: { id: true },
      });
      if (!sub) {
        throw new BadRequestException('Subtask does not belong to that quest');
      }
      subtaskId = sub.id;
    }
    const rule = parseHabitQuestRule(link.rule);
    const requiredCount = Math.max(1, Math.round(link.requiredCount ?? 1));
    const windowDays =
      rule === 'WINDOW'
        ? Math.max(1, Math.round(link.windowDays ?? 7))
        : null;
    await this.prisma.habitQuestLink.upsert({
      where: { habitId },
      create: {
        habitId,
        questId,
        target,
        subtaskId,
        rule,
        requiredCount,
        windowDays,
      },
      update: {
        questId,
        target,
        subtaskId,
        rule,
        requiredCount,
        windowDays,
      },
    });
    await this.prisma.habit.update({
      where: { id: habitId },
      data: { questId },
    });
    return this.getOne(habitId);
  }

  async listQuestEvents(habitId: number) {
    await this.require(habitId);
    return this.prisma.habitQuestEvent.findMany({
      where: { habitId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
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
      marks: Array<{ id: number; icon: string | null; done: boolean }>;
    }> = [];
    if (grain !== 'all') {
      let cursor = from;
      while (cursor <= to) {
        days.push({
          date: cursor,
          points: 0,
          completions: 0,
          clicks: 0,
          marks: [],
        });
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

    const doneByDate = new Map<string, Set<number>>();
    for (const row of completions) {
      const set = doneByDate.get(row.date) ?? new Set<number>();
      set.add(row.habitId);
      doneByDate.set(row.date, set);
    }

    const days: Array<{
      date: string;
      points: number;
      completions: number;
      clicks: number;
      marks: Array<{ id: number; icon: string | null; done: boolean }>;
    }> = [];
    let cursor = from;
    while (cursor <= to) {
      const row = dayMap.get(cursor) ?? { points: 0, completions: 0, clicks: 0 };
      days.push({
        date: cursor,
        ...row,
        marks: this.checkMarksForDay(cursor, today, habits, doneByDate),
      });
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

  private async syncTallySuccess(
    habitId: number,
    date: string,
    source: string,
    dailyTaskId?: number | null,
  ) {
    const habit = await this.require(habitId);
    const today = this.localToday();
    const period = (isTabulaPeriod(habit.period) ? habit.period : 'day') as TabulaPeriod;
    const polarity = (isTabulaPolarity(habit.polarity)
      ? habit.polarity
      : 'virtue') as TabulaPolarity;
    const window = periodWindow(today, period, this.time.weekStartsOn());
    const agg = await this.prisma.habitClick.aggregate({
      where: {
        habitId,
        date: { gte: window.from, lte: window.to },
      },
      _sum: { delta: true },
    });
    const count = Math.max(0, agg._sum.delta ?? 0);
    const inBand =
      tabulaTone(count, habit.normMin, habit.normMax, polarity) !== 'poor';
    const existing = await this.prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });
    let awards: unknown[] = [];
    if (inBand && !existing) {
      const created = await this.prisma.habitCompletion.create({
        data: {
          habitId,
          date,
          source,
          dailyTaskId: dailyTaskId ?? null,
        },
      });
      if (source !== 'daily') {
        const granted = await grantHabitBoardXp({
          prisma: this.prisma,
          skills: this.skills,
          habit,
          source,
        });
        awards = granted.awards;
        if (granted.xp > 0) {
          await this.prisma.habitCompletion.update({
            where: { id: created.id },
            data: {
              xpAwarded: granted.xp,
              xpActivityIdsJson: JSON.stringify(granted.activityIds),
            },
          });
        }
      }
      await this.recordQuestDay(habitId, date, true, true);
    } else if (!inBand && existing) {
      awards = await reverseHabitBoardXp({
        skills: this.skills,
        prisma: this.prisma,
        activityIds: parseActivityIds(existing.xpActivityIdsJson),
      });
      await this.prisma.habitCompletion.delete({
        where: { habitId_date: { habitId, date } },
      });
      await this.recordQuestDay(habitId, date, false, false);
    } else if (inBand && existing && source === 'daily') {
      await this.prisma.habitCompletion.update({
        where: { id: existing.id },
        data: { source, dailyTaskId: dailyTaskId ?? null },
      });
    }
    return { habit: await this.getOne(habitId), awards };
  }

  private async recordQuestDay(
    habitId: number,
    date: string,
    success: boolean,
    tallyInBand: boolean,
  ) {
    const link = await this.prisma.habitQuestLink.findUnique({
      where: { habitId },
      include: {
        events: { orderBy: [{ date: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!link) {
      return;
    }
    const today = this.localToday();
    const rule = parseHabitQuestRule(link.rule);
    let snapshot = evaluateHabitQuest(
      link.events,
      rule,
      link.requiredCount,
      link.windowDays,
      today,
    );
    if (snapshot.needsReset) {
      await this.prisma.habitQuestEvent.create({
        data: {
          linkId: link.id,
          habitId,
          date,
          success: false,
          kind: 'reset',
          tallyInBand,
          note: 'Rule reset',
        },
      });
    }
    await this.prisma.habitQuestEvent.create({
      data: {
        linkId: link.id,
        habitId,
        date,
        success,
        kind: success ? 'progress' : 'miss',
        tallyInBand,
      },
    });
    const events = await this.prisma.habitQuestEvent.findMany({
      where: { linkId: link.id },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    snapshot = evaluateHabitQuest(
      events,
      rule,
      link.requiredCount,
      link.windowDays,
      today,
    );
    if (snapshot.completed && !events.some((e) => e.kind === 'complete')) {
      await this.prisma.habitQuestEvent.create({
        data: {
          linkId: link.id,
          habitId,
          date,
          success: true,
          kind: 'complete',
          tallyInBand,
        },
      });
      await this.quests.applyHabitusProgress({
        questId: link.questId,
        target: parseHabitQuestTarget(link.target),
        subtaskId: link.subtaskId,
        date,
        note: 'Habitus',
      });
    }
  }

  private withBoardFlags(
    habit: {
      cadence: string;
      everyNDays: number;
      kind?: string;
      period?: string;
      group?: { id: number; name: string; sortOrder: number } | null;
      groupId?: number | null;
      questLink?: {
        id: number;
        questId: number;
        target: string;
        subtaskId: number | null;
        rule: string;
        requiredCount: number;
        windowDays: number | null;
        quest?: { id: number; name: string };
        subtask?: { id: number; title: string } | null;
        events: Array<{
          date: string;
          success: boolean;
          kind: string;
          tallyInBand: boolean;
          note: string | null;
        }>;
      } | null;
    },
    view: Record<string, unknown> & {
      lastLog?: string | null;
      doneToday?: boolean;
    },
    today: string,
    successfulToday: boolean,
  ) {
    const n =
      habit.cadence === 'EVERY_N_DAYS'
        ? Math.max(1, habit.everyNDays || 1)
        : 1;
    const last = view.lastLog ?? null;
    const period = habit.period ?? 'day';
    let dueToday = !successfulToday;
    if (habit.kind === 'tally') {
      dueToday = true;
    } else if (successfulToday) {
      dueToday = false;
    } else if (last) {
      dueToday = addIsoDays(last, n) <= today;
    } else {
      dueToday = true;
    }
    const link = habit.questLink;
    const progress = link
      ? evaluateHabitQuest(
          link.events,
          parseHabitQuestRule(link.rule),
          link.requiredCount,
          link.windowDays,
          today,
        )
      : null;
    return {
      ...view,
      successfulToday,
      dueToday,
      groupId: habit.group?.id ?? habit.groupId ?? null,
      groupName: habit.group?.name ?? null,
      questLink: link
        ? {
            questId: link.questId,
            questName: link.quest?.name ?? null,
            target: parseHabitQuestTarget(link.target),
            subtaskId: link.subtaskId,
            subtaskTitle: link.subtask?.title ?? null,
            rule: parseHabitQuestRule(link.rule),
            requiredCount: link.requiredCount,
            windowDays: link.windowDays,
            progress: progress?.progress ?? 0,
            completed: progress?.completed ?? false,
            events: link.events,
          }
        : null,
    };
  }

  private async requireGroup(id: number) {
    const group = await this.prisma.habitGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Habit group #${id} not found`);
    }
    return group;
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
    if (kind === 'tally') {
      data.allowInDailies = false;
    }
    if (input.groupId !== undefined) {
      if (input.groupId == null || input.groupId === 0) {
        data.groupId = null;
      } else {
        await this.requireGroup(input.groupId);
        data.groupId = input.groupId;
      }
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
      group: { select: { id: true, name: true, sortOrder: true } },
      questLink: {
        include: {
          events: { orderBy: { date: 'asc' as const } },
          subtask: { select: { id: true, title: true } },
          quest: { select: { id: true, name: true } },
        },
      },
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
    group?: { id: number; name: string; sortOrder: number } | null;
    questLink?: {
      id: number;
      questId: number;
      target: string;
      subtaskId: number | null;
      rule: string;
      requiredCount: number;
      windowDays: number | null;
      quest?: { id: number; name: string };
      subtask?: { id: number; title: string } | null;
      events: Array<{
        date: string;
        success: boolean;
        kind: string;
        tallyInBand: boolean;
        note: string | null;
      }>;
    } | null;
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
      allowInDailies: kind === 'tally' ? false : habit.allowInDailies !== false,
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
      return this.withBoardFlags(
        habit,
        {
          ...shared,
          count: doneToday ? 1 : 0,
          tone: null as string | null,
          windowFrom: today,
          windowTo: today,
          windowLabel: 'Today',
        },
        today,
        doneToday,
      );
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
    const tone = tabulaTone(count, shared.normMin, shared.normMax, polarity);
    return this.withBoardFlags(
      habit,
      {
        ...shared,
        count,
        tone,
        windowFrom: window.from,
        windowTo: window.to,
        windowLabel: periodLabel(period, window, today),
        doneToday: tone !== 'poor',
      },
      today,
      tone !== 'poor',
    );
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

  private checkMarksForDay(
    date: string,
    today: string,
    habits: Array<{
      id: number;
      icon: string | null;
      kind: string;
      cadence: string;
      everyNDays: number;
      createdAt: Date;
    }>,
    doneByDate: Map<string, Set<number>>,
  ): Array<{ id: number; icon: string | null; done: boolean }> {
    const done = doneByDate.get(date) ?? new Set<number>();
    return habits
      .filter((h) => h.kind !== 'tally' && this.checkAssignedOn(h, date, today))
      .map((h) => ({
        id: h.id,
        icon: h.icon,
        done: done.has(h.id),
      }));
  }

  private checkAssignedOn(
    habit: { cadence: string; everyNDays: number; createdAt: Date },
    date: string,
    today: string,
  ): boolean {
    if (date > today) {
      return false;
    }
    const created = this.toIsoDate(habit.createdAt);
    if (date < created) {
      return false;
    }
    if (habit.cadence !== 'EVERY_N_DAYS') {
      return true;
    }
    const n = Math.max(1, habit.everyNDays || 1);
    return this.dayDiff(created, date) % n === 0;
  }

  private toIsoDate(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
