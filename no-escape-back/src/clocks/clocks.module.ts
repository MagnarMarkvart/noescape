import { Module } from '@nestjs/common';
import { DailiesModule } from '../dailies/dailies.module';
import { HorologiumModule } from '../horologium/horologium.module';
import { RoutinesModule } from '../routines/routines.module';
import { ClockEventsService } from './clock-events.service';
import { ClocksController } from './clocks.controller';
import { ClocksService } from './clocks.service';

@Module({
  imports: [HorologiumModule, RoutinesModule, DailiesModule],
  controllers: [ClocksController],
  providers: [ClocksService, ClockEventsService],
  exports: [ClocksService, ClockEventsService],
})
export class ClocksModule {}
