import { PrismaService } from '../prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { calculateHabitBoardXp } from '../xp/daily-xp.util';
import {
  parseSkillWeights,
  splitQuestXp,
} from '../xp/quest-xp.util';

export async function grantHabitBoardXp(opts: {
  prisma: PrismaService;
  skills: SkillsService;
  habit: {
    id: number;
    name: string;
    kind: string;
    allowInDailies: boolean;
    effortLevel: number;
    durationMinutes: number;
    skillId: number | null;
    skillWeightsJson: string | null;
  };
  source: string;
}): Promise<{ xp: number; activityIds: number[]; awards: unknown[] }> {
  if (opts.source === 'daily') {
    return { xp: 0, activityIds: [], awards: [] };
  }
  const xp = calculateHabitBoardXp({
    kind: opts.habit.kind === 'tally' ? 'tally' : 'check',
    allowInDailies: opts.habit.allowInDailies !== false,
    effortLevel: opts.habit.effortLevel ?? 5,
    durationMinutes: opts.habit.durationMinutes ?? 30,
  });
  if (xp <= 0) {
    return { xp: 0, activityIds: [], awards: [] };
  }
  const weights = parseSkillWeights(parseJson(opts.habit.skillWeightsJson));
  const shares =
    weights.length > 0
      ? splitQuestXp(xp, weights)
      : opts.habit.skillId
        ? null
        : [];
  const awards: unknown[] = [];
  const activityIds: number[] = [];
  if (shares === null) {
    const award = await opts.skills.awardXp(opts.habit.skillId!, {
      xpGained: xp,
      note: `Habit: ${opts.habit.name}`,
    });
    awards.push(award);
    activityIds.push(award.activity.id);
    return { xp, activityIds, awards };
  }
  const skills = await opts.prisma.skill.findMany({
    where: { slug: { in: shares.map((s) => s.slug) } },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(skills.map((s) => [s.slug, s.id]));
  for (const share of shares) {
    const skillId = bySlug.get(share.slug);
    if (!skillId || share.xp <= 0) {
      continue;
    }
    const award = await opts.skills.awardXp(skillId, {
      xpGained: share.xp,
      note: `Habit: ${opts.habit.name}`,
    });
    awards.push(award);
    activityIds.push(award.activity.id);
  }
  return { xp, activityIds, awards };
}

export async function reverseHabitBoardXp(opts: {
  skills: SkillsService;
  prisma: PrismaService;
  activityIds: number[];
}): Promise<unknown[]> {
  if (!opts.activityIds.length) {
    return [];
  }
  const activities = await opts.prisma.activity.findMany({
    where: { id: { in: opts.activityIds } },
  });
  const byId = new Map(activities.map((a) => [a.id, a]));
  const reversals: unknown[] = [];
  for (const id of opts.activityIds) {
    const activity = byId.get(id);
    if (!activity) {
      continue;
    }
    reversals.push(
      await opts.skills.reverseXp(activity.skillId, activity.xpGained, activity.id),
    );
  }
  return reversals;
}

export function parseActivityIds(raw?: string | null): number[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

function parseJson(raw?: string | null): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
