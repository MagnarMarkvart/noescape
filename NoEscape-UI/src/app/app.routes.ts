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
    path: 'wealth',
    loadComponent: () =>
      import('./character/wealth-page').then((m) => m.WealthPage),
    title: 'Wealth — No Escape',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings-layout').then((m) => m.SettingsLayout),
    title: 'Settings — No Escape',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./settings/settings-page').then((m) => m.SettingsPage),
        title: 'Settings — No Escape',
      },
      {
        path: 'time',
        loadComponent: () =>
          import('./settings/settings-time-page').then(
            (m) => m.SettingsTimePage,
          ),
        title: 'Time — Settings',
      },
      {
        path: 'pomodoro',
        loadComponent: () =>
          import('./settings/settings-pomodoro-page').then(
            (m) => m.SettingsPomodoroPage,
          ),
        title: 'Pomodoro — Settings',
      },
    ],
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
    redirectTo: '/habitus?view=calendar',
    pathMatch: 'full',
  },
  {
    path: 'habitus/new',
    loadComponent: () =>
      import('./habits/habitus-new-page').then((m) => m.HabitusNewPage),
    title: 'New Habit — No Escape',
  },
  {
    path: 'habitus/demo',
    loadComponent: () =>
      import('./habits/habitus-page').then((m) => m.HabitusPage),
    data: { demo: true },
    title: 'Habitus Demo — No Escape',
  },
  {
    path: 'habitus/:id',
    loadComponent: () =>
      import('./habits/habitus-new-page').then((m) => m.HabitusNewPage),
    title: 'Edit Habit — No Escape',
  },
  {
    path: 'habitus',
    loadComponent: () =>
      import('./habits/habitus-page').then((m) => m.HabitusPage),
    title: 'Habitus — No Escape',
  },
  {
    path: 'consuetudo/new',
    loadComponent: () =>
      import('./consuetudo/consuetudo-edit-page').then(
        (m) => m.ConsuetudoEditPage,
      ),
    title: 'New Consuetudo — No Escape',
  },
  {
    path: 'consuetudo/demo',
    loadComponent: () =>
      import('./consuetudo/consuetudo-page').then((m) => m.ConsuetudoPage),
    data: { demo: true },
    title: 'Consuetudo Demo — No Escape',
  },
  {
    path: 'consuetudo/log',
    loadComponent: () =>
      import('./consuetudo/consuetudo-log-page').then(
        (m) => m.ConsuetudoLogPage,
      ),
    title: 'Walk Log — No Escape',
  },
  {
    path: 'consuetudo/:id',
    loadComponent: () =>
      import('./consuetudo/consuetudo-edit-page').then(
        (m) => m.ConsuetudoEditPage,
      ),
    title: 'Edit Consuetudo — No Escape',
  },
  {
    path: 'consuetudo',
    loadComponent: () =>
      import('./consuetudo/consuetudo-page').then((m) => m.ConsuetudoPage),
    title: 'Consuetudo — No Escape',
  },
  {
    path: 'tabularium/new',
    redirectTo: 'habitus/new',
  },
  {
    path: 'tabularium/log',
    redirectTo: 'habitus',
  },
  {
    path: 'tabularium/:id',
    redirectTo: 'habitus',
  },
  {
    path: 'tabularium',
    redirectTo: 'habitus',
  },
  {
    path: 'dailies/defaults/new',
    loadComponent: () =>
      import('./dailies/daily-default-forge-page').then(
        (m) => m.DailyDefaultForgePage,
      ),
    title: 'New Default — No Escape',
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
    path: 'scriptorium/new',
    loadComponent: () =>
      import('./scriptorium/scriptorium-folio-page').then(
        (m) => m.ScriptoriumFolioPage,
      ),
    title: 'New Folio — No Escape',
  },
  {
    path: 'scriptorium/:id',
    loadComponent: () =>
      import('./scriptorium/scriptorium-folio-page').then(
        (m) => m.ScriptoriumFolioPage,
      ),
    title: 'Folio — No Escape',
  },
  {
    path: 'scriptorium',
    loadComponent: () =>
      import('./scriptorium/scriptorium-page').then((m) => m.ScriptoriumPage),
    title: 'Scriptorium — No Escape',
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
