import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'status',
  },
  {
    path: 'status',
    loadComponent: () =>
      import('./skills/skills-page').then((m) => m.SkillsPage),
    title: 'Status — No Escape',
  },
  {
    path: 'dailies',
    loadComponent: () =>
      import('./dailies/dailies-page').then((m) => m.DailiesPage),
    title: 'Dailies — No Escape',
  },
  {
    path: 'dailies/logs',
    loadComponent: () =>
      import('./dailies/daily-logs-page').then((m) => m.DailyLogsPage),
    title: 'Quest Logs — No Escape',
  },
  {
    path: 'dailies/logs/:date',
    loadComponent: () =>
      import('./dailies/daily-logs-page').then((m) => m.DailyLogsPage),
    title: 'Quest Log — No Escape',
  },
  {
    path: '**',
    redirectTo: 'status',
  },
];
