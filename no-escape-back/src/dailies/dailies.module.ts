import { Module, forwardRef } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { HabitsModule } from '../habits/habits.module';
import { QuestsModule } from '../quests/quests.module';
import { SkillsModule } from '../skills/skills.module';
import { WorkIntervalsModule } from '../work-intervals/work-intervals.module';
import { DailiesController } from './dailies.controller';
import { DailiesService } from './dailies.service';

@Module({
  imports: [
    SkillsModule,
    HabitsModule,
    CharacterModule,
    WorkIntervalsModule,
    forwardRef(() => QuestsModule),
  ],
  controllers: [DailiesController],
  providers: [DailiesService],
  exports: [DailiesService],
})
export class DailiesModule {}
