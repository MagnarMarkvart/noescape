import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CreateActivityDto } from './dto/create-activity.dto';
import { SkillsService } from './skills.service';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  findAll() {
    return this.skillsService.findAll();
  }

  @Get('tree')
  findGrouped() {
    return this.skillsService.findGrouped();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.skillsService.findOne(id);
  }

  @Get(':id/activities')
  findActivities(@Param('id', ParseIntPipe) id: number) {
    return this.skillsService.findActivities(id);
  }

  @Post(':id/activities')
  logActivity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.skillsService.logActivity(id, dto);
  }
}
