import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('skill/:skillId')
  findBySkill(@Param('skillId', ParseIntPipe) skillId: number) {
    return this.rewardsService.findBySkill(skillId);
  }

  @Get('guide/:skillId')
  guide(@Param('skillId', ParseIntPipe) skillId: number) {
    return this.rewardsService.findGuide(skillId);
  }

  @Post(':id/claim')
  claim(@Param('id', ParseIntPipe) id: number) {
    return this.rewardsService.claim(id);
  }
}
