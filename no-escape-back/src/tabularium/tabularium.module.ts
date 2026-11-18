import { Module } from '@nestjs/common';
import { TabulariumController } from './tabularium.controller';
import { TabulariumService } from './tabularium.service';

@Module({
  controllers: [TabulariumController],
  providers: [TabulariumService],
  exports: [TabulariumService],
})
export class TabulariumModule {}
