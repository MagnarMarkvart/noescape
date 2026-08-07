import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { HabitsController } from './habits.controller';
import { HabitsService } from './habits.service';

@Module({
  imports: [CharacterModule],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
