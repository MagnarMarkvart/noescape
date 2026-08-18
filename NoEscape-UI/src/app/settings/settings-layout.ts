import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-settings-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="settings-shell">
      <header class="toolbar">
        <div>
          <p class="kicker">Account</p>
          <h1>Settings</h1>
        </div>
        <a routerLink="/character" class="back">← Character</a>
      </header>
      <nav class="subnav" aria-label="Settings sections">
        <a
          routerLink="/settings"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
        >
          General
        </a>
        <a routerLink="/settings/pomodoro" routerLinkActive="active">
          Pomodoro
        </a>
      </nav>
      <router-outlet />
    </section>
  `,
  styleUrl: './settings-layout.css',
})
export class SettingsLayout {}
