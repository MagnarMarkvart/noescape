import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CharacterService,
  FEATURE_HABITUS,
} from '../character/character.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService } from '../time/time.service';

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

  async assertUnlocked(devBypass = false) {
    if (devBypass) {
      return;
    }
    const ok = await this.characterService.isFeatureUnlocked(FEATURE_HABITUS);
    if (!ok) {
      throw new BadRequestException(
        'Habitus is locked. Complete Custodia Mentis first.',
      );
    }
  }

  async list(devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habits = await this.prisma.habit.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: this.habitInclude(),
    });
    return habits.map((h) => this.enrich(h));
  }

  /** All habits ever created (active + archived), with full stats. */
  async listProgression(devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habits = await this.prisma.habit.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: this.habitInclude(true),
    });
    return habits.map((h) => this.enrich(h));
  }

  async create(
    input: {
      name: string;
      icon?: string;
      skillId?: number;
      cadence?: string;
      everyNDays?: number;
    },
    devBypass = false,
  ) {
    await this.assertUnlocked(devBypass);
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const cadence = input.cadence === 'EVERY_N_DAYS' ? 'EVERY_N_DAYS' : 'DAILY';
    const everyNDays = Math.max(1, Math.round(input.everyNDays || 1));
    const habit = await this.prisma.habit.create({
      data: {
        name,
        icon: input.icon?.trim() || '◆',
        skillId: input.skillId ?? null,
        cadence,
        everyNDays: cadence === 'DAILY' ? 1 : everyNDays,
      },
      include: this.habitInclude(),
    });
    return this.enrich(habit);
  }

  async setArchived(habitId: number, archived: boolean, devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habit = await this.prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    const updated = await this.prisma.habit.update({
      where: { id: habitId },
      data: { active: !archived },
      include: this.habitInclude(true),
    });
    return this.enrich(updated);
  }

  async remove(habitId: number, devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habit = await this.prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    await this.prisma.habit.delete({ where: { id: habitId } });
    return { deleted: true, id: habitId };
  }

  async rangeLog(
    habitId: number,
    from: string,
    to: string,
    devBypass = false,
  ) {
    await this.assertUnlocked(devBypass);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException('from/to must be YYYY-MM-DD');
    }
    if (from > to) {
      throw new BadRequestException('from must be ≤ to');
    }
    const habit = await this.prisma.habit.findUnique({
      where: { id: habitId },
      include: {
        skill: {
          select: { id: true, name: true, slug: true, icon: true, level: true },
        },
        completions: { orderBy: { date: 'desc' }, take: 400 },
      },
    });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    const completions = await this.prisma.habitCompletion.findMany({
      where: { habitId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    const byDate = new Map(completions.map((c) => [c.date, c]));
    const days: Array<{
      date: string;
      completed: boolean;
      source: string | null;
    }> = [];
    let cursor = from;
    while (cursor <= to) {
      const hit = byDate.get(cursor);
      days.push({
        date: cursor,
        completed: Boolean(hit),
        source: hit?.source ?? null,
      });
      cursor = this.offsetDate(cursor, 1);
    }
    return {
      habit: this.enrich(habit),
      from,
      to,
      days,
      completedCount: completions.length,
    };
  }

  async monthLog(habitId: number, year: number, month: number, devBypass = false) {
    await this.assertUnlocked(devBypass);
    const habit = await this.prisma.habit.findUnique({
      where: { id: habitId },
      include: {
        skill: {
          select: { id: true, name: true, slug: true, icon: true, level: true },
        },
      },
    });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const completions = await this.prisma.habitCompletion.findMany({
      where: { habitId, date: { startsWith: prefix } },
      orderBy: { date: 'asc' },
    });
    const all = await this.prisma.habitCompletion.findMany({
      where: { habitId },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
      const hit = completions.find((c) => c.date === date);
      return {
        date,
        completed: Boolean(hit),
        source: hit?.source ?? null,
      };
    });

    return {
      habit: this.enrich({
        ...habit,
        completions: all.map((d) => ({
          ...d,
          id: 0,
          habitId,
          source: 'manual',
          dailyTaskId: null,
          createdAt: new Date(),
        })),
      }),
      year,
      month,
      days,
      completedCount: completions.length,
    };
  }

  async markComplete(
    habitId: number,
    date: string,
    source = 'manual',
    dailyTaskId?: number | null,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    if (date > this.localToday()) {
      throw new BadRequestException('Cannot log habits in the future');
    }
    const habit = await this.prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    if (!habit.active) {
      if (source === 'manual') {
        throw new BadRequestException('Habit is archived');
      }
      return null;
    }
    return this.prisma.habitCompletion.upsert({
      where: { habitId_date: { habitId, date } },
      update: { source, dailyTaskId: dailyTaskId ?? null },
      create: {
        habitId,
        date,
        source,
        dailyTaskId: dailyTaskId ?? null,
      },
    });
  }

  async uncomplete(habitId: number, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }
    const habit = await this.prisma.habit.findUnique({ where: { id: habitId } });
    if (!habit) {
      throw new NotFoundException(`Habit #${habitId} not found`);
    }
    if (!habit.active) {
      throw new BadRequestException('Habit is archived');
    }
    const existing = await this.prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });
    if (!existing) {
      return { removed: false, date };
    }
    await this.prisma.habitCompletion.delete({
      where: { habitId_date: { habitId, date } },
    });
    return { removed: true, date };
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
      completions: {
        orderBy: { date: 'desc' as const },
        ...(allCompletions ? {} : { take: 120 }),
      },
    };
  }

  private enrich(habit: {
    id: number;
    name: string;
    icon: string | null;
    skillId: number | null;
    cadence: string;
    everyNDays: number;
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
