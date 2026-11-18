import { Module, forwardRef } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { DailiesModule } from '../dailies/dailies.module';
import { SkillsModule } from '../skills/skills.module';
import { WorkIntervalsModule } from '../work-intervals/work-intervals.module';
import { QuestsController } from './quests.controller';
import { QuestsService } from './quests.service';

@Module({
  imports: [
    SkillsModule,
    CharacterModule,
    WorkIntervalsModule,
    forwardRef(() => DailiesModule),
  ],
  controllers: [QuestsController],
  providers: [QuestsService],
  exports: [QuestsService],
})
export class QuestsModule {}
