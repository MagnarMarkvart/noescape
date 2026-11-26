import { Body, Controller, Get, Header, Post, Put } from '@nestjs/common';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  summary() {
    return this.logs.summary();
  }

  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="noescape-logs.json"')
  exportAll() {
    return this.logs.exportAll();
  }

  @Post('purge')
  purge(@Body() body: { kinds?: string[]; before?: string | null; confirm?: string }) {
    return this.logs.purge(body ?? {});
  }

  @Put('retention')
  retention(@Body() body: { days?: number | null; kinds?: string[] }) {
    return this.logs.setRetention(body ?? {});
  }
}
