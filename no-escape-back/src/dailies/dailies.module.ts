import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { DailiesController } from './dailies.controller';
import { DailiesService } from './dailies.service';

@Module({
  imports: [SkillsModule],
  controllers: [DailiesController],
  providers: [DailiesService],
})
export class DailiesModule {}
