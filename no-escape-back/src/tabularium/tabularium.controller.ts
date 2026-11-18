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
import {
  TabulariumService,
  type TabulaUpsertInput,
} from './tabularium.service';

@Controller('tabularium')
export class TabulariumController {
  constructor(private readonly tabularium: TabulariumService) {}

  @Get()
  list(@Query('date') date?: string) {
    return this.tabularium.list(date);
  }

  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.tabularium.calendar(from ?? '', to ?? '');
  }

  @Get('log')
  log(@Query('date') date?: string) {
    return this.tabularium.log(date);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('date') date?: string,
  ) {
    return this.tabularium.getOne(id, date);
  }

  @Post()
  create(@Body() body: TabulaUpsertInput) {
    return this.tabularium.create(body ?? {});
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: TabulaUpsertInput,
  ) {
    return this.tabularium.update(id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tabularium.remove(id);
  }

  @Post(':id/click')
  click(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { delta?: number },
  ) {
    return this.tabularium.click(id, body?.delta);
  }

  @Post(':id/undo')
  undo(@Param('id', ParseIntPipe) id: number) {
    return this.tabularium.undo(id);
  }
}
