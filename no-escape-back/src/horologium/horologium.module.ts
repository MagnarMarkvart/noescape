import { Module } from '@nestjs/common';
import { QuestsModule } from '../quests/quests.module';
import { SkillsModule } from '../skills/skills.module';
import { WorkIntervalsModule } from '../work-intervals/work-intervals.module';
import { HorologiumController } from './horologium.controller';
import { HorologiumService } from './horologium.service';
import { HorologiumPresetsService } from './horologium-presets.service';
import { HorologiumWatchesService } from './horologium-watches.service';

@Module({
  imports: [SkillsModule, QuestsModule, WorkIntervalsModule],
  controllers: [HorologiumController],
  providers: [
    HorologiumService,
    HorologiumWatchesService,
    HorologiumPresetsService,
  ],
  exports: [HorologiumService, HorologiumWatchesService],
})
export class HorologiumModule {}
