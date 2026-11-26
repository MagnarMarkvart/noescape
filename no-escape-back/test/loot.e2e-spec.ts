import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { LootService } from '../src/loot/loot.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Isolated far-past day; only rows this test creates are removed. */
const DAY = '2001-04-02';
const SLUGS = ['e2e-loot-a', 'e2e-loot-b'];

describe('Loot: one roll per XP drop (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let loot: LootService;
  let skillIds: number[] = [];
  const createdDropIds: number[] = [];
  let rolls = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    loot = moduleFixture.get(LootService);
    await app.init();
    skillIds = [];
    for (const slug of SLUGS) {
      const s = await prisma.skill.upsert({
        where: { slug },
        update: {},
        create: { name: slug, slug, category: 'test', xpSources: '[]' },
      });
      skillIds.push(s.id);
    }
  });

  const cleanup = async () => {
    await prisma.dailyLog.deleteMany({ where: { date: DAY } });
    await prisma.dailyTask.deleteMany({ where: { date: DAY } });
  };
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    if (createdDropIds.length) {
      await prisma.collectibleDrop.deleteMany({ where: { id: { in: createdDropIds } } });
    }
    await app.close();
  });

  it('a two-skill task is one drop: one roll, score = roll + summed XP', async () => {
    const before = await prisma.collectibleDrop.findMany({ select: { id: true } });
    const seen = new Set(before.map((d) => d.id));
    rolls = 0;
    // Low roll + XP must land in the find band only via the summed XP.
    loot.rng = () => {
      rolls++;
      return 979_990;
    };

    const res = await request(app.getHttpServer())
      .put('/dailies/slots')
      .send({
        date: DAY,
        importance: 'MOST_IMPORTANT',
        slotIndex: 0,
        title: '[TEST] loot multi',
        skillWeights: [
          { slug: SLUGS[0], weight: 5 },
          { slug: SLUGS[1], weight: 5 },
        ],
        effortLevel: 2,
        durationMinutes: 30,
      })
      .expect(200);
    const id =
      Number(res.body.id ?? res.body.slot?.id) ||
      (await prisma.dailyTask.findFirstOrThrow({ where: { date: DAY, importance: 'MOST_IMPORTANT', slotIndex: 0 } })).id;

    await request(app.getHttpServer()).post(`/dailies/${id}/complete`).send({}).expect(201);

    const activities = await prisma.activity.findMany({
      where: { skillId: { in: skillIds } },
      orderBy: { id: 'desc' },
      take: 2,
    });
    const summed = activities.reduce((n, a) => n + a.xpGained, 0);
    expect(activities.length).toBe(2);
    expect(summed).toBeGreaterThan(10);

    expect(rolls).toBe(1);
    const after = await prisma.collectibleDrop.findMany({ orderBy: { id: 'asc' } });
    const fresh = after.filter((d) => !seen.has(d.id));
    createdDropIds.push(...fresh.map((d) => d.id));
    expect(fresh).toHaveLength(1);
    expect(fresh[0].roll).toBe(979_990);
    expect(fresh[0].score).toBe(979_990 + Math.min(10_000, summed));
    expect(fresh[0].xpGained).toBe(summed);
    expect(fresh[0].tier).toBe('common');
  });

  it('a plain roll finds nothing and stores nothing', async () => {
    const count = await prisma.collectibleDrop.count();
    loot.rng = () => 506_789;
    await loot.flush({ xp: 1000, skillId: null }).then((d) => expect(d).toBeNull());
    expect(await prisma.collectibleDrop.count()).toBe(count);
  });

  it('GET /loot exposes no odds, ranges or rolls', async () => {
    const res = await request(app.getHttpServer()).get('/loot').expect(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/"odds"|"from"|"to"|"roll"|"rollMax"|"score"/);
    expect(res.body.items.length).toBeGreaterThan(20);
  });
});
