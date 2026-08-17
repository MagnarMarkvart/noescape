import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CharacterService } from './character.service';

@Controller('character')
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  @Get()
  getProfile() {
    return this.characterService.getProfile();
  }

  @Patch('settings')
  updateSettings(
    @Body() body: { nickname?: string; timezone?: string },
  ) {
    return this.characterService.updateSettings(body ?? {});
  }
}
