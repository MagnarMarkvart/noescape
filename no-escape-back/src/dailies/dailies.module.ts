import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { HabitsModule } from '../habits/habits.module';
import { SkillsModule } from '../skills/skills.module';
import { WorkIntervalsModule } from '../work-intervals/work-intervals.module';
import { DailiesController } from './dailies.controller';
import { DailiesService } from './dailies.service';

@Module({
  imports: [SkillsModule, HabitsModule, CharacterModule, WorkIntervalsModule],
  controllers: [DailiesController],
  providers: [DailiesService],
  exports: [DailiesService],
})
export class DailiesModule {}
