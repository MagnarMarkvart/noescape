import { signal } from '@angular/core';

const DEFAULT_MS = 3000;

/** Local page toast that clears itself after a short delay. */
export class TimedToast {
  readonly value = signal<string | null>(null);
  private handle: ReturnType<typeof setTimeout> | null = null;
  private readonly ms: number;

  constructor(ms = DEFAULT_MS) {
    this.ms = ms;
  }

  set(message: string | null): void {
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = null;
    }
    this.value.set(message);
    if (message) {
      this.handle = setTimeout(() => {
        this.value.set(null);
        this.handle = null;
      }, this.ms);
    }
  }

  clear(): void {
    this.set(null);
  }
}
