/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ListsService } from './lists.service';

describe('ListsService', () => {
  let service: ListsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListsService,
        {
          provide: PrismaService,
          useValue: {
            list: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
            },
            listItem: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            listItemMemory: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn((fn) => Promise.resolve(fn)),
          },
        },
      ],
    }).compile();

    service = module.get<ListsService>(ListsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('should return all lists with counts', async () => {
      const mockLists = [
        {
          id: 1,
          name: 'Shopping',
          icon: '🛒',
          isMain: true,
          suggestionsEnabled: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [{ done: false }, { done: false }, { done: true }],
        },
        {
          id: 2,
          name: 'Tasks',
          icon: '✅',
          isMain: false,
          suggestionsEnabled: true,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          items: [{ done: true }],
        },
      ];

      jest.spyOn(prisma.list, 'findMany').mockResolvedValue(mockLists);

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(result[0].activeCount).toBe(2);
      expect(result[0].doneCount).toBe(1);
      expect(result[1].activeCount).toBe(0);
      expect(result[1].doneCount).toBe(1);
    });
  });

  describe('create', () => {
    it('should create a list with valid name', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: '🛒',
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      };

      jest.spyOn(prisma.list, 'create').mockResolvedValue(mockList);

      const result = await service.create({ name: 'Shopping', icon: '🛒' });

      expect(result.name).toBe('Shopping');
      expect(result.icon).toBe('🛒');
      expect(prisma.list.create).toHaveBeenCalledWith({
        data: {
          name: 'Shopping',
          icon: '🛒',
          isMain: false,
          suggestionsEnabled: true,
          sortOrder: 0,
        },
        include: {
          items: { select: { done: true } },
        },
      });
    });

    it('should throw error for empty name', async () => {
      await expect(service.create({ name: '' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create({ name: '  ' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create({})).rejects.toThrow(BadRequestException);
    });

    it('should clear other main lists when creating a new main list', async () => {
      const mockList = {
        id: 2,
        name: 'New Main',
        icon: null,
        isMain: true,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      };

      jest.spyOn(prisma.list, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(prisma.list, 'create').mockResolvedValue(mockList);

      await service.create({ name: 'New Main', isMain: true });

      expect(prisma.list.updateMany).toHaveBeenCalledWith({
        where: { isMain: true },
        data: { isMain: false },
      });
    });
  });

  describe('update', () => {
    it('should update list properties', async () => {
      const existingList = {
        id: 1,
        name: 'Shopping',
        icon: '🛒',
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        itemMemory: [],
      };

      const updatedList = {
        ...existingList,
        name: 'Groceries',
        icon: '🥕',
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(existingList);
      jest.spyOn(prisma.list, 'update').mockResolvedValue(updatedList);

      const result = await service.update(1, { name: 'Groceries', icon: '🥕' });

      expect(result.name).toBe('Groceries');
      expect(result.icon).toBe('🥕');
    });

    it('should clear other main lists when setting isMain', async () => {
      const existingList = {
        id: 2,
        name: 'Tasks',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        itemMemory: [],
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(existingList);
      jest.spyOn(prisma.list, 'updateMany').mockResolvedValue({ count: 1 });
      jest
        .spyOn(prisma.list, 'update')
        .mockResolvedValue({ ...existingList, isMain: true, items: [] } as any);

      await service.update(2, { isMain: true });

      expect(prisma.list.updateMany).toHaveBeenCalledWith({
        where: { isMain: true },
        data: { isMain: false },
      });
    });
  });

  describe('addItem and updateItem', () => {
    it('should add item to list', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1,
            title: 'Milk',
            done: false,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest.spyOn(prisma.listItem, 'create').mockResolvedValue({
        id: 2,
        listId: 1,
        title: 'Bread',
        done: false,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.addItem(1, 'Bread');

      expect(prisma.listItem.create).toHaveBeenCalledWith({
        data: { listId: 1, title: 'Bread', sortOrder: 1 },
      });
    });

    it('should throw error for empty item title', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        itemMemory: [],
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);

      await expect(service.addItem(1, '')).rejects.toThrow(BadRequestException);
    });

    it('should update item and add to memory when marked done', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1,
            title: 'Milk',
            done: false,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      const mockItem = {
        id: 1,
        listId: 1,
        title: 'Milk',
        done: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest.spyOn(prisma.listItem, 'findFirst').mockResolvedValue(mockItem);
      jest
        .spyOn(prisma.listItem, 'update')
        .mockResolvedValue({ ...mockItem, done: true });
      jest.spyOn(prisma.listItemMemory, 'findUnique').mockResolvedValue({
        id: 1,
        listId: 1,
        title: 'Milk',
        titleNormalized: 'milk',
        lastUsedAt: new Date('2024-01-01'),
        useCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(prisma.listItemMemory, 'update').mockResolvedValue({} as any);

      await service.updateItem(1, 1, { done: true });

      expect(prisma.listItemMemory.update).toHaveBeenCalled();
    });

    it('should bump useCount on add when memory exists', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 2,
            title: 'Milk',
            done: true,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      const mockItem = {
        id: 2,
        listId: 1,
        title: 'Milk',
        done: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMemory = {
        id: 1,
        listId: 1,
        title: 'Milk',
        titleNormalized: 'milk',
        lastUsedAt: new Date('2024-01-01'),
        useCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest.spyOn(prisma.listItem, 'create').mockResolvedValue(mockItem);
      jest
        .spyOn(prisma.listItemMemory, 'findUnique')
        .mockResolvedValue(mockMemory);
      jest.spyOn(prisma.listItemMemory, 'update').mockResolvedValue({} as any);

      await service.addItem(1, 'Milk');

      expect(prisma.listItemMemory.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          useCount: 3,
          lastUsedAt: expect.any(Date),
        },
      });
    });

    it('should not add to memory when suggestions disabled', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1,
            title: 'Milk',
            done: false,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      const mockItem = {
        id: 1,
        listId: 1,
        title: 'Milk',
        done: false,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest.spyOn(prisma.listItem, 'findFirst').mockResolvedValue(mockItem);
      jest
        .spyOn(prisma.listItem, 'update')
        .mockResolvedValue({ ...mockItem, done: true });
      jest.spyOn(prisma.listItemMemory, 'create').mockResolvedValue({} as any);

      await service.updateItem(1, 1, { done: true });

      expect(prisma.listItemMemory.create).not.toHaveBeenCalled();
    });
  });

  describe('reorderItems', () => {
    it('should reorder items', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1,
            title: 'A',
            done: false,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 2,
            title: 'B',
            done: false,
            sortOrder: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 3,
            title: 'C',
            done: false,
            sortOrder: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest.spyOn(prisma, '$transaction').mockResolvedValue([]);

      await service.reorderItems(1, [3, 1, 2]);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw error for invalid reorder ids', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1,
            title: 'A',
            done: false,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 2,
            title: 'B',
            done: false,
            sortOrder: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);

      await expect(service.reorderItems(1, [1])).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reorderItems(1, [1, 2, 3])).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reorderItems(1, [1, 1])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getMemory', () => {
    it('should return ranked memory suggestions', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86_400_000);
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        itemMemory: [],
      };

      const mockMemories = [
        {
          id: 1,
          listId: 1,
          title: 'Milk',
          lastUsedAt: yesterday,
          useCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          listId: 1,
          title: 'Bread',
          lastUsedAt: weekAgo,
          useCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          listId: 1,
          title: 'Eggs',
          lastUsedAt: now,
          useCount: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest
        .spyOn(prisma.listItemMemory, 'findMany')
        .mockResolvedValue(mockMemories);

      const result = await service.getMemory(1);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Milk');
      expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it('should filter memory by query', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        itemMemory: [],
      };

      const mockMemories = [
        {
          id: 1,
          listId: 1,
          title: 'Milk',
          lastUsedAt: new Date(),
          useCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          listId: 1,
          title: 'Bread',
          lastUsedAt: new Date(),
          useCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest
        .spyOn(prisma.listItemMemory, 'findMany')
        .mockResolvedValue(mockMemories);

      const result = await service.getMemory(1, 'mil');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Milk');
    });
  });

  describe('restoreMemory', () => {
    it('should restore memory item to active list', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 1,
            title: 'Milk',
            done: false,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        itemMemory: [],
      };

      const mockMemory = {
        id: 1,
        listId: 1,
        title: 'Bread',
        lastUsedAt: new Date(),
        useCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest
        .spyOn(prisma.listItemMemory, 'findFirst')
        .mockResolvedValue(mockMemory);
      jest.spyOn(prisma.listItem, 'create').mockResolvedValue({} as any);

      await service.restoreMemory(1, 1);

      expect(prisma.listItem.create).toHaveBeenCalledWith({
        data: { listId: 1, title: 'Bread', sortOrder: 1 },
      });
    });
  });

  describe('remove', () => {
    it('should delete list', async () => {
      const mockList = {
        id: 1,
        name: 'Shopping',
        icon: null,
        isMain: false,
        suggestionsEnabled: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        itemMemory: [],
      };

      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(mockList);
      jest.spyOn(prisma.list, 'delete').mockResolvedValue(mockList);

      const result = await service.remove(1);

      expect(result.deleted).toBe(true);
      expect(result.id).toBe(1);
    });

    it('should throw error for non-existent list', async () => {
      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('unified history deletion', () => {
    const baseList = (
      items: Array<{ id: number; title: string; done: boolean }>,
    ) => ({
      id: 1,
      name: 'Shopping',
      icon: null,
      isMain: false,
      suggestionsEnabled: true,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: items.map((item, i) => ({
        ...item,
        sortOrder: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      itemMemory: [],
    });

    it('removeItem also deletes the memory entry and done duplicates', async () => {
      const list = baseList([
        { id: 10, title: 'Milk', done: true },
        { id: 11, title: ' milk', done: true },
        { id: 12, title: 'MILK', done: false },
        { id: 13, title: 'Bread', done: true },
      ]);
      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(list as any);
      jest
        .spyOn(prisma.listItem, 'findFirst')
        .mockResolvedValue({
          id: 10,
          listId: 1,
          title: 'Milk',
          done: true,
        } as any);

      await service.removeItem(1, 10);

      expect(prisma.listItem.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({
        where: { listId: 1, id: { in: [11] } },
      });
      expect(prisma.listItemMemory.deleteMany).toHaveBeenCalledWith({
        where: { listId: 1, titleNormalized: 'milk' },
      });
    });

    it('removeItem without done duplicates only deletes the item and memory', async () => {
      const list = baseList([{ id: 10, title: 'Eggs', done: false }]);
      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(list as any);
      jest
        .spyOn(prisma.listItem, 'findFirst')
        .mockResolvedValue({
          id: 10,
          listId: 1,
          title: 'Eggs',
          done: false,
        } as any);

      await service.removeItem(1, 10);

      expect(prisma.listItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.listItemMemory.deleteMany).toHaveBeenCalledWith({
        where: { listId: 1, titleNormalized: 'eggs' },
      });
    });

    it('removeMemory also deletes done items with that title but keeps active ones', async () => {
      const list = baseList([
        { id: 10, title: 'Milk', done: true },
        { id: 11, title: 'milk ', done: true },
        { id: 12, title: 'Milk', done: false },
        { id: 13, title: 'Bread', done: true },
      ]);
      jest.spyOn(prisma.list, 'findUnique').mockResolvedValue(list as any);
      jest.spyOn(prisma.listItemMemory, 'findFirst').mockResolvedValue({
        id: 5,
        listId: 1,
        title: 'Milk',
        titleNormalized: 'milk',
      } as any);

      await service.removeMemory(1, 5);

      expect(prisma.listItemMemory.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
      expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({
        where: { listId: 1, id: { in: [10, 11] } },
      });
    });

    it('removeMemory throws NotFound for an unknown entry', async () => {
      jest
        .spyOn(prisma.list, 'findUnique')
        .mockResolvedValue(baseList([]) as any);
      jest.spyOn(prisma.listItemMemory, 'findFirst').mockResolvedValue(null);
      await expect(service.removeMemory(1, 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
