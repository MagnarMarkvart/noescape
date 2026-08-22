import { signal } from '@angular/core';

/** `serverNow - Date.now()` from the last clock snapshot. */
export const clockSkewMs = signal(0);

/** Server-aligned instant for remaining/elapsed projection. */
export function clockNow(): number {
  return Date.now() + clockSkewMs();
}
