import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { HabitsController } from './habits.controller';
import { HabitsService } from './habits.service';
import { QuestsModule } from '../quests/quests.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [CharacterModule, SkillsModule, QuestsModule],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
