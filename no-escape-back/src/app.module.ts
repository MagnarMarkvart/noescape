import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CharacterModule } from './character/character.module';
import { DailiesModule } from './dailies/dailies.module';
import { HabitsModule } from './habits/habits.module';
import { HorologiumModule } from './horologium/horologium.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuestsModule } from './quests/quests.module';
import { RewardsModule } from './rewards/rewards.module';
import { RoutinesModule } from './routines/routines.module';
import { SkillsModule } from './skills/skills.module';
import { TimeModule } from './time/time.module';

@Module({
  imports: [
    PrismaModule,
    TimeModule,
    SkillsModule,
    DailiesModule,
    HorologiumModule,
    RewardsModule,
    CharacterModule,
    QuestsModule,
    HabitsModule,
    RoutinesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
