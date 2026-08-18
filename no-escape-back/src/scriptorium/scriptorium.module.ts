import { Module } from '@nestjs/common';
import { ScriptoriumController } from './scriptorium.controller';
import { ScriptoriumService } from './scriptorium.service';

@Module({
  controllers: [ScriptoriumController],
  providers: [ScriptoriumService],
  exports: [ScriptoriumService],
})
export class ScriptoriumModule {}
