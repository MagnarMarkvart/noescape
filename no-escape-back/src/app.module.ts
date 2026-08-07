import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DailiesModule } from './dailies/dailies.module';
import { PrismaModule } from './prisma/prisma.module';
import { SkillsModule } from './skills/skills.module';

@Module({
  imports: [PrismaModule, SkillsModule, DailiesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
