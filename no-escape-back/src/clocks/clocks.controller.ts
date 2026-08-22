import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Sse,
} from '@nestjs/common';
import { ClocksService } from './clocks.service';
import { ClockEventsService } from './clock-events.service';
import type { ClockBoundDaily, ClockKind } from './clock.types';

@Controller('clocks')
export class ClocksController {
  constructor(
    private readonly clocks: ClocksService,
    private readonly events: ClockEventsService,
  ) {}

  @Get()
  list() {
    return this.clocks.list();
  }

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream() {
    return this.events.stream(this.clocks.owner());
  }

  @Post('sessio/start')
  startSessio(@Body() body: Record<string, unknown>) {
    return this.clocks.startSessio('sessio', body);
  }

  @Post('track/start')
  startTrack(@Body() body: Record<string, unknown>) {
    return this.clocks.startSessio('track', body);
  }

  @Post('consuetudo/start')
  startConsuetudo(@Body() body: { routineId?: number }) {
    return this.clocks.startConsuetudo(body ?? {});
  }

  @Post('vigilia/start')
  startVigilia(@Body() body: { watchId?: number }) {
    return this.clocks.startVigilia(body ?? {});
  }

  @Post('vigilia/pause')
  pauseVigilia(@Body() body: { watchId?: number }) {
    return this.clocks.pauseVigilia(body ?? {});
  }

  @Post(':kind/pause')
  pause(@Param('kind') kind: ClockKind) {
    this.assertKind(kind);
    return this.clocks.pause(kind);
  }

  @Post(':kind/resume')
  resume(@Param('kind') kind: ClockKind) {
    this.assertKind(kind);
    return this.clocks.resume(kind);
  }

  @Post(':kind/skip')
  skip(@Param('kind') kind: ClockKind) {
    this.assertKind(kind);
    return this.clocks.skip(kind);
  }

  @Post('consuetudo/complete-step')
  completeStep() {
    return this.clocks.completeStep('COMPLETED');
  }

  @Post('consuetudo/skip-step')
  skipStep() {
    return this.clocks.completeStep('SKIPPED');
  }

  @Post(':kind/stop')
  stop(@Param('kind') kind: ClockKind) {
    this.assertKind(kind);
    return this.clocks.stop(kind);
  }

  @Post(':kind/complete-task')
  completeTask(
    @Param('kind') kind: ClockKind,
    @Body() body: { endSession?: boolean },
  ) {
    if (kind !== 'sessio' && kind !== 'track') {
      return this.clocks.stop(kind);
    }
    return this.clocks.completeTask(kind, Boolean(body?.endSession));
  }

  @Patch(':kind/notes')
  notes(@Param('kind') kind: ClockKind, @Body() body: { notes?: string }) {
    this.assertKind(kind);
    return this.clocks.patchNotes(kind, body?.notes ?? '');
  }

  @Patch(':kind/bound-daily')
  boundDaily(
    @Param('kind') kind: ClockKind,
    @Body() body: { boundDaily?: ClockBoundDaily | null },
  ) {
    if (kind !== 'sessio' && kind !== 'track') {
      throw new BadRequestException('Only sessio and track can bind a task');
    }
    return this.clocks.patchBoundDaily(kind, body?.boundDaily ?? null);
  }

  private assertKind(kind: string): asserts kind is ClockKind {
    if (
      kind !== 'sessio' &&
      kind !== 'track' &&
      kind !== 'consuetudo' &&
      kind !== 'vigilia'
    ) {
      throw new BadRequestException(`Unknown clock kind ${kind}`);
    }
  }
}
