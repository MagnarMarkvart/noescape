import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Isolated, far-past day so the test never collides with real boards. */
const DAY = '2001-02-05'; // a Monday (weekday goals)

describe('Dailies actual time after seal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let skillId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
    const skill = await prisma.skill.upsert({
      where: { slug: 'e2e-actual-time' },
      update: {},
      create: {
        name: 'E2E Actual Time',
        slug: 'e2e-actual-time',
        category: 'test',
        xpSources: '[]',
      },
    });
    skillId = skill.id;
  });

  const DAYS = [DAY, '2001-03-05', '2001-03-06'];
  const cleanup = async () => {
    await prisma.dailyLog.deleteMany({ where: { date: { in: DAYS } } });
    await prisma.dailyTask.deleteMany({ where: { date: { in: DAYS } } });
  };

  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function slot(
    importance: 'MOST_IMPORTANT' | 'IMPORTANT' | 'REGULAR',
    slotIndex: number,
    title: string,
    durationMinutes: number,
    date = DAY,
  ): Promise<number> {
    const res = await request(app.getHttpServer())
      .put('/dailies/slots')
      .send({
        date,
        importance,
        slotIndex,
        title,
        skillId,
        effortLevel: 2,
        durationMinutes,
      })
      .expect(200);
    const id = Number(res.body.id ?? res.body.slot?.id);
    if (id) {
      return id;
    }
    const row = await prisma.dailyTask.findFirstOrThrow({
      where: { date, importance, slotIndex },
    });
    return row.id;
  }

  it('counts recorded time, else planned time, and survives the seal', async () => {
    const recorded = await slot('MOST_IMPORTANT', 0, 'Recorded', 90);
    const assumed = await slot('IMPORTANT', 0, 'Assumed', 60);
    await slot('REGULAR', 0, 'Missed', 45);

    await request(app.getHttpServer())
      .post(`/dailies/${recorded}/complete`)
      .send({ elapsedMs: 120 * 60_000 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/dailies/${assumed}/complete`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/dailies/seal')
      .send({ date: DAY })
      .expect(201);

    const expected = {
      plannedMinutes: 195,
      actualMinutes: 180,
      goalMinutes: 360,
      deltaGoalMinutes: -180,
      deltaPlannedMinutes: -15,
      recordedCount: 1,
      assumedCount: 1,
    };

    const board = await request(app.getHttpServer())
      .get('/dailies')
      .query({ date: DAY })
      .expect(200);
    expect(board.body.isSealed).toBe(true);
    expect(board.body.actualTime).toEqual(expected);

    const log = await request(app.getHttpServer())
      .get(`/dailies/logs/${DAY}`)
      .expect(200);
    expect(log.body.actualTime).toEqual(expected);

    const logs = await request(app.getHttpServer())
      .get('/dailies/logs')
      .expect(200);
    const row = (
      logs.body as Array<{ date: string; actualTime: unknown }>
    ).find((entry) => entry.date === DAY);
    expect(row?.actualTime).toEqual(expected);
  });

  it('offers carry-over only once per day, even after deleting the copy', async () => {
    const src = '2001-03-05';
    const target = '2001-03-06';
    await slot('IMPORTANT', 0, 'Left undone', 30, src);
    await request(app.getHttpServer())
      .post('/dailies/seal')
      .send({ date: src })
      .expect(201);

    const before = await request(app.getHttpServer())
      .get('/dailies')
      .query({ date: target })
      .expect(200);
    expect(before.body.canCopyIncomplete).toBe(true);

    await request(app.getHttpServer())
      .post('/dailies/copy-incomplete')
      .send({ date: target, sourceDate: src })
      .expect(201);
    const copied = await prisma.dailyTask.findFirstOrThrow({
      where: { date: target },
    });
    await request(app.getHttpServer())
      .delete(`/dailies/${copied.id}`)
      .expect(200);

    const after = await request(app.getHttpServer())
      .get('/dailies')
      .query({ date: target })
      .expect(200);
    expect(after.body.canCopyIncomplete).toBe(false);
  });
});
