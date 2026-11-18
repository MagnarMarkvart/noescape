/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ListsController (e2e)', () => {
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

  describe('/lists (POST)', () => {
    it('should create a new list', async () => {
      const response = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping List', icon: '🛒' })
        .expect(201);

      expect(response.body).toMatchObject({
        name: 'Shopping List',
        icon: '🛒',
        isMain: false,
        suggestionsEnabled: true,
        activeCount: 0,
        doneCount: 0,
      });
      expect(response.body.id).toBeDefined();
    });

    it('should reject empty name', async () => {
      await request(app.getHttpServer())
        .post('/lists')
        .send({ name: '' })
        .expect(400);
    });

    it('should create a main list and clear previous main', async () => {
      const first = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'First', isMain: true })
        .expect(201);

      expect(first.body.isMain).toBe(true);

      const second = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Second', isMain: true })
        .expect(201);

      expect(second.body.isMain).toBe(true);

      const lists = await request(app.getHttpServer())
        .get('/lists')
        .expect(200);

      const mainLists = lists.body.filter((l: any) => l.isMain);
      expect(mainLists).toHaveLength(1);
      expect(mainLists[0].name).toBe('Second');
    });
  });

  describe('/lists (GET)', () => {
    it('should return all lists', async () => {
      await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'List 1', icon: '📝' });

      await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'List 2', icon: '✅' });

      const response = await request(app.getHttpServer())
        .get('/lists')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('List 1');
      expect(response.body[1].name).toBe('List 2');
    });
  });

  describe('/lists/:id (GET)', () => {
    it('should return list with items and memory', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      const response = await request(app.getHttpServer())
        .get(`/lists/${listId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Shopping',
        items: [],
        memory: [],
      });
    });

    it('should return 404 for non-existent list', async () => {
      await request(app.getHttpServer()).get('/lists/999').expect(404);
    });
  });

  describe('/lists/:id (PATCH)', () => {
    it('should update list name', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Old Name' });

      const listId = createRes.body.id;

      const response = await request(app.getHttpServer())
        .patch(`/lists/${listId}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.name).toBe('New Name');
    });

    it('should toggle suggestions', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'List' });

      const listId = createRes.body.id;

      const response = await request(app.getHttpServer())
        .patch(`/lists/${listId}`)
        .send({ suggestionsEnabled: false })
        .expect(200);

      expect(response.body.suggestionsEnabled).toBe(false);
    });
  });

  describe('/lists/:id (DELETE)', () => {
    it('should delete list', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'To Delete' });

      const listId = createRes.body.id;

      await request(app.getHttpServer()).delete(`/lists/${listId}`).expect(200);

      await request(app.getHttpServer()).get(`/lists/${listId}`).expect(404);
    });
  });

  describe('Items workflow', () => {
    it('should add, update, and delete items', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      const addRes1 = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' })
        .expect(201);

      expect(addRes1.body.items).toHaveLength(1);
      expect(addRes1.body.items[0].title).toBe('Milk');

      const itemId = addRes1.body.items[0].id;

      await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Bread' })
        .expect(201);

      const updateRes = await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId}`)
        .send({ title: 'Whole Milk' })
        .expect(200);

      expect(updateRes.body.items[0].title).toBe('Whole Milk');

      const deleteRes = await request(app.getHttpServer())
        .delete(`/lists/${listId}/items/${itemId}`)
        .expect(200);

      expect(deleteRes.body.items).toHaveLength(1);
      expect(deleteRes.body.items[0].title).toBe('Bread');
    });

    it('should mark item done and add to memory', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping', suggestionsEnabled: true });

      const listId = createRes.body.id;

      const addRes = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' });

      const itemId = addRes.body.items[0].id;

      const doneRes = await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId}`)
        .send({ done: true })
        .expect(200);

      expect(doneRes.body.items[0].done).toBe(true);
      expect(doneRes.body.memory).toHaveLength(1);
      expect(doneRes.body.memory[0].title).toBe('Milk');
      expect(doneRes.body.memory[0].useCount).toBe(1);
    });

    it('should not add to memory when suggestions disabled', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping', suggestionsEnabled: false });

      const listId = createRes.body.id;

      const addRes = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' });

      const itemId = addRes.body.items[0].id;

      const doneRes = await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId}`)
        .send({ done: true })
        .expect(200);

      expect(doneRes.body.items[0].done).toBe(true);
      expect(doneRes.body.memory).toHaveLength(0);
    });

    it('should increment memory useCount on multiple completions', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      const addRes1 = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' });

      const itemId1 = addRes1.body.items[0].id;

      await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId1}`)
        .send({ done: true });

      const addRes2 = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' });

      const itemId2 = addRes2.body.items[0].id;

      const doneRes2 = await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId2}`)
        .send({ done: true });

      expect(doneRes2.body.memory).toHaveLength(1);
      expect(doneRes2.body.memory[0].useCount).toBe(2);
    });

    it('should reorder items', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'A' });

      await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'B' });

      const addRes3 = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'C' });

      const items = addRes3.body.items;
      const ids = [items[2].id, items[0].id, items[1].id];

      const reorderRes = await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/order`)
        .send({ ids })
        .expect(200);

      expect(reorderRes.body.items[0].title).toBe('C');
      expect(reorderRes.body.items[1].title).toBe('A');
      expect(reorderRes.body.items[2].title).toBe('B');
    });
  });

  describe('Memory operations', () => {
    it('should get memory suggestions', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      const addRes = await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' });

      const itemId = addRes.body.items[0].id;

      await request(app.getHttpServer())
        .patch(`/lists/${listId}/items/${itemId}`)
        .send({ done: true });

      const memoryRes = await request(app.getHttpServer())
        .get(`/lists/${listId}/memory`)
        .expect(200);

      expect(memoryRes.body).toHaveLength(1);
      expect(memoryRes.body[0].title).toBe('Milk');
      expect(memoryRes.body[0].score).toBeGreaterThan(0);
    });

    it('should filter memory by query', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      await prisma.listItemMemory.createMany({
        data: [
          { listId, title: 'Milk', useCount: 1, lastUsedAt: new Date() },
          { listId, title: 'Bread', useCount: 1, lastUsedAt: new Date() },
          { listId, title: 'Eggs', useCount: 1, lastUsedAt: new Date() },
        ],
      });

      const memoryRes = await request(app.getHttpServer())
        .get(`/lists/${listId}/memory?query=mil`)
        .expect(200);

      expect(memoryRes.body).toHaveLength(1);
      expect(memoryRes.body[0].title).toBe('Milk');
    });

    it('should delete memory entry', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      const memEntry = await prisma.listItemMemory.create({
        data: { listId, title: 'Milk', useCount: 1, lastUsedAt: new Date() },
      });

      await request(app.getHttpServer())
        .delete(`/lists/${listId}/memory/${memEntry.id}`)
        .expect(200);

      const memoryRes = await request(app.getHttpServer())
        .get(`/lists/${listId}/memory`)
        .expect(200);

      expect(memoryRes.body).toHaveLength(0);
    });

    it('should restore memory to active list', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      const memEntry = await prisma.listItemMemory.create({
        data: { listId, title: 'Milk', useCount: 2, lastUsedAt: new Date() },
      });

      const restoreRes = await request(app.getHttpServer())
        .post(`/lists/${listId}/memory/${memEntry.id}/restore`)
        .expect(201);

      expect(restoreRes.body.items).toHaveLength(1);
      expect(restoreRes.body.items[0].title).toBe('Milk');
      expect(restoreRes.body.items[0].done).toBe(false);
    });
  });

  describe('Cascade deletions', () => {
    it('should cascade delete items and memory when list is deleted', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/lists')
        .send({ name: 'Shopping' });

      const listId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/lists/${listId}/items`)
        .send({ title: 'Milk' });

      await prisma.listItemMemory.create({
        data: { listId, title: 'Bread', useCount: 1, lastUsedAt: new Date() },
      });

      await request(app.getHttpServer()).delete(`/lists/${listId}`).expect(200);

      const items = await prisma.listItem.findMany({ where: { listId } });
      const memory = await prisma.listItemMemory.findMany({
        where: { listId },
      });

      expect(items).toHaveLength(0);
      expect(memory).toHaveLength(0);
    });
  });
});
