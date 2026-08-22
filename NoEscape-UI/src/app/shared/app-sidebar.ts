import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  isDevMode,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { CharacterService } from '../character/character.service';
import { QuestsService } from '../quests/quests.service';
import { SkillsService } from '../skills/skills.service';
import { AppShellService } from './app-shell.service';

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
        <nav class="nav" (click)="onNavClick($event)">
          <a
            routerLink="/status"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            Dashboard
          </a>
          <a routerLink="/character" routerLinkActive="active">Character</a>
          <a routerLink="/quests" routerLinkActive="active">Quests</a>
          <a routerLink="/tabularium" routerLinkActive="active">
            Tabularium
          </a>
          @if (activeQuests().length) {
            <p class="group-label">Started</p>
            @for (q of activeQuests(); track q.runId) {
              <a
                class="sub goal"
                [routerLink]="['/quests', q.questId, 'run']"
                routerLinkActive="active"
              >
                {{ q.name }}
                <span class="streak">{{ q.progressPercent }}%</span>
              </a>
            }
          }
          @if (showHabitus()) {
            <a
              routerLink="/habitus"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
            >
              Habitus
            </a>
          }
          @if (showConsuetudo()) {
            <a
              routerLink="/consuetudo"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
            >
              Consuetudo
            </a>
          }
          @if (unlockables().length) {
            <p class="group-label">Unlockables</p>
            @for (item of unlockables(); track item.id) {
              <a
                class="goal"
                [routerLink]="item.path"
                routerLinkActive="active"
              >
                {{ item.label }}
                <span class="streak">Demo</span>
              </a>
            }
          }
          <a
            routerLink="/dailies"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            Dailies
          </a>
          <a routerLink="/scriptorium" routerLinkActive="active">
            Scriptorium
          </a>
          <a routerLink="/horologium" routerLinkActive="active">
            Horologium
          </a>
          @if (hasLevelUps()) {
            <a routerLink="/level-ups" routerLinkActive="active">Level Ups</a>
          }
          @if (isDev()) {
            <a routerLink="/preview" routerLinkActive="active">Preview</a>
          }
          <a routerLink="/settings" routerLinkActive="active">Settings</a>
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
      overflow: auto;
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

    .nav a.goal {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      font-size: 0.78rem;
      line-height: 1.25;
    }

    .streak {
      color: #d4a84b;
      font-size: 0.72rem;
    }

    .group-label {
      margin: 0.45rem 0 0;
      padding-inline: 0.65rem;
      font-size: 0.68rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8a7340;
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
export class AppSidebar implements OnInit {
  private readonly router = inject(Router);
  private readonly questsService = inject(QuestsService);
  private readonly characterService = inject(CharacterService);
  private readonly skillsService = inject(SkillsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shell = inject(AppShellService);

  protected readonly collapsed = this.shell.collapsed;
  protected readonly habitusUnlocked = signal(false);
  protected readonly consuetudoUnlocked = signal(false);
  protected readonly activeQuests = this.questsService.activeQuests;
  protected readonly hasLevelUps = this.skillsService.hasLevelUps;
  protected readonly isDev = isDevMode;

  protected readonly showHabitus = computed(
    () => isDevMode() || this.habitusUnlocked(),
  );

  protected readonly consuetudoQuestActive = computed(() =>
    this.activeQuests().some((q) => q.slug === 'ordo-diei'),
  );

  protected readonly showConsuetudo = computed(
    () =>
      isDevMode() ||
      this.consuetudoUnlocked() ||
      this.consuetudoQuestActive(),
  );

  protected readonly unlockables = computed(() => {
    const items: Array<{ id: string; label: string; path: string }> = [];
    if (isDevMode() || !this.habitusUnlocked()) {
      items.push({ id: 'habitus', label: 'Habitus', path: '/habitus/demo' });
    }
    if (isDevMode() || !this.consuetudoUnlocked()) {
      items.push({
        id: 'consuetudo',
        label: 'Consuetudo',
        path: '/consuetudo/demo',
      });
    }
    return items;
  });

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  ngOnInit(): void {
    this.shell.bindViewport((teardown) => this.destroyRef.onDestroy(teardown));
    void this.questsService.refreshActive().subscribe();
    void this.skillsService.listLevelUps(1, 1).subscribe();
    this.refreshUnlocks();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.refreshUnlocks();
      });
  }

  private refreshUnlocks(): void {
    this.characterService.getProfile().subscribe({
      next: (p) => {
        this.habitusUnlocked.set(p.habitusUnlocked);
        this.consuetudoUnlocked.set(Boolean(p.consuetudoUnlocked));
      },
      error: () => {
        this.habitusUnlocked.set(false);
        this.consuetudoUnlocked.set(false);
      },
    });
  }

  protected onNavClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('a')) {
      return;
    }
    if (this.shell.isCompact()) {
      if (this.characterService.menuAutoToggleMobile()) {
        this.shell.collapse();
      }
      return;
    }
    if (this.characterService.menuAutoToggleDesktop()) {
      this.shell.collapse();
    }
  }

  protected readonly viewLabel = computed(() => {
    const path = this.url();
    if (path.includes('/guide')) {
      return 'GUIDE';
    }
    if (path.startsWith('/character')) {
      return 'CHARACTER';
    }
    if (path.startsWith('/wealth')) {
      return 'WEALTH';
    }
    if (path.startsWith('/quests')) {
      return 'QUESTS';
    }
    if (path.startsWith('/tabularium')) {
      return 'TABULARIUM';
    }
    if (path.startsWith('/habitus')) {
      return 'HABITUS';
    }
    if (path.startsWith('/consuetudo')) {
      return 'CONSUETUDO';
    }
    if (path.startsWith('/dailies')) {
      return 'DAILIES';
    }
    if (path.startsWith('/horologium') || path.startsWith('/quest-timer')) {
      return 'HOROLOGIUM';
    }
    if (path.startsWith('/scriptorium')) {
      return 'SCRIPTORIUM';
    }
    if (path.startsWith('/level-ups')) {
      return 'LEVEL UPS';
    }
    if (path.startsWith('/preview')) {
      return 'PREVIEW';
    }
    if (path.startsWith('/settings')) {
      return 'SETTINGS';
    }
    return 'DASHBOARD';
  });
}
