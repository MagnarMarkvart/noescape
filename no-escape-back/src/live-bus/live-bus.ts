import { Global, Injectable, Module } from '@nestjs/common';
import { Subject } from 'rxjs';

export type LiveBusEvent = { type: string; data: unknown };

/** App-wide push channel; ClockEventsService forwards it over SSE. */
@Injectable()
export class LiveBus {
  readonly events = new Subject<LiveBusEvent>();

  emit(type: string, data: unknown): void {
    this.events.next({ type, data });
  }
}

@Global()
@Module({ providers: [LiveBus], exports: [LiveBus] })
export class LiveBusModule {}
