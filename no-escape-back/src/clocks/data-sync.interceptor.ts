import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { ClockEventsService } from './clock-events.service';
import { clockOwnerId } from './clock-owner';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Paths whose writes are either already streamed (clocks) or are high-frequency
 * running-clock flushes that would make every open page refetch each minute.
 */
const QUIET = [/^\/clocks(\/|$)/, /\/elapsed$/, /^\/horologium\/notes/];

/** First path segment, e.g. "/dailies/12/complete" -> "dailies". */
export function resourceOf(path: string): string {
  const clean = path.split('?')[0].replace(/^\/api(?=\/)/, '');
  return clean.split('/').filter(Boolean)[0] ?? '';
}

/**
 * Server is the source of truth: after any successful mutation, tell every
 * open client (over the existing clock SSE stream) which resource changed so
 * other devices refresh without a manual reload.
 */
@Injectable()
export class DataSyncInterceptor implements NestInterceptor {
  constructor(private readonly events: ClockEventsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const method = String(req.method ?? '').toUpperCase();
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    if (!MUTATING.has(method) || QUIET.some((re) => re.test(path))) {
      return next.handle();
    }
    const origin = req.headers['x-client-id'];
    return next.handle().pipe(
      tap(() => {
        const resource = resourceOf(path);
        if (!resource) {
          return;
        }
        this.events.emitData(clockOwnerId(), {
          resource,
          method,
          path,
          origin: typeof origin === 'string' ? origin.slice(0, 64) : null,
          at: Date.now(),
        });
      }),
    );
  }
}
