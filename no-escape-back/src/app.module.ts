import { Module } from '@nestjs/common';
import { LiveBusModule } from './live-bus/live-bus';
import { LootModule } from './loot/loot.service';
import { PalmaresModule } from './palmares/palmares.module';
import { LogsModule } from './log-archive/logs.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClocksModule } from './clocks/clocks.module';
import { CharacterModule } from './character/character.module';
import { DailiesModule } from './dailies/dailies.module';
import { HabitsModule } from './habits/habits.module';
import { HorologiumModule } from './horologium/horologium.module';
import { ListsModule } from './lists/lists.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuestsModule } from './quests/quests.module';
import { RewardsModule } from './rewards/rewards.module';
import { RoutinesModule } from './routines/routines.module';
import { ScriptoriumModule } from './scriptorium/scriptorium.module';
import { SkillsModule } from './skills/skills.module';
import { TabulariumModule } from './tabularium/tabularium.module';
import { TimeModule } from './time/time.module';
import { WorkIntervalsModule } from './work-intervals/work-intervals.module';

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
    ScriptoriumModule,
    ListsModule,
    ClocksModule,
    TabulariumModule,
    WorkIntervalsModule,
    LogsModule,
    LiveBusModule,
    LootModule,
    PalmaresModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
