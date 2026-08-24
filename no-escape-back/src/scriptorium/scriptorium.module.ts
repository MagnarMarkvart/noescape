import { Module } from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { ScriptoriumController } from './scriptorium.controller';
import { ScriptoriumService } from './scriptorium.service';

@Module({
  imports: [SkillsModule],
  controllers: [ScriptoriumController],
  providers: [ScriptoriumService],
  exports: [ScriptoriumService],
})
export class ScriptoriumModule {}
