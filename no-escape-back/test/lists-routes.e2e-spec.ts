import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ListsController Routes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.listItem.deleteMany({});
    await prisma.listItemMemory.deleteMany({});
    await prisma.list.deleteMany({});
  });

  describe('POST /lists - create list', () => {
    it('should create a new list', async () => {
      const res = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping List' })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Shopping List',
        isMain: false,
        suggestionsEnabled: true,
      });
      expect(res.body.id).toBeDefined();
    });

    it('should reject empty name', async () => {
      await request(app.getHttpServer())
        .post('/lists')
        .send({ name: '  ' })
        .expect(400);
    });
  });

  describe('POST /lists/:id/items - add item', () => {
    it('should reject duplicate active items (case-insensitive)', async () => {
      const listRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Test List' });
      const listId = listRes.body.id;

      await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'milk' })
        .expect(400);

      expect(res.body.message).toContain('already exists');
    });

    it('should allow duplicate if original is done', async () => {
      const listRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Test List' });
      const listId = listRes.body.id;

      const addRes = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' })
        .expect(201);

      const itemId = addRes.body.items.find((i: any) => i.title === 'Milk')?.id;

      await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId}`)
        .send({ done: true })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'milk' })
        .expect(201);
    });
  });

  describe('GET /lists/:id - with suggestions disabled', () => {
    it('should return empty memory array when suggestions disabled', async () => {
      const listRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Test List', suggestionsEnabled: false });
      const listId = listRes.body.id;

      await prisma.listItemMemory.create({
        data: {
          listId,
          title: 'Should Not Appear',
          titleNormalized: 'should not appear',
        },
      });

      const getRes = await request(app.getHttpServer())
        .get(`/lists/${listId}`)
        .expect(200);

      expect(getRes.body.memory).toEqual([]);
    });

    it('should return memory when suggestions enabled', async () => {
      const listRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Test List', suggestionsEnabled: true });
      const listId = listRes.body.id;

      await prisma.listItemMemory.create({
        data: {
          listId,
          title: 'Test Memory',
          titleNormalized: 'test memory',
        },
      });

      const getRes = await request(app.getHttpServer())
        .get(`/lists/${listId}`)
        .expect(200);

      expect(getRes.body.memory.length).toBe(1);
      expect(getRes.body.memory[0].title).toBe('Test Memory');
    });
  });

  describe('unified history deletion', () => {
    async function setup() {
      const list = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'History' })
        .expect(201);
      const id = list.body.id as number;
      const add = await request(app.getHttpServer())
        .post(`/lists/${id}/items`)
        .send({ title: 'Milk' })
        .expect(201);
      const itemId = add.body.items[0].id as number;
      await request(app.getHttpServer())
        .patch(`/lists/${id}/items/${itemId}`)
        .send({ done: true })
        .expect(200);
      return { id, itemId };
    }

    it('deleting a done item also deletes its memory entry', async () => {
      const { id, itemId } = await setup();
      const res = await request(app.getHttpServer())
        .delete(`/lists/${id}/items/${itemId}`)
        .expect(200);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.memory).toHaveLength(0);
      expect(await prisma.listItemMemory.count({ where: { listId: id } })).toBe(
        0,
      );
    });

    it('deleting a memory entry also removes done items with that title', async () => {
      const { id } = await setup();
      await request(app.getHttpServer())
        .post(`/lists/${id}/items`)
        .send({ title: 'Bread' })
        .expect(201);
      const detail = await request(app.getHttpServer()).get(`/lists/${id}`);
      const milkMemory = detail.body.memory.find(
        (m: { title: string }) => m.title === 'Milk',
      );
      const res = await request(app.getHttpServer())
        .delete(`/lists/${id}/memory/${milkMemory.id}`)
        .expect(200);
      expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
        'Bread',
      ]);
      expect(res.body.memory.map((m: { title: string }) => m.title)).toEqual([
        'Bread',
      ]);
    });

    it('deleting memory keeps an active item with the same title', async () => {
      const { id } = await setup();
      await request(app.getHttpServer())
        .post(`/lists/${id}/items`)
        .send({ title: 'milk' })
        .expect(201);
      const detail = await request(app.getHttpServer()).get(`/lists/${id}`);
      const res = await request(app.getHttpServer())
        .delete(`/lists/${id}/memory/${detail.body.memory[0].id}`)
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ title: 'milk', done: false });
      expect(res.body.memory).toHaveLength(0);
    });
  });
});
