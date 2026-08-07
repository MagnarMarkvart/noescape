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
import { HabitsService } from './habits.service';

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

  @Post()
  create(
    @Body()
    body: {
      name: string;
      icon?: string;
      skillId?: number;
      cadence?: string;
      everyNDays?: number;
    },
    @Query('dev') dev?: string,
  ) {
    return this.habitsService.create(body, this.isDev(dev));
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
