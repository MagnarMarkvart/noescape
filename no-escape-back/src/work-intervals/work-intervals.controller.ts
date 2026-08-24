import { Controller, Get, Query } from '@nestjs/common';
import { WorkIntervalsService } from './work-intervals.service';

@Controller('work-intervals')
export class WorkIntervalsController {
  constructor(private readonly service: WorkIntervalsService) {}

  @Get()
  list(
    @Query('dailyTaskId') dailyTaskId?: string,
    @Query('questSubtaskId') questSubtaskId?: string,
    @Query('questId') questId?: string,
    @Query('questRunId') questRunId?: string,
    @Query('scriptoriumWorkId') scriptoriumWorkId?: string,
    @Query('watchId') watchId?: string,
  ) {
    const parse = (v?: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return this.service.listForTarget({
      dailyTaskId: parse(dailyTaskId),
      questSubtaskId: parse(questSubtaskId),
      questId: parse(questId),
      questRunId: parse(questRunId),
      scriptoriumWorkId: parse(scriptoriumWorkId),
      watchId: parse(watchId),
    });
  }
}
