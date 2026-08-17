import { isDevMode } from '@angular/core';
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
      import('./dashboard/dashboard-page').then((m) => m.DashboardPage),
    title: 'Dashboard — No Escape',
  },
  {
    path: 'status/:skillId/guide',
    loadComponent: () =>
      import('./skills/skill-guide-page').then((m) => m.SkillGuidePage),
    title: 'Skill Guide — No Escape',
  },
  {
    path: 'character',
    loadComponent: () =>
      import('./character/character-page').then((m) => m.CharacterPage),
    title: 'Character — No Escape',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings-page').then((m) => m.SettingsPage),
    title: 'Settings — No Escape',
  },
  {
    path: 'quests/forge',
    loadComponent: () =>
      import('./quests/quest-forge-page').then((m) => m.QuestForgePage),
    title: 'Forge Quest — No Escape',
  },
  {
    path: 'quests/:id/edit',
    loadComponent: () =>
      import('./quests/quest-forge-page').then((m) => m.QuestForgePage),
    title: 'Edit Quest — No Escape',
  },
  {
    path: 'quests',
    loadComponent: () =>
      import('./quests/quests-page').then((m) => m.QuestsPage),
    title: 'Quests — No Escape',
  },
  {
    path: 'quests/:id/run',
    loadComponent: () =>
      import('./quests/quest-run-page').then((m) => m.QuestRunPage),
    title: 'Quest Run — No Escape',
  },
  {
    path: 'quests/:id',
    loadComponent: () =>
      import('./quests/quest-detail-page').then((m) => m.QuestDetailPage),
    title: 'Quest — No Escape',
  },
  {
    path: 'habitus/progression',
    loadComponent: () =>
      import('./habits/habitus-progression-page').then(
        (m) => m.HabitusProgressionPage,
      ),
    title: 'Habit Progression — No Escape',
  },
  {
    path: 'habitus/new',
    loadComponent: () =>
      import('./habits/habitus-new-page').then((m) => m.HabitusNewPage),
    title: 'New Habit — No Escape',
  },
  {
    path: 'habitus',
    loadComponent: () =>
      import('./habits/habitus-page').then((m) => m.HabitusPage),
    title: 'Habitus — No Escape',
  },
  {
    path: 'dailies/defaults',
    loadComponent: () =>
      import('./dailies/daily-defaults-page').then((m) => m.DailyDefaultsPage),
    title: 'Default Tasks — No Escape',
  },
  {
    path: 'dailies',
    loadComponent: () =>
      import('./dailies/dailies-page').then((m) => m.DailiesPage),
    title: 'Dailies — No Escape',
  },
  {
    path: 'dailies/logs',
    redirectTo: 'dailies',
    pathMatch: 'full',
  },
  {
    path: 'dailies/logs/:date',
    redirectTo: ({ params }) => {
      const date = params['date'];
      return date ? `/dailies?date=${date}` : '/dailies';
    },
  },
  {
    path: 'horologium/log',
    loadComponent: () =>
      import('./horologium/horologium-log-page').then(
        (m) => m.HorologiumLogPage,
      ),
    title: 'Horo Log — No Escape',
  },
  {
    path: 'horologium',
    loadComponent: () =>
      import('./horologium/horologium-page').then((m) => m.HorologiumPage),
    title: 'Horologium — No Escape',
  },
  {
    path: 'level-ups',
    loadComponent: () =>
      import('./level-ups/level-ups-page').then((m) => m.LevelUpsPage),
    title: 'Level Ups — No Escape',
  },
  {
    path: 'preview',
    canMatch: [() => isDevMode()],
    loadComponent: () =>
      import('./preview/preview-page').then((m) => m.PreviewPage),
    title: 'Preview — No Escape',
  },
  {
    path: 'quest-timer',
    redirectTo: 'horologium',
  },
  {
    path: '**',
    redirectTo: 'status',
  },
];
