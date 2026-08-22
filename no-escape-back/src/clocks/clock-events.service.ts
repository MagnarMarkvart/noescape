import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { ClockEvent } from './clock.types';

export type ClockSsePayload = { type?: string; data: unknown };

@Injectable()
export class ClockEventsService {
  private readonly rooms = new Map<string, Subject<ClockEvent>>();

  emit(ownerId: string, event: ClockEvent): void {
    this.room(ownerId).next(event);
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
