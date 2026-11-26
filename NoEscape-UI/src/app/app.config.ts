import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { clientIdInterceptor } from './core/data-sync';
import { autoCapitalizeInterceptor } from './core/auto-capitalize';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([clientIdInterceptor, autoCapitalizeInterceptor])),
  ],
};
