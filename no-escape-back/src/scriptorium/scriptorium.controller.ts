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
import {
  ScriptoriumService,
  type ScriptoriumUpsertInput,
} from './scriptorium.service';

@Controller('scriptorium')
export class ScriptoriumController {
  constructor(private readonly scriptorium: ScriptoriumService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.scriptorium.list(status || 'OPEN');
  }

  @Get('due')
  due(@Query('days') days?: string) {
    return this.scriptorium.dueSoon(days ? Number(days) : undefined);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.scriptorium.getOne(id);
  }

  @Post()
  create(@Body() body: ScriptoriumUpsertInput) {
    return this.scriptorium.create(body ?? {});
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ScriptoriumUpsertInput,
  ) {
    return this.scriptorium.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.scriptorium.remove(id);
  }

  @Post(':id/subtasks')
  addSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string },
  ) {
    return this.scriptorium.addSubtask(id, body?.title ?? '');
  }

  @Patch(':id/subtasks/:subId')
  updateSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Param('subId', ParseIntPipe) subId: number,
    @Body() body: { title?: string; done?: boolean },
  ) {
    return this.scriptorium.updateSubtask(id, subId, body ?? {});
  }

  @Delete(':id/subtasks/:subId')
  removeSubtask(
    @Param('id', ParseIntPipe) id: number,
    @Param('subId', ParseIntPipe) subId: number,
  ) {
    return this.scriptorium.removeSubtask(id, subId);
  }
}
