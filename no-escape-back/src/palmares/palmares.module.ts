import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SkillsModule } from '../skills/skills.module';
import { PalmaresService, type AttemptInput, type RecordInput } from './palmares.service';

@Controller('palmares')
export class PalmaresController {
  constructor(private readonly palmares: PalmaresService) {}

  @Get()
  list(@Query('archived') archived?: string) {
    return this.palmares.list(archived === 'true');
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.palmares.getOne(id);
  }

  @Post()
  create(@Body() body: RecordInput) {
    return this.palmares.create(body ?? {});
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: RecordInput) {
    return this.palmares.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.palmares.remove(id);
  }

  @Post(':id/attempts')
  addAttempt(@Param('id', ParseIntPipe) id: number, @Body() body: AttemptInput) {
    return this.palmares.addAttempt(id, body ?? {});
  }

  @Delete('attempts/:attemptId')
  removeAttempt(@Param('attemptId', ParseIntPipe) attemptId: number) {
    return this.palmares.removeAttempt(attemptId);
  }
}

@Module({
  imports: [SkillsModule],
  controllers: [PalmaresController],
  providers: [PalmaresService],
})
export class PalmaresModule {}
