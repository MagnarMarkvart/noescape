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
import { SkillsService } from '../skills/skills.service';

type SkillReq = { slug: string; level: number };
type XpPlan = {
  dayXp: number[];
  completionBonus?: Record<string, number>;
};

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
    private readonly characterService: CharacterService,
  ) {}

  async list(filter: string = 'all') {
    const quests = await this.prisma.quest.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });
    const skillLevels = await this.skillLevelMap();
    const completedSlugs = await this.completedQuestSlugs();
    const features = await this.featureMap();

    const views = quests.map((q) =>
      this.toQuestView(q, skillLevels, completedSlugs, features),
    );

    switch (filter) {
      case 'available':
        return views.filter((v) => v.availability === 'available');
      case 'locked':
        return views.filter((v) => v.availability === 'locked');
      case 'active':
        return views.filter((v) => v.run?.status === 'ACTIVE');
      case 'completed':
        return views.filter(
          (v) =>
            v.run?.status === 'COMPLETED' ||
            completedSlugs.has(v.slug),
        );
      default:
        return views;
    }
  }

  async listActive() {
    const runs = await this.prisma.questRun.findMany({
      where: { status: 'ACTIVE' },
      include: { quest: true },
      orderBy: { startedAt: 'asc' },
    });
    return runs.map((run) => ({
      runId: run.id,
      questId: run.questId,
      slug: run.quest.slug,
      name: run.quest.name,
      tier: run.quest.tier,
      streakCount: run.streakCount,
      bestStreak: run.bestStreak,
      durationDays: run.quest.durationDays,
      kind: run.quest.kind,
      lastLogDate: run.lastLogDate,
      startedAt: run.startedAt,
    }));
  }

  async getOne(id: number) {
    const quest = await this.prisma.quest.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          include: { logs: { orderBy: { date: 'desc' }, take: 30 } },
        },
      },
    });
    if (!quest) {
      throw new NotFoundException(`Quest #${id} not found`);
    }
    const skillLevels = await this.skillLevelMap();
    const completedSlugs = await this.completedQuestSlugs();
    const features = await this.featureMap();
    return this.toQuestView(quest, skillLevels, completedSlugs, features);
  }

  async create(input: {
    name: string;
    summary?: string;
    description?: string;
    tier?: string;
    skillSlug?: string;
    skillReqs?: SkillReq[];
    unlockReqs?: string[];
    questReqs?: string[];
  }) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }
    const slug = this.slugify(name);
    const exists = await this.prisma.quest.findUnique({ where: { slug } });
    if (exists) {
      throw new BadRequestException('A quest with this name already exists');
    }
    const created = await this.prisma.quest.create({
      data: {
        slug,
        name,
        tier: input.tier?.trim() || 'NOVICE',
        summary: input.summary?.trim() || name,
        description: input.description?.trim() || input.summary?.trim() || name,
        skillSlug: input.skillSlug?.trim() || null,
        kind: 'GENERIC',
        skillReqsJson: input.skillReqs?.length
          ? JSON.stringify(input.skillReqs)
          : null,
        unlockReqsJson: input.unlockReqs?.length
          ? JSON.stringify(input.unlockReqs)
          : null,
        questReqsJson: input.questReqs?.length
          ? JSON.stringify(input.questReqs)
          : null,
        createdByUser: true,
        sortOrder: 100,
      },
    });
    return this.getOne(created.id);
  }

  async start(questId: number) {
    const quest = await this.prisma.quest.findUnique({ where: { id: questId } });
    if (!quest) {
      throw new NotFoundException(`Quest #${questId} not found`);
    }
    const skillLevels = await this.skillLevelMap();
    const completedSlugs = await this.completedQuestSlugs();
    const features = await this.featureMap();
    const view = this.toQuestView(
      { ...quest, runs: [] },
      skillLevels,
      completedSlugs,
      features,
    );
    if (view.availability === 'locked') {
      throw new BadRequestException(
        `Requirements not met: ${view.requirements
          .filter((r) => !r.met)
          .map((r) => r.label)
          .join(', ')}`,
      );
    }
    const existing = await this.prisma.questRun.findFirst({
      where: { questId, status: 'ACTIVE' },
    });
    if (existing) {
      return this.getOne(questId);
    }
    await this.prisma.questRun.create({
      data: { questId, status: 'ACTIVE' },
    });
    return this.getOne(questId);
  }

  async logDay(
    runId: number,
    input: { result: 'CLEAN' | 'BROKEN'; date?: string; note?: string },
  ) {
    const run = await this.prisma.questRun.findUnique({
      where: { id: runId },
      include: { quest: true },
    });
    if (!run) {
      throw new NotFoundException(`Quest run #${runId} not found`);
    }
    if (run.status !== 'ACTIVE') {
      throw new BadRequestException('Quest is not active');
    }
    if (run.quest.kind !== 'STREAK_LOG') {
      throw new BadRequestException('This quest does not use daily streak logs');
    }

    const date = input.date?.trim() || this.localToday();
    const existingLog = await this.prisma.questDayLog.findUnique({
      where: { runId_date: { runId, date } },
    });
    if (existingLog) {
      throw new BadRequestException('Already logged for this date');
    }

    // Missed days break the streak automatically.
    let streak = run.streakCount;
    if (run.lastLogDate && run.lastLogDate !== date) {
      const yesterday = this.offsetDate(date, -1);
      if (run.lastLogDate !== yesterday) {
        streak = 0;
      }
    }

    const plan = this.parseXpPlan(run.quest.xpPlanJson);
    let xpAwarded = 0;
    let awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];

    if (input.result === 'BROKEN') {
      streak = 0;
    } else {
      streak += 1;
      const dayIndex = Math.min(streak, plan.dayXp.length) - 1;
      xpAwarded = plan.dayXp[Math.max(0, dayIndex)] ?? 0;
      if (xpAwarded > 0 && run.quest.skillSlug) {
        const skill = await this.prisma.skill.findUnique({
          where: { slug: run.quest.skillSlug },
        });
        if (skill) {
          awards.push(
            await this.skillsService.awardXp(skill.id, {
              xpGained: xpAwarded,
              note: `${run.quest.name}: day ${streak} clean`,
            }),
          );
        }
      }
    }

    const bestStreak = Math.max(run.bestStreak, streak);
    const targetDays = run.quest.durationDays ?? plan.dayXp.length;
    const completed = input.result === 'CLEAN' && streak >= targetDays;

    await this.prisma.questDayLog.create({
      data: {
        runId,
        date,
        result: input.result,
        xpAwarded,
        note: input.note?.trim() || null,
      },
    });

    await this.prisma.questRun.update({
      where: { id: runId },
      data: {
        streakCount: streak,
        bestStreak,
        lastLogDate: date,
        status: completed ? 'COMPLETED' : 'ACTIVE',
        completedAt: completed ? new Date() : null,
      },
    });

    let completionAwards: typeof awards = [];
    let unlocked: string[] = [];
    if (completed) {
      const result = await this.completeQuest(run.questId, run.quest);
      completionAwards = result.awards;
      unlocked = result.unlocked;
    }

    return {
      streakCount: streak,
      bestStreak,
      xpAwarded,
      completed,
      awards: [...awards, ...completionAwards],
      unlocked,
      quest: await this.getOne(run.questId),
    };
  }

  private async completeQuest(
    questId: number,
    quest: {
      slug: string;
      name: string;
      rewardJson: string | null;
      xpPlanJson: string | null;
      skillSlug: string | null;
    },
  ) {
    const plan = this.parseXpPlan(quest.xpPlanJson);
    const awards: Awaited<ReturnType<SkillsService['awardXp']>>[] = [];
    const unlocked: string[] = [];

    if (plan.completionBonus) {
      for (const [slug, xp] of Object.entries(plan.completionBonus)) {
        const skill = await this.prisma.skill.findUnique({ where: { slug } });
        if (skill && xp > 0) {
          awards.push(
            await this.skillsService.awardXp(skill.id, {
              xpGained: xp,
              note: `${quest.name}: quest complete`,
            }),
          );
        }
      }
    }

    const rewards = this.parseJson<{
      title?: string;
      features?: string[];
      permissionKeys?: string[];
    }>(quest.rewardJson);

    if (rewards?.title) {
      await this.characterService.setTitle(rewards.title);
      unlocked.push(`Title: ${rewards.title}`);
    }
    for (const key of rewards?.features ?? []) {
      await this.characterService.unlockFeature(key);
      unlocked.push(key);
    }
    // Focus Tool gear etc. — mark matching Reward rows unlocked by permissionKey.
    for (const key of rewards?.permissionKeys ?? []) {
      await this.prisma.reward.updateMany({
        where: { permissionKey: key },
        data: { unlocked: true },
      });
      unlocked.push(key);
    }

    if (quest.slug === 'custodia-mentis') {
      await this.characterService.unlockFeature(FEATURE_HABITUS);
      if (!unlocked.includes(FEATURE_HABITUS)) {
        unlocked.push(FEATURE_HABITUS);
      }
    }

    return { awards, unlocked };
  }

  private toQuestView(
    quest: {
      id: number;
      slug: string;
      name: string;
      tier: string;
      summary: string;
      description: string;
      coverImage: string | null;
      skillSlug: string | null;
      durationDays: number | null;
      kind: string;
      skillReqsJson: string | null;
      unlockReqsJson: string | null;
      questReqsJson: string | null;
      rewardJson: string | null;
      xpPlanJson: string | null;
      createdByUser: boolean;
      sortOrder: number;
      createdAt: Date;
      runs: Array<{
        id: number;
        status: string;
        streakCount: number;
        bestStreak: number;
        startedAt: Date;
        completedAt: Date | null;
        lastLogDate: string | null;
        logs?: Array<{
          id: number;
          date: string;
          result: string;
          xpAwarded: number;
          note: string | null;
        }>;
      }>;
    },
    skillLevels: Map<string, { level: number; name: string }>,
    completedSlugs: Set<string>,
    features: Map<string, boolean>,
  ) {
    const skillReqs = this.parseJson<SkillReq[]>(quest.skillReqsJson) ?? [];
    const unlockReqs = this.parseJson<string[]>(quest.unlockReqsJson) ?? [];
    const questReqs = this.parseJson<string[]>(quest.questReqsJson) ?? [];

    const requirements = [
      ...skillReqs.map((r) => {
        const have = skillLevels.get(r.slug)?.level ?? 0;
        const name = skillLevels.get(r.slug)?.name ?? r.slug;
        return {
          kind: 'skill' as const,
          label: `${name} Lv ${r.level}`,
          met: have >= r.level,
          detail: `yours ${have}`,
        };
      }),
      ...unlockReqs.map((key) => ({
        kind: 'unlock' as const,
        label: key,
        met: features.get(key) === true,
        detail: features.get(key) ? 'unlocked' : 'locked',
      })),
      ...questReqs.map((slug) => ({
        kind: 'quest' as const,
        label: `Quest: ${slug}`,
        met: completedSlugs.has(slug),
        detail: completedSlugs.has(slug) ? 'done' : 'incomplete',
      })),
    ];

    const activeRun = quest.runs.find((r) => r.status === 'ACTIVE') ?? null;
    const latestRun = quest.runs[0] ?? null;
    const allMet = requirements.every((r) => r.met);
    let availability: 'available' | 'locked' | 'active' | 'completed' =
      'available';
    if (activeRun) {
      availability = 'active';
    } else if (latestRun?.status === 'COMPLETED' || completedSlugs.has(quest.slug)) {
      availability = 'completed';
    } else if (!allMet) {
      availability = 'locked';
    }

    return {
      id: quest.id,
      slug: quest.slug,
      name: quest.name,
      tier: quest.tier,
      summary: quest.summary,
      description: quest.description,
      coverImage: quest.coverImage,
      coverUrl: quest.coverImage
        ? `/assets/images/quests/${quest.coverImage}`
        : null,
      skillSlug: quest.skillSlug,
      durationDays: quest.durationDays,
      kind: quest.kind,
      createdByUser: quest.createdByUser,
      xpPlan: this.parseXpPlan(quest.xpPlanJson),
      rewards: this.parseJson(quest.rewardJson),
      requirements,
      availability,
      canStart: availability === 'available' || availability === 'completed',
      run: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            streakCount: latestRun.streakCount,
            bestStreak: latestRun.bestStreak,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            lastLogDate: latestRun.lastLogDate,
            logs: latestRun.logs ?? [],
          }
        : null,
    };
  }

  private async skillLevelMap() {
    const skills = await this.prisma.skill.findMany({
      select: { slug: true, name: true, level: true },
    });
    return new Map(skills.map((s) => [s.slug, { level: s.level, name: s.name }]));
  }

  private async completedQuestSlugs() {
    const rows = await this.prisma.questRun.findMany({
      where: { status: 'COMPLETED' },
      select: { quest: { select: { slug: true } } },
    });
    return new Set(rows.map((r) => r.quest.slug));
  }

  private async featureMap() {
    const rows = await this.prisma.featureUnlock.findMany();
    return new Map(rows.map((r) => [r.key, r.unlocked]));
  }

  private parseXpPlan(raw: string | null): XpPlan {
    const parsed = this.parseJson<XpPlan>(raw);
    return {
      dayXp: parsed?.dayXp?.length ? parsed.dayXp : [0],
      completionBonus: parsed?.completionBonus,
    };
  }

  private parseJson<T>(raw: string | null): T | null {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
  }

  private localToday(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private offsetDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }
}
