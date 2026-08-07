import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { HorologiumController } from './horologium.controller';
import { HorologiumService } from './horologium.service';

@Module({
  imports: [SkillsModule],
  controllers: [HorologiumController],
  providers: [HorologiumService],
})
export class HorologiumModule {}
