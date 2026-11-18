import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ListRow = {
  id: number;
  name: string;
  icon: string | null;
  isMain: boolean;
  suggestionsEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: number;
    title: string;
    done: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  itemMemory: Array<{
    id: number;
    title: string;
    lastUsedAt: Date;
    useCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export type ListItemView = {
  id: number;
  title: string;
  done: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ListItemMemoryView = {
  id: number;
  title: string;
  lastUsedAt: string;
  useCount: number;
  score: number;
};

export type ListView = {
  id: number;
  name: string;
  icon: string | null;
  isMain: boolean;
  suggestionsEnabled: boolean;
  sortOrder: number;
  activeCount: number;
  doneCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ListDetailView = ListView & {
  items: ListItemView[];
  memory: ListItemMemoryView[];
};

export type ListUpsertInput = {
  name?: string;
  icon?: string | null;
  isMain?: boolean;
  suggestionsEnabled?: boolean;
  sortOrder?: number;
};

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ListView[]> {
    const rows = await this.prisma.list.findMany({
      include: {
        items: { select: { done: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    return rows.map((row) => this.toListView(row));
  }

  async getOne(id: number): Promise<ListDetailView> {
    const row = await this.load(id);
    return this.toDetailView(row);
  }

  async create(input: ListUpsertInput): Promise<ListView> {
    const name = input.name?.trim() ?? '';
    if (!name) {
      throw new BadRequestException('Name is required');
    }

    if (input.isMain === true) {
      await this.clearMainStatus();
    }

    const row = await this.prisma.list.create({
      data: {
        name: name.slice(0, 120),
        icon: this.parseIcon(input.icon),
        isMain: input.isMain ?? false,
        suggestionsEnabled: input.suggestionsEnabled ?? true,
        sortOrder: Math.max(0, Math.round(Number(input.sortOrder) || 0)),
      },
      include: {
        items: { select: { done: true } },
      },
    });
    return this.toListView(row);
  }

  async update(id: number, input: ListUpsertInput): Promise<ListView> {
    await this.load(id);

    const data: Record<string, unknown> = {};

    if (typeof input.name === 'string') {
      const name = input.name.trim();
      if (!name) {
        throw new BadRequestException('Name is required');
      }
      data.name = name.slice(0, 120);
    }

    if (input.icon !== undefined) {
      data.icon = this.parseIcon(input.icon);
    }

    if (input.isMain === true) {
      await this.clearMainStatus();
      data.isMain = true;
    } else if (input.isMain === false) {
      data.isMain = false;
    }

    if (typeof input.suggestionsEnabled === 'boolean') {
      data.suggestionsEnabled = input.suggestionsEnabled;
    }

    if (input.sortOrder !== undefined) {
      data.sortOrder = Math.max(0, Math.round(Number(input.sortOrder) || 0));
    }

    const row = await this.prisma.list.update({
      where: { id },
      data,
      include: {
        items: { select: { done: true } },
      },
    });
    return this.toListView(row);
  }

  async remove(id: number): Promise<{ deleted: boolean; id: number }> {
    await this.load(id);
    await this.prisma.list.delete({ where: { id } });
    return { deleted: true, id };
  }

  async addItem(listId: number, title: string): Promise<ListDetailView> {
    const list = await this.load(listId);
    const trimmed = title.trim().slice(0, 200);
    if (!trimmed) {
      throw new BadRequestException('Item title is required');
    }

    const nextOrder =
      list.items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;

    await this.prisma.listItem.create({
      data: { listId, title: trimmed, sortOrder: nextOrder },
    });

    return this.getOne(listId);
  }

  async updateItem(
    listId: number,
    itemId: number,
    input: { title?: string; done?: boolean },
  ): Promise<ListDetailView> {
    const list = await this.load(listId);
    const existing = await this.prisma.listItem.findFirst({
      where: { id: itemId, listId },
    });
    if (!existing) {
      throw new NotFoundException(`Item #${itemId} not found`);
    }

    const data: { title?: string; done?: boolean } = {};

    if (typeof input.title === 'string') {
      const title = input.title.trim().slice(0, 200);
      if (!title) {
        throw new BadRequestException('Item title is required');
      }
      data.title = title;
    }

    if (typeof input.done === 'boolean') {
      data.done = input.done;

      if (input.done === true && !existing.done && list.suggestionsEnabled) {
        await this.upsertMemory(listId, existing.title);
      }
    }

    await this.prisma.listItem.update({
      where: { id: itemId },
      data,
    });

    return this.getOne(listId);
  }

  async removeItem(listId: number, itemId: number): Promise<ListDetailView> {
    await this.load(listId);
    const existing = await this.prisma.listItem.findFirst({
      where: { id: itemId, listId },
    });
    if (!existing) {
      throw new NotFoundException(`Item #${itemId} not found`);
    }

    await this.prisma.listItem.delete({ where: { id: itemId } });
    return this.getOne(listId);
  }

  async reorderItems(listId: number, ids: number[]): Promise<ListDetailView> {
    const list = await this.load(listId);
    const existing = new Set(list.items.map((item) => item.id));

    if (
      !Array.isArray(ids) ||
      ids.length !== existing.size ||
      ids.some((id) => !existing.has(id)) ||
      new Set(ids).size !== ids.length
    ) {
      throw new BadRequestException('ids must list every item once');
    }

    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.listItem.update({
          where: { id },
          data: { sortOrder: i },
        }),
      ),
    );

    return this.getOne(listId);
  }

  async getMemory(
    listId: number,
    query?: string,
  ): Promise<ListItemMemoryView[]> {
    await this.load(listId);

    const memories = await this.prisma.listItemMemory.findMany({
      where: { listId },
      orderBy: [{ lastUsedAt: 'desc' }],
    });

    const ranked = this.rankMemories(memories);

    if (!query || !query.trim()) {
      return ranked;
    }

    const q = query.trim().toLowerCase();
    return ranked.filter((mem) => mem.title.toLowerCase().includes(q));
  }

  async removeMemory(
    listId: number,
    memoryId: number,
  ): Promise<ListDetailView> {
    await this.load(listId);
    const existing = await this.prisma.listItemMemory.findFirst({
      where: { id: memoryId, listId },
    });
    if (!existing) {
      throw new NotFoundException(`Memory #${memoryId} not found`);
    }

    await this.prisma.listItemMemory.delete({ where: { id: memoryId } });
    return this.getOne(listId);
  }

  async restoreMemory(
    listId: number,
    memoryId: number,
  ): Promise<ListDetailView> {
    const list = await this.load(listId);
    const memory = await this.prisma.listItemMemory.findFirst({
      where: { id: memoryId, listId },
    });
    if (!memory) {
      throw new NotFoundException(`Memory #${memoryId} not found`);
    }

    const nextOrder =
      list.items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;

    await this.prisma.listItem.create({
      data: { listId, title: memory.title, sortOrder: nextOrder },
    });

    return this.getOne(listId);
  }

  private async load(id: number): Promise<ListRow> {
    const row = await this.prisma.list.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        itemMemory: { orderBy: { lastUsedAt: 'desc' } },
      },
    });
    if (!row) {
      throw new NotFoundException(`List #${id} not found`);
    }
    return row;
  }

  private async clearMainStatus(): Promise<void> {
    await this.prisma.list.updateMany({
      where: { isMain: true },
      data: { isMain: false },
    });
  }

  private async upsertMemory(listId: number, title: string): Promise<void> {
    const existing = await this.prisma.listItemMemory.findUnique({
      where: { listId_title: { listId, title } },
    });

    if (existing) {
      await this.prisma.listItemMemory.update({
        where: { id: existing.id },
        data: {
          useCount: existing.useCount + 1,
          lastUsedAt: new Date(),
        },
      });
    } else {
      await this.prisma.listItemMemory.create({
        data: { listId, title, useCount: 1, lastUsedAt: new Date() },
      });
    }
  }

  private parseIcon(raw: string | null | undefined): string | null {
    if (raw == null) {
      return null;
    }
    const icon = raw.trim().slice(0, 16);
    return icon || null;
  }

  private rankMemories(
    memories: Array<{
      id: number;
      title: string;
      lastUsedAt: Date;
      useCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ): ListItemMemoryView[] {
    const now = Date.now();
    return memories
      .map((mem) => {
        const daysSince = Math.floor(
          (now - mem.lastUsedAt.getTime()) / 86_400_000,
        );
        const recencyScore = Math.max(0, 30 - daysSince);
        const score = mem.useCount * 2 + recencyScore;
        return {
          id: mem.id,
          title: mem.title,
          lastUsedAt: mem.lastUsedAt.toISOString(),
          useCount: mem.useCount,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private toListView(row: {
    id: number;
    name: string;
    icon: string | null;
    isMain: boolean;
    suggestionsEnabled: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{ done: boolean }>;
  }): ListView {
    const activeCount = row.items.filter((item) => !item.done).length;
    const doneCount = row.items.filter((item) => item.done).length;
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      isMain: row.isMain,
      suggestionsEnabled: row.suggestionsEnabled,
      sortOrder: row.sortOrder,
      activeCount,
      doneCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetailView(row: ListRow): ListDetailView {
    const items: ListItemView[] = row.items.map((item) => ({
      id: item.id,
      title: item.title,
      done: item.done,
      sortOrder: item.sortOrder,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    const memory = this.rankMemories(row.itemMemory);

    const activeCount = row.items.filter((item) => !item.done).length;
    const doneCount = row.items.filter((item) => item.done).length;

    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      isMain: row.isMain,
      suggestionsEnabled: row.suggestionsEnabled,
      sortOrder: row.sortOrder,
      activeCount,
      doneCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items,
      memory,
    };
  }
}
