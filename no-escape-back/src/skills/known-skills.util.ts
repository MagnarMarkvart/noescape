import { BadRequestException } from '@nestjs/common';

type SkillLookup = {
  skill: {
    findMany(args: {
      where: { slug: { in: string[] } };
      select: { slug: true };
    }): Promise<Array<{ slug: string }>>;
  };
};

/** Reject skill slugs that are not in the catalogue (e.g. a typo like 'mind'). */
export async function assertKnownSkillSlugs(
  prisma: SkillLookup,
  slugs: string[],
): Promise<void> {
  const wanted = [...new Set(slugs.filter(Boolean))];
  if (wanted.length === 0) {
    return;
  }
  const rows = await prisma.skill.findMany({
    where: { slug: { in: wanted } },
    select: { slug: true },
  });
  const known = new Set(rows.map((r) => r.slug));
  const missing = wanted.filter((s) => !known.has(s));
  if (missing.length > 0) {
    throw new BadRequestException(`Unknown skill '${missing[0]}'`);
  }
}
