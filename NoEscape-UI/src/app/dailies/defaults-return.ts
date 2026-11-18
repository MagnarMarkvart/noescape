import { Injectable } from '@angular/core';

const KEY = 'noescape.dailies.defaultsFrom';

const ORIGINS: Record<string, { href: string; label: string }> = {
  character: { href: '/character', label: 'Back to Character' },
  dailies: { href: '/dailies', label: 'Back to Dailies' },
  status: { href: '/status', label: 'Back to Dashboard' },
};

const FALLBACK = ORIGINS['dailies'];

@Injectable({ providedIn: 'root' })
export class DefaultsReturn {
  remember(from: string | null | undefined): void {
    const key = String(from ?? '').trim();
    if (!ORIGINS[key]) {
      return;
    }
    try {
      sessionStorage.setItem(KEY, key);
    } catch {
      /* private mode */
    }
  }

  origin(): { href: string; label: string } {
    try {
      const key = sessionStorage.getItem(KEY);
      if (key && ORIGINS[key]) {
        return ORIGINS[key];
      }
    } catch {
      /* private mode */
    }
    return FALLBACK;
  }
}
