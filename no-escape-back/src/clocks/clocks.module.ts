import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DailiesModule } from '../dailies/dailies.module';
import { HorologiumModule } from '../horologium/horologium.module';
import { RoutinesModule } from '../routines/routines.module';
import { ClockEventsService } from './clock-events.service';
import { ClocksController } from './clocks.controller';
import { ClocksService } from './clocks.service';
import { DataSyncInterceptor } from './data-sync.interceptor';

@Module({
  imports: [HorologiumModule, RoutinesModule, DailiesModule],
  controllers: [ClocksController],
  providers: [
    ClocksService,
    ClockEventsService,
    { provide: APP_INTERCEPTOR, useClass: DataSyncInterceptor },
  ],
  exports: [ClocksService, ClockEventsService],
})
export class ClocksModule {}
