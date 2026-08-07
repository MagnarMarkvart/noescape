import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/rewards.module';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [RewardsModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
