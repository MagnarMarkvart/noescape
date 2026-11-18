import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ListsService, type ListUpsertInput } from './lists.service';

@Controller('lists')
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Get()
  list() {
    return this.lists.list();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.lists.getOne(id);
  }

  @Post()
  create(@Body() body: ListUpsertInput) {
    return this.lists.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: ListUpsertInput) {
    return this.lists.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.lists.remove(id);
  }

  @Post(':id/items')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string },
  ) {
    return this.lists.addItem(id, body?.title ?? '');
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: { title?: string; done?: boolean },
  ) {
    return this.lists.updateItem(id, itemId, body ?? {});
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    return this.lists.removeItem(id, itemId);
  }

  @Patch(':id/items/order')
  reorderItems(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { ids?: number[] },
  ) {
    return this.lists.reorderItems(id, body?.ids ?? []);
  }

  @Get(':id/memory')
  getMemory(
    @Param('id', ParseIntPipe) id: number,
    @Query('query') query?: string,
  ) {
    return this.lists.getMemory(id, query);
  }

  @Delete(':id/memory/:memoryId')
  removeMemory(
    @Param('id', ParseIntPipe) id: number,
    @Param('memoryId', ParseIntPipe) memoryId: number,
  ) {
    return this.lists.removeMemory(id, memoryId);
  }

  @Post(':id/memory/:memoryId/restore')
  restoreMemory(
    @Param('id', ParseIntPipe) id: number,
    @Param('memoryId', ParseIntPipe) memoryId: number,
  ) {
    return this.lists.restoreMemory(id, memoryId);
  }
}
