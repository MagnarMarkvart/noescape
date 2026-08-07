import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed()" aria-label="App">
      <button
        type="button"
        class="toggle"
        (click)="collapsed.set(!collapsed())"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-label]="collapsed() ? 'Expand navigation' : 'Collapse navigation'"
      >
        {{ collapsed() ? '›' : '‹' }}
      </button>

      @if (collapsed()) {
        <p class="collapsed-label" aria-hidden="true">{{ viewLabel() }}</p>
        <span class="sr-only">{{ viewLabel() }}</span>
      } @else {
        <nav class="nav">
          <a routerLink="/status" routerLinkActive="active">Status</a>
          <a routerLink="/dailies" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            Dailies
          </a>
          <a routerLink="/dailies/logs" routerLinkActive="active" class="sub">
            Quest Logs
          </a>
          <a routerLink="/quest-timer" routerLinkActive="active">Quest Timer</a>
        </nav>
      }
    </aside>
  `,
  styles: `
    :host {
      display: contents;
    }

    .sidebar {
      position: sticky;
      top: 0;
      align-self: start;
      height: 100dvh;
      width: 11.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 0.75rem 0.65rem;
      border-right: 1px solid #8a7340;
      background: linear-gradient(180deg, #2a2316, #1c1810);
      transition: width 0.15s ease;
    }

    .sidebar.collapsed {
      width: 2.75rem;
      align-items: center;
      padding-inline: 0.35rem;
    }

    .toggle {
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 1px solid #8a7340;
      background: transparent;
      color: #f0e6c8;
      cursor: pointer;
      font-size: 1.1rem;
      line-height: 1;
    }

    .toggle:hover,
    .toggle:focus-visible {
      border-color: #c6a85a;
      outline: none;
    }

    .nav {
      display: grid;
      gap: 0.35rem;
    }

    .nav a {
      padding: 0.5rem 0.65rem;
      text-decoration: none;
      color: #b8a878;
      border: 1px solid transparent;
      font-family: Cinzel, 'Palatino Linotype', Palatino, serif;
      letter-spacing: 0.04em;
      font-size: 0.92rem;
    }

    .nav a.sub {
      margin-left: 0.55rem;
      font-size: 0.82rem;
      opacity: 0.9;
    }

    .nav a:hover,
    .nav a:focus-visible {
      color: #f0e6c8;
      border-color: #8a7340;
      outline: none;
    }

    .nav a.active {
      color: #1a1408;
      background: linear-gradient(180deg, #e0c06a, #d4a84b);
      border-color: #8a6a28;
    }

    .collapsed-label {
      margin: 1rem 0 0;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-family: Cinzel, 'Palatino Linotype', Palatino, serif;
      letter-spacing: 0.22em;
      color: #d4a84b;
      font-size: 0.85rem;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      border: 0;
    }
  `,
})
export class AppSidebar {
  private readonly router = inject(Router);

  protected readonly collapsed = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly viewLabel = computed(() => {
    const path = this.url();
    if (path.startsWith('/dailies/logs')) {
      return 'LOGS';
    }
    if (path.startsWith('/dailies')) {
      return 'DAILIES';
    }
    if (path.startsWith('/quest-timer')) {
      return 'TIMER';
    }
    return 'STATUS';
  });
}
