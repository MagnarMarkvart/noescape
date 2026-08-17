import { Injectable, signal } from '@angular/core';

const COMPACT_QUERY = '(max-width: 899px)';

function prefersCompact(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches;
}

@Injectable({ providedIn: 'root' })
export class AppShellService {
  readonly collapsed = signal(prefersCompact());

  collapse(): void {
    this.collapsed.set(true);
  }

  bindViewport(onDestroy: (teardown: () => void) => void): void {
    if (typeof window === 'undefined') {
      return;
    }
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      this.collapsed.set(event.matches);
    };
    mq.addEventListener('change', onChange);
    onDestroy(() => mq.removeEventListener('change', onChange));
  }
}
