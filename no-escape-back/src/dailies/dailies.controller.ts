import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CopyIncompleteDto } from './dto/copy-incomplete.dto';
import { PostponeDailyDto } from './dto/postpone-daily.dto';
import { DailiesService } from './dailies.service';
import { UpsertDailyTaskDto } from './dto/upsert-daily-task.dto';

@Controller('dailies')
export class DailiesController {
  constructor(private readonly dailiesService: DailiesService) {}

  @Get()
  getBoard(@Query('date') date?: string) {
    return this.dailiesService.getBoard(date);
  }

  @Get('logs')
  listLogs() {
    return this.dailiesService.listLogs();
  }

  @Get('logs/:date')
  getLog(@Param('date') date: string) {
    return this.dailiesService.getLog(date);
  }

  @Post('seal')
  sealDay(@Body() body: { date?: string }) {
    return this.dailiesService.sealDay(body?.date);
  }

  @Post('copy-incomplete')
  copyIncomplete(@Body() dto: CopyIncompleteDto) {
    return this.dailiesService.copyIncomplete(dto ?? {});
  }

  @Post('regular-slots')
  addRegularSlot(@Body() body: { date?: string }) {
    return this.dailiesService.addRegularSlot(body?.date);
  }

  @Put('slots')
  upsertSlot(@Body() dto: UpsertDailyTaskDto) {
    return this.dailiesService.upsertSlot(dto);
  }

  @Get('templates')
  listTemplates() {
    return this.dailiesService.listTemplates();
  }

  @Post('templates')
  createTemplate(
    @Body()
    body: {
      name: string;
      icon?: string;
      skillId: number;
      fixedXp: number;
      effortLevel?: number;
      durationMinutes?: number;
    },
  ) {
    return this.dailiesService.createTemplate(body);
  }

  @Delete('templates/:id')
  removeTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.dailiesService.removeTemplate(id);
  }

  @Post(':id/complete')
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.dailiesService.complete(id);
  }

  @Post(':id/uncomplete')
  uncomplete(@Param('id', ParseIntPipe) id: number) {
    return this.dailiesService.uncomplete(id);
  }

  @Post(':id/postpone')
  postpone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PostponeDailyDto,
  ) {
    return this.dailiesService.postpone(id, dto.targetDate);
  }

  @Delete(':id')
  clearSlot(@Param('id', ParseIntPipe) id: number) {
    return this.dailiesService.clearSlot(id);
  }
}
