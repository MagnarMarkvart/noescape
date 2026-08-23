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
import { HabitsService, type HabitWriteInput } from './habits.service';

@Controller('habits')
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  private isDev(dev?: string) {
    return dev === '1' || dev === 'true';
  }

  @Get()
  list(@Query('dev') dev?: string) {
    return this.habitsService.list(this.isDev(dev));
  }

  @Get('progression')
  progression(@Query('dev') dev?: string) {
    return this.habitsService.listProgression(this.isDev(dev));
  }

  @Get('groups')
  groups() {
    return this.habitsService.listGroups();
  }

  @Post('groups')
  createGroup(@Body() body: { name?: string }) {
    return this.habitsService.createGroup(body?.name ?? '');
  }

  @Patch('groups/:groupId')
  renameGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: { name?: string },
  ) {
    return this.habitsService.renameGroup(groupId, body?.name ?? '');
  }

  @Delete('groups/:groupId')
  removeGroup(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.habitsService.removeGroup(groupId);
  }

  @Get('stats')
  stats(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ids') ids?: string,
    @Query('grain') grain?: string,
    @Query('dev') dev?: string,
  ) {
    void this.habitsService.assertUnlocked(this.isDev(dev));
    const parsedIds = (ids ?? '')
      .split(',')
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
    return this.habitsService.stats({
      from,
      to,
      ids: parsedIds,
      grain,
    });
  }

  @Post()
  create(
    @Body() body: HabitWriteInput,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.create(body ?? {}, this.isDev(dev));
  }

  @Get(':id')
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.getOne(id, this.isDev(dev));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: HabitWriteInput,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.update(id, body ?? {}, this.isDev(dev));
  }

  @Patch(':id/place')
  place(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { groupId?: number | null; sortOrder?: number },
  ) {
    return this.habitsService.placeHabit(
      id,
      body.groupId === undefined ? null : body.groupId,
      body.sortOrder,
    );
  }

  @Patch(':id/quest-link')
  questLink(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: HabitWriteInput['questLink'] | { clear?: boolean },
  ) {
    if (body && 'clear' in body && body.clear) {
      return this.habitsService.upsertQuestLink(id, null);
    }
    return this.habitsService.upsertQuestLink(
      id,
      (body as HabitWriteInput['questLink']) ?? null,
    );
  }

  @Get(':id/quest-events')
  questEvents(@Param('id', ParseIntPipe) id: number) {
    return this.habitsService.listQuestEvents(id);
  }

  @Get(':id/month')
  month(
    @Param('id', ParseIntPipe) id: number,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('dev') dev?: string,
  ) {
    const now = new Date();
    return this.habitsService.monthLog(
      id,
      Number(year) || now.getFullYear(),
      Number(month) || now.getMonth() + 1,
      this.isDev(dev),
    );
  }

  @Get(':id/range')
  range(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.rangeLog(
      id,
      from || this.habitsService.todayIso(),
      to || this.habitsService.todayIso(),
      this.isDev(dev),
    );
  }

  @Post(':id/complete')
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { date?: string },
    @Query('dev') dev?: string,
  ) {
    await this.habitsService.assertUnlocked(this.isDev(dev));
    const date = body.date || this.habitsService.todayIso();
    return this.habitsService.markComplete(id, date, 'manual');
  }

  @Delete(':id/complete/:date')
  async uncomplete(
    @Param('id', ParseIntPipe) id: number,
    @Param('date') date: string,
    @Query('dev') dev?: string,
  ) {
    await this.habitsService.assertUnlocked(this.isDev(dev));
    return this.habitsService.uncomplete(id, date);
  }

  @Post(':id/click')
  click(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { delta?: number },
    @Query('dev') dev?: string,
  ) {
    void this.habitsService.assertUnlocked(this.isDev(dev));
    return this.habitsService.click(id, body?.delta);
  }

  @Post(':id/undo')
  undo(
    @Param('id', ParseIntPipe) id: number,
    @Query('dev') dev?: string,
  ) {
    void this.habitsService.assertUnlocked(this.isDev(dev));
    return this.habitsService.undo(id);
  }

  @Patch(':id/archive')
  archive(
    @Param('id', ParseIntPipe) id: number,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.setArchived(id, true, this.isDev(dev));
  }

  @Patch(':id/unarchive')
  unarchive(
    @Param('id', ParseIntPipe) id: number,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.setArchived(id, false, this.isDev(dev));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.remove(id, this.isDev(dev));
  }
}
