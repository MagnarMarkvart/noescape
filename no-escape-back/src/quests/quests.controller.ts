import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { QuestsService } from './quests.service';

@Controller('quests')
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  @Get()
  list(@Query('filter') filter?: string) {
    return this.questsService.list(filter || 'all');
  }

  @Get('active')
  active() {
    return this.questsService.listActive();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.questsService.getOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      summary?: string;
      description?: string;
      tier?: string;
      skillSlug?: string;
      skillReqs?: { slug: string; level: number }[];
      unlockReqs?: string[];
      questReqs?: string[];
    },
  ) {
    return this.questsService.create(body);
  }

  @Post(':id/start')
  start(@Param('id', ParseIntPipe) id: number) {
    return this.questsService.start(id);
  }

  @Post('runs/:runId/log')
  logDay(
    @Param('runId', ParseIntPipe) runId: number,
    @Body() body: { result: 'CLEAN' | 'BROKEN'; date?: string; note?: string },
  ) {
    return this.questsService.logDay(runId, body);
  }
}
