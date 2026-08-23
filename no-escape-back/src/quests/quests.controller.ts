import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
      rules?: string;
      stakes?: string;
      howToWin?: string;
      destination?: string;
      journeyLabel?: string;
      journeyNote?: string;
      commitmentLevel?: number;
      deadline?: string | null;
      coverDataUrl?: string;
      tier?: string;
      skillSlug?: string;
      skillReqs?: { slug: string; level: number }[];
      unlockReqs?: string[];
      questReqs?: string[];
      subtasks?: Array<
        | string
        | {
            id?: number;
            title: string;
            gatesJourney?: boolean;
            deadline?: string | null;
            estimateMinutes?: number | null;
          }
      >;
      rewards?: {
        title?: string;
        features?: string[];
        permissionKeys?: string[];
      };
      totalXp?: number;
      skillWeights?: { slug: string; weight: number }[];
      completionBonus?: Record<string, number>;
      wealthCents?: number | null;
      scriptoriumWorkId?: number;
      dailyWorkMinutes?: number | null;
      dailyWorkTitle?: string | null;
    },
  ) {
    return this.questsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name: string;
      summary?: string;
      description?: string;
      rules?: string;
      stakes?: string;
      howToWin?: string;
      destination?: string;
      journeyLabel?: string;
      journeyNote?: string;
      commitmentLevel?: number;
      deadline?: string | null;
      coverDataUrl?: string;
      tier?: string;
      skillSlug?: string;
      skillReqs?: { slug: string; level: number }[];
      questReqs?: string[];
      subtasks?: Array<
        | string
        | {
            id?: number;
            title: string;
            gatesJourney?: boolean;
            deadline?: string | null;
            estimateMinutes?: number | null;
          }
      >;
      rewards?: {
        title?: string;
        features?: string[];
        permissionKeys?: string[];
      };
      totalXp?: number;
      skillWeights?: { slug: string; weight: number }[];
      wealthCents?: number | null;
      dailyWorkMinutes?: number | null;
      dailyWorkTitle?: string | null;
    },
  ) {
    return this.questsService.update(id, body);
  }

  @Post('runs/:runId/log')
  logDay(
    @Param('runId', ParseIntPipe) runId: number,
    @Body() body: { result: 'CLEAN' | 'BROKEN'; date?: string; note?: string },
  ) {
    return this.questsService.logDay(runId, body);
  }

  @Post('runs/:runId/journey')
  logJourney(
    @Param('runId', ParseIntPipe) runId: number,
    @Body() body: { date?: string; note?: string; done?: boolean },
  ) {
    return this.questsService.logJourney(runId, body);
  }

  @Post('runs/:runId/subtasks/:subtaskId')
  toggleSubtask(
    @Param('runId', ParseIntPipe) runId: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() body: { completed: boolean },
  ) {
    return this.questsService.toggleSubtask(
      runId,
      subtaskId,
      Boolean(body?.completed),
    );
  }

  @Patch('runs/:runId/subtasks/:subtaskId/elapsed')
  addSubtaskElapsed(
    @Param('runId', ParseIntPipe) runId: number,
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() body: { elapsedMs?: number },
  ) {
    return this.questsService.addSubtaskElapsed(
      runId,
      subtaskId,
      Number(body?.elapsedMs) || 0,
    );
  }

  @Post('runs/:runId/destination')
  completeDestination(@Param('runId', ParseIntPipe) runId: number) {
    return this.questsService.completeDestination(runId);
  }

  @Post(':id/start')
  start(@Param('id', ParseIntPipe) id: number) {
    return this.questsService.start(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.questsService.remove(id);
  }
}
