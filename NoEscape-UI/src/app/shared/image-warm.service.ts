import { Injectable } from '@angular/core';

/**
 * Tracks images already decoded in this session (and those the browser
 * already has in cache). Used so loaders can skip when nothing is pending.
 */
@Injectable({ providedIn: 'root' })
export class ImageWarmService {
  private readonly ready = new Set<string>();
  private readonly inflight = new Map<string, Promise<void>>();

  isWarm(url: string | null | undefined): boolean {
    if (!url) {
      return true;
    }
    if (this.ready.has(url)) {
      return true;
    }
    if (typeof Image === 'undefined') {
      return true;
    }
    const probe = new Image();
    probe.src = url;
    if (probe.complete && probe.naturalWidth > 0) {
      this.ready.add(url);
      return true;
    }
    return false;
  }

  ensure(url: string | null | undefined): Promise<void> {
    if (!url || this.isWarm(url)) {
      return Promise.resolve();
    }
    const pending = this.inflight.get(url);
    if (pending) {
      return pending;
    }
    const next = new Promise<void>((resolve) => {
      const img = new Image();
      const done = () => {
        this.ready.add(url);
        this.inflight.delete(url);
        resolve();
      };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      img.src = url;
      if (img.complete && img.naturalWidth > 0) {
        done();
      }
    });
    this.inflight.set(url, next);
    return next;
  }

  /** Decode covers in the background so later screens can skip the loader. */
  warmAll(urls: Array<string | null | undefined>): void {
    for (const url of urls) {
      void this.ensure(url);
    }
  }
}
