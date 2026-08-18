import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { CharacterService } from './character.service';

@Controller('character')
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  @Get()
  getProfile() {
    return this.characterService.getProfile();
  }

  @Get('wealth')
  getWealth(@Query('limit') limit?: string) {
    return this.characterService.getWealth(Number(limit) || 40);
  }

  @Post('wealth')
  adjustWealth(
    @Body()
    body: {
      amount?: number | string;
      direction?: 'add' | 'remove';
      note?: string;
    },
  ) {
    return this.characterService.adjustFromAmount(body ?? {});
  }

  @Patch('settings')
  updateSettings(
    @Body()
    body: {
      nickname?: string;
      timezone?: string;
      dateFormat?: string;
      weekStartsOn?: number;
      menuAutoToggleMobile?: boolean;
      menuAutoToggleDesktop?: boolean;
      currency?: string;
    },
  ) {
    return this.characterService.updateSettings(body ?? {});
  }
}
