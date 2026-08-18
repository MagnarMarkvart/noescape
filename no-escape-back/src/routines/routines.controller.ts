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
import type {
  RoutineStepLogInput,
  RoutineWriteInput,
} from './routines.service';
import { RoutinesService } from './routines.service';

@Controller('routines')
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  private isDev(dev?: string) {
    return dev === '1' || dev === 'true';
  }

  @Get()
  list(@Query('dev') dev?: string) {
    return this.routines.list(this.isDev(dev));
  }

  @Get('access')
  access(@Query('dev') dev?: string) {
    return this.routines.access(this.isDev(dev));
  }

  @Post()
  create(@Body() body: RoutineWriteInput, @Query('dev') dev?: string) {
    return this.routines.create(body, this.isDev(dev));
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @Query('dev') dev?: string) {
    return this.routines.getOne(id, this.isDev(dev));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RoutineWriteInput,
    @Query('dev') dev?: string,
  ) {
    return this.routines.update(id, body, this.isDev(dev));
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Query('dev') dev?: string) {
    return this.routines.remove(id, this.isDev(dev));
  }

  @Post(':id/complete')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { steps?: RoutineStepLogInput[] },
    @Query('dev') dev?: string,
  ) {
    return this.routines.completeRun(
      id,
      { steps: body?.steps ?? [] },
      this.isDev(dev),
    );
  }
}
