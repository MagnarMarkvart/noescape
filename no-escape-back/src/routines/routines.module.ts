import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { QuestsModule } from '../quests/quests.module';
import { SkillsModule } from '../skills/skills.module';
import { RoutinesController } from './routines.controller';
import { RoutinesService } from './routines.service';

@Module({
  imports: [CharacterModule, QuestsModule, SkillsModule],
  controllers: [RoutinesController],
  providers: [RoutinesService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
