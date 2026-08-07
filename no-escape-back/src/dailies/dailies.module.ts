import { Module } from '@nestjs/common';
import { HabitsModule } from '../habits/habits.module';
import { SkillsModule } from '../skills/skills.module';
import { DailiesController } from './dailies.controller';
import { DailiesService } from './dailies.service';

@Module({
  imports: [SkillsModule, HabitsModule],
  controllers: [DailiesController],
  providers: [DailiesService],
})
export class DailiesModule {}
