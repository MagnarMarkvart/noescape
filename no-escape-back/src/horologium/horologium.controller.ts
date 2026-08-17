import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { AbandonHorologiumSessionDto } from './dto/abandon-session.dto';
import { AwardHorologiumBlockDto } from './dto/award-block.dto';
import { CompleteHorologiumSessionDto } from './dto/complete-session.dto';
import {
  CloseEarlyHorologiumDto,
  CompleteHorologiumTaskDto,
} from './dto/complete-task.dto';
import { HorologiumService } from './horologium.service';
import { HorologiumWatchesService } from './horologium-watches.service';
import { HorologiumMode } from '../xp/horologium-xp.util';

@Controller('horologium')
export class HorologiumController {
  constructor(
    private readonly horologiumService: HorologiumService,
    private readonly watchesService: HorologiumWatchesService,
  ) {}

  @Get('sessions')
  listSessions(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.horologiumService.listSessions(
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : 0,
    );
  }

  @Get('preview')
  preview(
    @Query('workMinutes') workMinutes?: string,
    @Query('restMinutes') restMinutes?: string,
    @Query('iterations') iterations?: string,
    @Query('mode') mode?: string,
  ) {
    const resolvedMode: HorologiumMode =
      mode === 'adhoc' ? 'adhoc' : 'planned';
    return this.horologiumService.preview(
      Number(workMinutes ?? 25),
      Number(restMinutes ?? 5),
      Number(iterations ?? 1),
      resolvedMode,
    );
  }

  @Get('watches')
  listWatches(@Query('status') status?: string) {
    return this.watchesService.list(status || 'ACTIVE');
  }

  @Post('watches')
  createWatch(@Body() body: { name?: string }) {
    return this.watchesService.create(body?.name ?? '');
  }

  @Patch('watches/:id')
  updateWatch(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      status?: string;
      elapsedMs?: number;
      running?: boolean;
    },
  ) {
    return this.watchesService.update(id, body);
  }

  @Post('watches/:id/archive')
  archiveWatch(@Param('id', ParseIntPipe) id: number) {
    return this.watchesService.archive(id);
  }

  @Post('blocks')
  awardBlock(@Body() dto: AwardHorologiumBlockDto) {
    return this.horologiumService.awardBlock(dto);
  }

  /** Planned sessio finished in full — Discipline goal bonus only. */
  @Post('goal-bonus')
  goalBonus(@Body() dto: CompleteHorologiumSessionDto) {
    return this.horologiumService.awardGoalBonus(dto);
  }

  /** Planned sessio stopped early — 30% XP per unfinished split. */
  @Post('abandon')
  abandon(@Body() dto: AbandonHorologiumSessionDto) {
    return this.horologiumService.abandonSession(dto);
  }

  /** Bound quest daily finished during a sessio. */
  @Post('complete-task')
  completeTask(@Body() dto: CompleteHorologiumTaskDto) {
    return this.horologiumService.completeBoundTask(dto);
  }

  /** Stop after a settled task — no abandon penalty. */
  @Post('close-early')
  closeEarly(@Body() dto: CloseEarlyHorologiumDto) {
    return this.horologiumService.closeEarly(dto);
  }

  /** @deprecated Prefer /blocks + /goal-bonus. Kept as goal-bonus alias. */
  @Post('sessions')
  complete(@Body() dto: CompleteHorologiumSessionDto) {
    return this.horologiumService.awardGoalBonus(dto);
  }
}
