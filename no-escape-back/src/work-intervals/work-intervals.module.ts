import { Module } from '@nestjs/common';
import { WorkIntervalsController } from './work-intervals.controller';
import { WorkIntervalsService } from './work-intervals.service';

@Module({
  controllers: [WorkIntervalsController],
  providers: [WorkIntervalsService],
  exports: [WorkIntervalsService],
})
export class WorkIntervalsModule {}
