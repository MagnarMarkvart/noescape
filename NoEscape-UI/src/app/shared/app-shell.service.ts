import { computed, effect, Injectable, signal } from '@angular/core';

const COMPACT_QUERY = '(max-width: 899px)';

function prefersCompact(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches;
}

@Injectable({ providedIn: 'root' })
export class AppShellService {
  readonly compact = signal(prefersCompact());
  readonly collapsed = signal(prefersCompact());
  readonly drawerOpen = computed(() => this.compact() && !this.collapsed());

  constructor() {
    effect(() => {
      if (typeof document === 'undefined') {
        return;
      }
      document.body.classList.toggle('nav-lock', this.drawerOpen());
    });
  }

  collapse(): void {
    this.collapsed.set(true);
  }

  isCompact(): boolean {
    return this.compact();
  }

  bindViewport(onDestroy: (teardown: () => void) => void): void {
    if (typeof window === 'undefined') {
      return;
    }
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      this.compact.set(event.matches);
      this.collapsed.set(event.matches);
    };
    this.compact.set(mq.matches);
    mq.addEventListener('change', onChange);
    onDestroy(() => mq.removeEventListener('change', onChange));
  }
}
