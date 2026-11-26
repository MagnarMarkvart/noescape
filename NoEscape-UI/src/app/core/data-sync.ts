import { HttpInterceptorFn } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';

/** Per-tab id so a device ignores the echo of its own writes. */
export const CLIENT_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const clientIdInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-Client-Id': CLIENT_ID } }));

export type DataChanged = {
  resource: string;
  method: string;
  path: string;
  origin: string | null;
  at: number;
};

@Injectable({ providedIn: 'root' })
export class DataSyncService {
  readonly changes = new Subject<DataChanged>();

  push(raw: unknown): void {
    const event = raw as Partial<DataChanged> | null;
    if (!event || typeof event.resource !== 'string') {
      return;
    }
    if (event.origin && event.origin === CLIENT_ID) {
      return;
    }
    this.changes.next(event as DataChanged);
  }
}

function userIsTyping(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const el = document.activeElement as HTMLElement | null;
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Call in a component constructor: re-run `reload` when another device
 * changes one of `resources` (first API path segment, e.g. 'dailies').
 * Debounced; postponed while the user is typing so edits are not clobbered.
 */
export function onRemoteChange(resources: string[], reload: () => void): true {
  const sync = inject(DataSyncService);
  const destroyRef = inject(DestroyRef);
  const wanted = new Set(resources);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    if (userIsTyping()) {
      timer = setTimeout(fire, 3000);
      return;
    }
    reload();
  };
  const sub = sync.changes.subscribe((event) => {
    if (!wanted.has(event.resource)) {
      return;
    }
    if (timer != null) {
      clearTimeout(timer);
    }
    timer = setTimeout(fire, 350);
  });
  destroyRef.onDestroy(() => {
    sub.unsubscribe();
    if (timer != null) {
      clearTimeout(timer);
    }
  });
  return true;
}
