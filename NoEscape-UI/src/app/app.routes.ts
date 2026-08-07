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
    path: '**',
    redirectTo: 'status',
  },
];
