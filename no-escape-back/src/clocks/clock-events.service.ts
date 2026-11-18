import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { ClockEvent } from './clock.types';

export type ClockSsePayload = { type?: string; data: unknown };

function jsonSafe(event: ClockEvent): ClockEvent {
  try {
    return JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === 'bigint' ? Number(value) : value,
      ),
    ) as ClockEvent;
  } catch {
    try {
      return JSON.parse(
        JSON.stringify({
          snapshot: event.snapshot ?? null,
          kind: event.kind,
          toast: event.toast ?? null,
          jingle: event.jingle ?? null,
        }),
      ) as ClockEvent;
    } catch {
      return { snapshot: null, kind: event.kind };
    }
  }
}

@Injectable()
export class ClockEventsService {
  private readonly rooms = new Map<string, Subject<ClockEvent>>();

  emit(ownerId: string, event: ClockEvent): void {
    this.room(ownerId).next(jsonSafe(event));
  }

  stream(ownerId: string): Observable<ClockSsePayload> {
    return new Observable((subscriber) => {
      const sub = this.room(ownerId).subscribe((event) => {
        subscriber.next({
          type: 'clock.snapshot',
          data: event,
        });
      });
      const ping = setInterval(() => {
        subscriber.next({ type: 'ping', data: { t: Date.now() } });
      }, 25_000);
      return () => {
        sub.unsubscribe();
        clearInterval(ping);
      };
    });
  }

  private room(ownerId: string): Subject<ClockEvent> {
    let subj = this.rooms.get(ownerId);
    if (!subj) {
      subj = new Subject<ClockEvent>();
      this.rooms.set(ownerId, subj);
    }
    return subj;
  }
}
