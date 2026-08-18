import { isDevMode } from '@angular/core';

// Production build: empty = same-origin (Nest serves SPA + API on :8084)
// ng serve: Angular is on :4200, Nest is on :3000
export const API_BASE_URL = isDevMode() ? 'http://localhost:3000' : '';
