import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const skills = [
  {
    name: 'Strength',
    slug: 'strength',
    category: 'Physical',
    icon: '🏋️',
    xpSources: 'Gym: 100 XP base + 100 XP / 30 min',
    sortOrder: 1,
  },
  {
    name: 'Cardio',
    slug: 'cardio',
    category: 'Physical',
    icon: '🏃',
    xpSources: 'Run / bike / swim: 50 XP / km',
    sortOrder: 2,
  },
  {
    name: 'Mobility',
    slug: 'mobility',
    category: 'Physical',
    icon: '🧘',
    xpSources: 'Stretching / yoga: 100 XP / 15 min',
    sortOrder: 3,
  },
  {
    name: 'Focus',
    slug: 'focus',
    category: 'Mind',
    icon: '🧠',
    xpSources: 'Deep work / Pomodoro: 200 XP / 30 min',
    sortOrder: 4,
  },
  {
    name: 'Knowledge',
    slug: 'knowledge',
    category: 'Mind',
    icon: '📚',
    xpSources: 'Reading / courses: 100 XP / 15 min + 100 XP / chapter',
    sortOrder: 5,
  },
  {
    name: 'Strategy',
    slug: 'strategy',
    category: 'Mind',
    icon: '♟️',
    xpSources: 'Day plan, weekly review, journaling: 150 XP / session',
    sortOrder: 6,
  },
  {
    name: 'Dev',
    slug: 'dev',
    category: 'Career',
    icon: '💻',
    xpSources: 'Coding, PRs, new tech: 200 XP / feature',
    sortOrder: 7,
  },
  {
    name: 'Clients',
    slug: 'clients',
    category: 'Career',
    icon: '🤝',
    xpSources: 'Emails, calls, marketing, portfolio management',
    sortOrder: 8,
  },
  {
    name: 'Create',
    slug: 'create',
    category: 'Career',
    icon: '🛠️',
    xpSources: 'Passion projects, client work, job projects',
    sortOrder: 9,
  },
  {
    name: 'Order',
    slug: 'order',
    category: 'Domestic',
    icon: '🧹',
    xpSources: 'Cleaning, organizing: 100 XP / 30 min',
    sortOrder: 10,
  },
  {
    name: 'Finance',
    slug: 'finance',
    category: 'Domestic',
    icon: '💰',
    xpSources: 'Budget, bills, investments: 150 XP / session',
    sortOrder: 11,
  },
  {
    name: 'Cook',
    slug: 'cook',
    category: 'Domestic',
    icon: '🍳',
    xpSources: 'Cooking real food: 100 XP / session',
    sortOrder: 12,
  },
  {
    name: 'Relationships',
    slug: 'relationships',
    category: 'Soul',
    icon: '🔗',
    xpSources: 'Partner, friends, family: 150 XP / session (quality multiplier)',
    sortOrder: 13,
  },
  {
    name: 'Discipline',
    slug: 'discipline',
    category: 'Soul',
    icon: '⚔️',
    xpSources: 'Cold shower, early wake, scroll-free morning: 50 XP / time',
    sortOrder: 14,
  },
];

async function main() {
  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {
        name: skill.name,
        category: skill.category,
        icon: skill.icon,
        xpSources: skill.xpSources,
        sortOrder: skill.sortOrder,
      },
      create: skill,
    });
  }

  console.log(`Seeded ${skills.length} skills`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
