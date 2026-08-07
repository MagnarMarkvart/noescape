import { PrismaClient, UnlockType } from '@prisma/client';

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
    name: 'Hygiene',
    slug: 'hygiene',
    category: 'Physical',
    icon: '🚿',
    xpSources: 'Shower, shave, deodorant: fixed daily presets',
    sortOrder: 4,
  },
  {
    name: 'Focus',
    slug: 'focus',
    category: 'Mind',
    icon: '🧠',
    xpSources: 'Horologium deep work: baseline + work minutes × dedicated bonus',
    sortOrder: 5,
  },
  {
    name: 'Knowledge',
    slug: 'knowledge',
    category: 'Mind',
    icon: '📚',
    xpSources: 'Reading / courses: 100 XP / 15 min + 100 XP / chapter',
    sortOrder: 6,
  },
  {
    name: 'Strategy',
    slug: 'strategy',
    category: 'Mind',
    icon: '♟️',
    xpSources: 'Day plan, weekly review, journaling: 150 XP / session',
    sortOrder: 7,
  },
  {
    name: 'Dev',
    slug: 'dev',
    category: 'Career',
    icon: '💻',
    xpSources: 'Coding, PRs, new tech: 200 XP / feature',
    sortOrder: 8,
  },
  {
    name: 'Clients',
    slug: 'clients',
    category: 'Career',
    icon: '🤝',
    xpSources: 'Emails, calls, marketing, portfolio management',
    sortOrder: 9,
  },
  {
    name: 'Create',
    slug: 'create',
    category: 'Career',
    icon: '🛠️',
    xpSources: 'Passion projects, client work, job projects',
    sortOrder: 10,
  },
  {
    name: 'Order',
    slug: 'order',
    category: 'Domestic',
    icon: '🧹',
    xpSources: 'Cleaning, organizing: 100 XP / 30 min',
    sortOrder: 11,
  },
  {
    name: 'Finance',
    slug: 'finance',
    category: 'Domestic',
    icon: '💰',
    xpSources: 'Budget, bills, investments: 150 XP / session',
    sortOrder: 12,
  },
  {
    name: 'Cooking',
    slug: 'cook',
    category: 'Domestic',
    icon: '🍳',
    xpSources: 'Cooking real food: 100–150 XP / session',
    sortOrder: 13,
  },
  {
    name: 'Relationships',
    slug: 'relationships',
    category: 'Soul',
    icon: '🔗',
    xpSources: 'Partner, friends, family: 150 XP / session (quality multiplier)',
    sortOrder: 14,
  },
  {
    name: 'Discipline',
    slug: 'discipline',
    category: 'Soul',
    icon: '⚔️',
    xpSources: 'Cold shower, early wake, scroll-free morning: 50 XP / time',
    sortOrder: 15,
  },
];

type SeedReward = {
  skillSlug: string;
  levelReq: number;
  type: UnlockType;
  label: string;
  description: string;
  permissionKey?: string;
  wealthLevelReq?: number;
  questIds?: string;
  orderIndex: number;
  icon: string;
};

/** Finance skill stands in for “Wealth” level gates. */
const rewards: SeedReward[] = [
  // Physical — Strength
  {
    skillSlug: 'strength',
    levelReq: 5,
    type: 'GEAR',
    label: 'Veepudel',
    description: 'Luba osta vastupidav veepudel — ice-cold discipline.',
    permissionKey: 'gear:water-bottle',
    orderIndex: 0,
    icon: '🧊',
  },
  {
    skillSlug: 'strength',
    levelReq: 15,
    type: 'GEAR',
    label: 'Raskemad Hantlid',
    description: 'Luba osta raskemad hantlid.',
    permissionKey: 'gear:heavy-dumbbells',
    wealthLevelReq: 10,
    orderIndex: 0,
    icon: '🏋️',
  },
  {
    skillSlug: 'strength',
    levelReq: 30,
    type: 'GEAR',
    label: 'Quality Gear',
    description: 'Luba osta premium trenniriided.',
    permissionKey: 'gear:quality-gear',
    wealthLevelReq: 20,
    orderIndex: 0,
    icon: '👕',
  },
  {
    skillSlug: 'strength',
    levelReq: 45,
    type: 'GEAR',
    label: 'Gym Membership',
    description: 'Luba võtta korralik jõusaali liikmesus.',
    permissionKey: 'gear:gym-membership',
    wealthLevelReq: 35,
    orderIndex: 0,
    icon: '🎫',
  },
  {
    skillSlug: 'strength',
    levelReq: 60,
    type: 'FEATURE',
    label: 'Personal Trainer',
    description: 'Unlocks a PT session slot in your weekly plan.',
    permissionKey: 'feature:pt-slot',
    orderIndex: 0,
    icon: '🗣️',
  },
  // Physical — Cardio
  {
    skillSlug: 'cardio',
    levelReq: 5,
    type: 'GEAR',
    label: 'Running Shoes',
    description: 'Luba osta korralikud jooksujalatsid.',
    permissionKey: 'gear:running-shoes',
    orderIndex: 0,
    icon: '👟',
  },
  {
    skillSlug: 'cardio',
    levelReq: 20,
    type: 'FEATURE',
    label: 'Route Tracker',
    description: 'Auto-log distance for outdoor sessions.',
    permissionKey: 'feature:route-tracker',
    orderIndex: 0,
    icon: '🗺️',
  },
  {
    skillSlug: 'cardio',
    levelReq: 40,
    type: 'GEAR',
    label: 'Heart Rate Band',
    description: 'Luba osta pulsivöö — needs Finance Lv 18.',
    permissionKey: 'gear:hr-band',
    wealthLevelReq: 18,
    orderIndex: 0,
    icon: '⌚',
  },
  // Physical — Mobility
  {
    skillSlug: 'mobility',
    levelReq: 5,
    type: 'GEAR',
    label: 'Yoga Mat',
    description: 'Luba osta korralik joogamatt.',
    permissionKey: 'gear:yoga-mat',
    orderIndex: 0,
    icon: '🧘',
  },
  {
    skillSlug: 'mobility',
    levelReq: 25,
    type: 'FEATURE',
    label: 'Mobility Circuit',
    description: 'Unlock a guided mobility circuit preset.',
    permissionKey: 'feature:mobility-circuit',
    orderIndex: 0,
    icon: '🔄',
  },
  {
    skillSlug: 'mobility',
    levelReq: 45,
    type: 'GEAR',
    label: 'Foam Roller',
    description: 'Luba osta foam roller — Finance Lv 12.',
    permissionKey: 'gear:foam-roller',
    wealthLevelReq: 12,
    orderIndex: 0,
    icon: '🪵',
  },
  // Mind — Knowledge
  {
    skillSlug: 'knowledge',
    levelReq: 10,
    type: 'GEAR',
    label: 'Book Wishlist Pick',
    description: 'Luba osta üks raamat wishlistist.',
    permissionKey: 'gear:book-wishlist',
    orderIndex: 0,
    icon: '📖',
  },
  {
    skillSlug: 'knowledge',
    levelReq: 25,
    type: 'GEAR',
    label: 'Audiobook Subscription',
    description: 'Luba võtta audiobook tellimus.',
    permissionKey: 'gear:audiobook-sub',
    wealthLevelReq: 15,
    orderIndex: 0,
    icon: '🎧',
  },
  {
    skillSlug: 'knowledge',
    levelReq: 40,
    type: 'FEATURE',
    label: 'Note Synthesis',
    description: 'Auto-summary of reading logs.',
    permissionKey: 'feature:note-synthesis',
    orderIndex: 0,
    icon: '📝',
  },
  {
    skillSlug: 'knowledge',
    levelReq: 60,
    type: 'FEATURE',
    label: 'Custom Knowledge Graph',
    description: 'Visual connections between books and notes.',
    permissionKey: 'feature:knowledge-graph',
    orderIndex: 0,
    icon: '🕸️',
  },
  // Mind — Focus
  {
    skillSlug: 'focus',
    levelReq: 10,
    type: 'FEATURE',
    label: 'Focus Token',
    description: 'Unlock +1 Horologium timer preset.',
    permissionKey: 'feature:focus-token',
    orderIndex: 0,
    icon: '🪙',
  },
  {
    skillSlug: 'focus',
    levelReq: 40,
    type: 'FEATURE',
    label: 'Deep Focus Mode',
    description: 'Lock-in timer — can’t cancel mid-block.',
    permissionKey: 'feature:deep-focus',
    orderIndex: 0,
    icon: '🔒',
  },
  // Mind — Strategy
  {
    skillSlug: 'strategy',
    levelReq: 15,
    type: 'FEATURE',
    label: 'Weekly Review Ritual',
    description: 'Structured weekly review checklist.',
    permissionKey: 'feature:weekly-review',
    orderIndex: 0,
    icon: '📋',
  },
  {
    skillSlug: 'strategy',
    levelReq: 35,
    type: 'COSMETIC',
    label: 'Planner Seal',
    description: 'Gold seal cosmetic on sealed quest logs.',
    permissionKey: 'cosmetic:planner-seal',
    orderIndex: 0,
    icon: '🏅',
  },
  // Career — Dev
  {
    skillSlug: 'dev',
    levelReq: 15,
    type: 'GEAR',
    label: 'Dev Tool License',
    description: 'Luba osta vajalik arenduslitsents.',
    permissionKey: 'gear:dev-tool-license',
    wealthLevelReq: 10,
    orderIndex: 0,
    icon: '🔑',
  },
  {
    skillSlug: 'dev',
    levelReq: 30,
    type: 'GEAR',
    label: 'Mechanical Keyboard',
    description: 'Luba osta mehaaniline klaviatuur.',
    permissionKey: 'gear:mech-keyboard',
    wealthLevelReq: 25,
    orderIndex: 0,
    icon: '⌨️',
  },
  {
    skillSlug: 'dev',
    levelReq: 50,
    type: 'FEATURE',
    label: 'Deploy Automation',
    description: 'One-click deploy ritual unlocked.',
    permissionKey: 'feature:deploy-automation',
    orderIndex: 0,
    icon: '🚀',
  },
  {
    skillSlug: 'dev',
    levelReq: 70,
    type: 'FEATURE',
    label: 'Passive Income Dashboard',
    description: 'Track side-project income streams.',
    permissionKey: 'feature:passive-income',
    wealthLevelReq: 45,
    orderIndex: 0,
    icon: '📈',
  },
  // Career — Clients / Create
  {
    skillSlug: 'clients',
    levelReq: 20,
    type: 'FEATURE',
    label: 'Pipeline Board',
    description: 'Visual client pipeline in Status.',
    permissionKey: 'feature:pipeline-board',
    orderIndex: 0,
    icon: '🗂️',
  },
  {
    skillSlug: 'create',
    levelReq: 25,
    type: 'GEAR',
    label: 'Creator Kit',
    description: 'Luba osta loomistööriistad — Finance Lv 15.',
    permissionKey: 'gear:creator-kit',
    wealthLevelReq: 15,
    orderIndex: 0,
    icon: '🎨',
  },
  {
    skillSlug: 'create',
    levelReq: 55,
    type: 'FEATURE',
    label: 'Ship Log',
    description: 'Auto-archive shipped project milestones.',
    permissionKey: 'feature:ship-log',
    orderIndex: 0,
    icon: '📦',
  },
  // Domestic — Cook / Order / Finance
  {
    skillSlug: 'cook',
    levelReq: 5,
    type: 'GEAR',
    label: "Chef's Knife",
    description: 'Luba osta korralik kööginuga.',
    permissionKey: 'gear:chefs-knife',
    orderIndex: 0,
    icon: '🔪',
  },
  {
    skillSlug: 'cook',
    levelReq: 20,
    type: 'FEATURE',
    label: 'Meal Prep Slot',
    description: 'Auto-schedule weekly meals.',
    permissionKey: 'feature:meal-prep',
    orderIndex: 0,
    icon: '🥗',
  },
  {
    skillSlug: 'cook',
    levelReq: 35,
    type: 'FEATURE',
    label: 'Smart Home Trigger',
    description: 'Kitchen reminders — train Order to support the habit.',
    permissionKey: 'feature:smart-home-cook',
    orderIndex: 0,
    icon: '🏠',
  },
  {
    skillSlug: 'cook',
    levelReq: 55,
    type: 'FEATURE',
    label: 'Batch Cooking Mode',
    description: 'Cook up to 3 meals at once in the plan.',
    permissionKey: 'feature:batch-cook',
    orderIndex: 0,
    icon: '🍲',
  },
  {
    skillSlug: 'order',
    levelReq: 10,
    type: 'FEATURE',
    label: 'Tidy Sprint',
    description: '15-minute reset checklist unlock.',
    permissionKey: 'feature:tidy-sprint',
    orderIndex: 0,
    icon: '✨',
  },
  {
    skillSlug: 'order',
    levelReq: 30,
    type: 'GEAR',
    label: 'Storage Upgrade',
    description: 'Luba osta korralikud hoiusüsteemid.',
    permissionKey: 'gear:storage-upgrade',
    wealthLevelReq: 20,
    orderIndex: 0,
    icon: '📦',
  },
  {
    skillSlug: 'finance',
    levelReq: 10,
    type: 'FEATURE',
    label: 'Budget Ritual',
    description: 'Weekly budget check template.',
    permissionKey: 'feature:budget-ritual',
    orderIndex: 0,
    icon: '📒',
  },
  {
    skillSlug: 'finance',
    levelReq: 40,
    type: 'RESOURCE',
    label: 'Wealth Cache',
    description: 'Grant a planning buffer — track IRL savings wins.',
    permissionKey: 'resource:wealth-cache',
    orderIndex: 0,
    icon: '💎',
  },
  // Soul — Discipline / Relationships
  {
    skillSlug: 'discipline',
    levelReq: 10,
    type: 'FEATURE',
    label: 'Dawn Protocol',
    description: 'Morning stack checklist unlock.',
    permissionKey: 'feature:dawn-protocol',
    orderIndex: 0,
    icon: '🌅',
  },
  {
    skillSlug: 'discipline',
    levelReq: 25,
    type: 'FEATURE',
    label: 'Double XP Weekend',
    description: 'All XP 1.5× for 48h when claimed.',
    permissionKey: 'feature:double-xp-weekend',
    orderIndex: 0,
    icon: '⚡',
  },
  {
    skillSlug: 'discipline',
    levelReq: 60,
    type: 'FEATURE',
    label: 'Custom Quest Builder',
    description: 'Create your own quests.',
    permissionKey: 'feature:quest-builder',
    orderIndex: 0,
    icon: '📜',
  },
  {
    skillSlug: 'discipline',
    levelReq: 80,
    type: 'RESOURCE',
    label: 'Prestige Token',
    description: 'Reset a skill to lv 1, keep one permanent perk.',
    permissionKey: 'resource:prestige-token',
    orderIndex: 0,
    icon: '👑',
  },
  {
    skillSlug: 'relationships',
    levelReq: 15,
    type: 'FEATURE',
    label: 'Date Night Slot',
    description: 'Weekly relationship priority slot.',
    permissionKey: 'feature:date-night',
    orderIndex: 0,
    icon: '🕯️',
  },
  {
    skillSlug: 'relationships',
    levelReq: 35,
    type: 'GEAR',
    label: 'Shared Experience Fund',
    description: 'Luba planeerida ühine elamus — Finance Lv 22.',
    permissionKey: 'gear:shared-experience',
    wealthLevelReq: 22,
    orderIndex: 0,
    icon: '🎟️',
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

  const bySlug = Object.fromEntries(
    (await prisma.skill.findMany({ select: { id: true, slug: true } })).map(
      (s) => [s.slug, s.id],
    ),
  );

  let rewardCount = 0;
  for (const row of rewards) {
    const skillId = bySlug[row.skillSlug];
    if (!skillId) {
      console.warn(`Skip reward ${row.label}: missing skill ${row.skillSlug}`);
      continue;
    }
    await prisma.reward.upsert({
      where: {
        skillId_levelReq_orderIndex: {
          skillId,
          levelReq: row.levelReq,
          orderIndex: row.orderIndex,
        },
      },
      update: {
        type: row.type,
        label: row.label,
        description: row.description,
        permissionKey: row.permissionKey ?? null,
        wealthLevelReq: row.wealthLevelReq ?? null,
        questIds: row.questIds ?? null,
        icon: row.icon,
      },
      create: {
        skillId,
        levelReq: row.levelReq,
        type: row.type,
        label: row.label,
        description: row.description,
        permissionKey: row.permissionKey ?? null,
        wealthLevelReq: row.wealthLevelReq ?? null,
        questIds: row.questIds ?? null,
        orderIndex: row.orderIndex,
        icon: row.icon,
      },
    });
    rewardCount += 1;
  }

  // Quest-completion gear (no level gate — unlocked by Custodia Mentis).
  const disciplineId = bySlug['discipline'];
  if (disciplineId) {
    await prisma.reward.upsert({
      where: {
        skillId_levelReq_orderIndex: {
          skillId: disciplineId,
          levelReq: 1,
          orderIndex: 9,
        },
      },
      update: {
        type: 'GEAR',
        label: 'Focus Tool',
        description:
          'Luba osta üks keskendumist toetav vahend (Time Timer, focus app, või mürasummutavad kõrvaklapid). Unlocked by Custodia Mentis.',
        permissionKey: 'gear:focus-tool',
        icon: '⏱️',
      },
      create: {
        skillId: disciplineId,
        levelReq: 1,
        type: 'GEAR',
        label: 'Focus Tool',
        description:
          'Luba osta üks keskendumist toetav vahend (Time Timer, focus app, või mürasummutavad kõrvaklapid). Unlocked by Custodia Mentis.',
        permissionKey: 'gear:focus-tool',
        orderIndex: 9,
        icon: '⏱️',
      },
    });
    rewardCount += 1;
  }

  await prisma.character.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, title: 'Peasant' },
  });

  await prisma.featureUnlock.upsert({
    where: { key: 'feature:habitus' },
    update: {},
    create: { key: 'feature:habitus', unlocked: false },
  });

  await prisma.quest.upsert({
    where: { slug: 'custodia-mentis' },
    update: {
      name: 'Custodia Mentis',
      tier: 'NOVICE',
      summary: '7 days without short-form doomscroll. Guard the mind.',
      description:
        'Doomscrollimine on dopamiiniklotside jaoks nagu labane nälg — sa ei ole näljane, sa lihtsalt näksid. Üks short on OK (kogemata); scrollimine = FAIL. Logi iga päev Clean või Broken. Vahele jäetud päev loetakse katkiseks. 7 clean päeva järjest = complete. Streak reset ei tapa questi — alustad päevast 1 uuesti.',
      coverImage: '1st-quest.png',
      skillSlug: 'discipline',
      durationDays: 7,
      kind: 'STREAK_LOG',
      skillReqsJson: null,
      unlockReqsJson: null,
      questReqsJson: null,
      xpPlanJson: JSON.stringify({
        dayXp: [20, 30, 30, 50, 50, 80, 80],
        completionBonus: { discipline: 300, finance: 50 },
      }),
      rewardJson: JSON.stringify({
        title: 'Mens Sana',
        features: ['feature:habitus'],
        permissionKeys: ['gear:focus-tool'],
      }),
      sortOrder: 1,
    },
    create: {
      slug: 'custodia-mentis',
      name: 'Custodia Mentis',
      tier: 'NOVICE',
      summary: '7 days without short-form doomscroll. Guard the mind.',
      description:
        'Doomscrollimine on dopamiiniklotside jaoks nagu labane nälg — sa ei ole näljane, sa lihtsalt näksid. Üks short on OK (kogemata); scrollimine = FAIL. Logi iga päev Clean või Broken. Vahele jäetud päev loetakse katkiseks. 7 clean päeva järjest = complete. Streak reset ei tapa questi — alustad päevast 1 uuesti.',
      coverImage: '1st-quest.png',
      skillSlug: 'discipline',
      durationDays: 7,
      kind: 'STREAK_LOG',
      xpPlanJson: JSON.stringify({
        dayXp: [20, 30, 30, 50, 50, 80, 80],
        completionBonus: { discipline: 300, finance: 50 },
      }),
      rewardJson: JSON.stringify({
        title: 'Mens Sana',
        features: ['feature:habitus'],
        permissionKeys: ['gear:focus-tool'],
      }),
      sortOrder: 1,
      createdByUser: false,
    },
  });

  // Dev sample habits (visible when Habitus unlocked or ?dev=1).
  const gymSkill = bySlug['strength'];
  const existingHabits = await prisma.habit.count();
  if (existingHabits === 0) {
    await prisma.habit.createMany({
      data: [
        {
          name: 'Gym',
          icon: '🏋️',
          skillId: gymSkill ?? null,
          cadence: 'EVERY_N_DAYS',
          everyNDays: 2,
        },
        {
          name: 'No doomscroll log',
          icon: '🧘',
          skillId: disciplineId ?? null,
          cadence: 'DAILY',
          everyNDays: 1,
        },
        {
          name: 'Read 20 pages',
          icon: '📚',
          skillId: bySlug['knowledge'] ?? null,
          cadence: 'DAILY',
          everyNDays: 1,
        },
      ],
    });
  }

  const defaultTemplates: Array<{
    name: string;
    icon: string;
    skillSlug: string;
    fixedXp: number;
    sortOrder: number;
  }> = [
    { name: 'Showering', icon: '🚿', skillSlug: 'hygiene', fixedXp: 50, sortOrder: 1 },
    { name: 'Shaving Beard', icon: '🪒', skillSlug: 'hygiene', fixedXp: 50, sortOrder: 2 },
    { name: 'Shaving Body', icon: '🛁', skillSlug: 'hygiene', fixedXp: 150, sortOrder: 3 },
    {
      name: 'Deodorant + Perfume',
      icon: '🧴',
      skillSlug: 'hygiene',
      fixedXp: 25,
      sortOrder: 4,
    },
    { name: 'Dog Walking', icon: '🐕', skillSlug: 'cardio', fixedXp: 50, sortOrder: 5 },
    {
      name: 'Full-Body Stretching',
      icon: '🤸',
      skillSlug: 'mobility',
      fixedXp: 100,
      sortOrder: 6,
    },
    { name: 'Home Cooking', icon: '🍳', skillSlug: 'cook', fixedXp: 150, sortOrder: 7 },
    {
      name: 'Room/Apartment Cleaning',
      icon: '🧹',
      skillSlug: 'order',
      fixedXp: 200,
      sortOrder: 8,
    },
  ];

  for (const t of defaultTemplates) {
    const skillId = bySlug[t.skillSlug];
    if (!skillId) {
      continue;
    }
    const existing = await prisma.dailyTaskTemplate.findFirst({
      where: { name: t.name, createdByUser: false },
    });
    if (existing) {
      await prisma.dailyTaskTemplate.update({
        where: { id: existing.id },
        data: {
          icon: t.icon,
          skillId,
          fixedXp: t.fixedXp,
          sortOrder: t.sortOrder,
          active: true,
        },
      });
    } else {
      await prisma.dailyTaskTemplate.create({
        data: {
          name: t.name,
          icon: t.icon,
          skillId,
          fixedXp: t.fixedXp,
          sortOrder: t.sortOrder,
          createdByUser: false,
        },
      });
    }
  }

  console.log(
    `Seeded ${skills.length} skills, ${rewardCount} rewards, Custodia Mentis, Character, default tasks`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
