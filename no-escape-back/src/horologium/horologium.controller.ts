import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AwardHorologiumBlockDto } from './dto/award-block.dto';
import { CompleteHorologiumSessionDto } from './dto/complete-session.dto';
import { HorologiumService } from './horologium.service';
import { HorologiumMode } from '../xp/horologium-xp.util';

@Controller('horologium')
export class HorologiumController {
  constructor(private readonly horologiumService: HorologiumService) {}

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

  @Post('blocks')
  awardBlock(@Body() dto: AwardHorologiumBlockDto) {
    return this.horologiumService.awardBlock(dto);
  }

  /** Planned sessio finished in full — goal bonus only. */
  @Post('goal-bonus')
  goalBonus(@Body() dto: CompleteHorologiumSessionDto) {
    return this.horologiumService.awardGoalBonus(dto);
  }

  /** @deprecated Prefer /blocks + /goal-bonus. Kept as goal-bonus alias. */
  @Post('sessions')
  complete(@Body() dto: CompleteHorologiumSessionDto) {
    return this.horologiumService.awardGoalBonus(dto);
  }
}
