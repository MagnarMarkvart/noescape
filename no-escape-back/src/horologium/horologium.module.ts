import { Module } from '@nestjs/common';
import { QuestsModule } from '../quests/quests.module';
import { SkillsModule } from '../skills/skills.module';
import { HorologiumController } from './horologium.controller';
import { HorologiumService } from './horologium.service';
import { HorologiumWatchesService } from './horologium-watches.service';

@Module({
  imports: [SkillsModule, QuestsModule],
  controllers: [HorologiumController],
  providers: [HorologiumService, HorologiumWatchesService],
})
export class HorologiumModule {}
