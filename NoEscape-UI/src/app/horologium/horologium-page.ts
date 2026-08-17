import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, max, min, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { HorologiumApiService } from './horologium-api.service';
import { HorologiumTimerService } from './horologium-timer.service';
import { HorologiumWatchService } from './horologium-watch.service';
import { HorologiumTaskClockService } from './horologium-task-clock.service';
import { CharacterService } from '../character/character.service';
import {
  DEFAULT_HOROLOGIUM_CONFIG,
  HOROLOGIUM_PRESETS,
  HorologiumBoundDaily,
  HorologiumConfig,
  HorologiumMode,
  HorologiumSessionRecord,
  HorologiumSetupKind,
  HorologiumWatchRecord,
  HorologiumXpPreview,
  horologiumBindKey,
} from './horologium.model';
import {
  HOROLOGIUM_SCENERY,
  HorologiumSceneryOverlay,
  loadSceneryId,
  saveSceneryId,
} from './horologium-scenery';
import { AppShellService } from '../shared/app-shell.service';
import {
  questDailySpecialPool,
  splitQuestXp,
} from '../quests/quest.model';
import { QuestsService } from '../quests/quests.service';
import { DailiesService } from '../dailies/dailies.service';

@Component({
  selector: 'app-horologium-page',
  imports: [DecimalPipe, FormField, RouterLink, HorologiumSceneryOverlay],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-page.html',
  styleUrl: './horologium-page.css',
})
export class HorologiumPage implements OnInit {
  private readonly timer = inject(HorologiumTimerService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly taskClock = inject(HorologiumTaskClockService);
  private readonly character = inject(CharacterService);
  private readonly api = inject(HorologiumApiService);
  private readonly quests = inject(QuestsService);
  private readonly dailiesApi = inject(DailiesService);
  private readonly shell = inject(AppShellService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly presets = HOROLOGIUM_PRESETS;
  protected readonly selectedPresetId = signal<string | 'custom' | 'track'>(
    'classic',
  );
  protected readonly scenery = HOROLOGIUM_SCENERY;
  protected readonly sceneryId = signal(loadSceneryId());
  protected readonly sceneryOpen = signal(false);
  protected readonly selectedScene = computed(
    () =>
      this.scenery.find((s) => s.id === this.sceneryId()) ?? this.scenery[0],
  );

  protected readonly draft = signal<HorologiumConfig>({
    ...DEFAULT_HOROLOGIUM_CONFIG,
  });
  protected readonly draftForm = form(this.draft, (p) => {
    required(p.workMinutes);
    min(p.workMinutes, 1);
    max(p.workMinutes, 180);
    required(p.restMinutes);
    min(p.restMinutes, 1);
    max(p.restMinutes, 60);
    required(p.iterations);
    min(p.iterations, 2);
    max(p.iterations, 20);
  });

  protected readonly phase = this.timer.phase;
  protected readonly running = this.timer.running;
  protected readonly remainingLabel = this.timer.remainingLabel;
  protected readonly progressPercent = this.timer.progressPercent;
  protected readonly phaseLabel = this.timer.phaseLabel;
  protected readonly sessionLabel = this.timer.sessionLabel;
  protected readonly jinglesMuted = this.timer.jinglesMuted;
  protected readonly currentIteration = this.timer.currentIteration;
  protected readonly activeConfig = this.timer.config;
  protected readonly awarding = this.timer.awarding;
  protected readonly toast = this.timer.lastToast;
  protected readonly mode = this.timer.mode;
  protected readonly completedBlocks = this.timer.completedBlocks;
  protected readonly boundDaily = this.timer.boundDaily;
  protected readonly taskCompleted = this.timer.taskCompleted;
  protected readonly canCompleteTask = this.timer.canCompleteTask;
  protected readonly taskLabel = this.timer.taskLabel;
  protected readonly restCarryMs = this.timer.restCarryMs;
  protected readonly nextRestLabel = this.timer.nextRestLabel;
  protected readonly restStatLabel = this.timer.restStatLabel;
  protected readonly canSkipRest = this.timer.canSkipRest;

  protected readonly projectWatches = this.watches.watches;
  protected readonly selectedWatch = this.watches.selected;
  protected readonly selectedWatchId = this.watches.selectedId;
  protected readonly watchDraftName = this.watches.draftName;
  protected readonly watchElapsedLabel = this.watches.selectedElapsedLabel;
  protected readonly watchLinked = this.watches.pomodoroLinked;
  protected readonly watchRunning = this.watches.desiredRunning;
  protected readonly watchHint = this.watches.linkedHint;
  protected readonly watchWidgetVisible = this.watches.widgetVisible;
  protected readonly taskElapsedLabel = this.taskClock.elapsedLabel;
  protected readonly setupKind = signal<HorologiumSetupKind>('planned');
  protected readonly focusMode = signal(false);

  protected readonly sessions = signal<HorologiumSessionRecord[]>([]);
  protected readonly preview = signal<HorologiumXpPreview | null>(null);
  protected readonly dailies = signal<HorologiumBoundDaily[]>([]);
  protected readonly bindKey = horologiumBindKey;
  protected readonly sessionPrompt = signal<{
    kind: 'stop' | 'task';
    title: string;
    body: string;
    penalty: number;
    cancelLabel: string;
    confirmLabel: string;
  } | null>(null);

  protected readonly isActive = computed(() => {
    const p = this.phase();
    return p === 'work' || p === 'rest';
  });

  protected readonly isVigilia = computed(() => this.setupKind() === 'vigilia');

  protected readonly canEdit = computed(
    () =>
      !this.isActive() &&
      this.phase() !== 'complete' &&
      !(this.isVigilia() && this.watchRunning()),
  );

  protected readonly isTrack = computed(() => this.mode() === 'adhoc' && !this.isVigilia());

  protected readonly showWatchWidget = computed(
    () =>
      !this.isVigilia() &&
      this.watchWidgetVisible() &&
      this.selectedWatch() != null &&
      (this.isActive() || this.phase() === 'complete'),
  );

  protected readonly abandonPenaltyNow = computed(() => {
    if (this.taskCompleted()) {
      return 0;
    }
    const xp = this.preview();
    if (!xp || this.mode() !== 'planned') {
      return 0;
    }
    const unfinished = Math.max(
      0,
      this.activeConfig().iterations - this.completedBlocks(),
    );
    return Math.round((xp.abandonPenaltyPerSplit || 0) * unfinished);
  });

  protected readonly boundDailyId = computed(() => {
    const bound = this.boundDaily();
    return bound ? horologiumBindKey(bound) : '';
  });

  protected readonly taskXpPreview = computed(() => {
    const daily = this.boundDaily();
    const xp = this.preview();
    if (!daily || !xp) {
      return null;
    }
    const laps = this.mode() === 'adhoc' ? 1 : this.draft().iterations;
    const focus = xp.focusIfCompleted ?? xp.blockXp;
    const discipline = xp.disciplineIfCompleted ?? xp.disciplineXp ?? 0;
    if (daily.source === 'daily') {
      return {
        focus,
        discipline,
        specials: daily.skillShares
          .filter((s) => s.xp > 0)
          .map((s) => ({ name: s.name, xp: s.xp })),
        perLap: [] as Array<{ name: string; xp: number }>,
        streak: false,
      };
    }
    if (daily.kind === 'STREAK_LOG') {
      return {
        focus,
        discipline,
        specials: [] as Array<{ name: string; xp: number }>,
        perLap: [] as Array<{ name: string; xp: number }>,
        streak: true,
      };
    }
    const poolBase = questDailySpecialPool(daily.totalXp, daily.durationDays);
    const pool =
      daily.source === 'subtask'
        ? Math.max(1, Math.round(poolBase / Math.max(1, daily.subtaskCount || 1)))
        : poolBase;
    const shares = splitQuestXp(
      pool,
      daily.skillShares.map((s) => ({ slug: s.slug, weight: s.weight })),
    );
    const specials = shares
      .filter((s) => s.xp > 0)
      .map((s) => ({
        name: daily.skillShares.find((x) => x.slug === s.slug)?.name ?? s.slug,
        xp: s.xp,
      }));
    const perLap = specials.map((s) => ({
      name: s.name,
      xp: Math.max(1, Math.round(s.xp / Math.max(1, laps))),
    }));
    return { focus, discipline, specials, perLap, streak: false };
  });

  /** SVG ring: circumference of r=54 → 2πr ≈ 339.292 */
  private readonly ringCircumference = 2 * Math.PI * 54;

  protected readonly ringDashOffset = computed(() => {
    const pct = Math.min(100, Math.max(0, this.progressPercent()));
    return this.ringCircumference * (1 - pct / 100);
  });

  constructor() {
    effect(() => {
      this.timer.sessionsVersion();
      this.reloadSessions();
      this.reloadDailies();
    });
    effect(() => {
      if (this.phase() === 'complete') {
        this.exitFocus();
      }
    });
  }

  ngOnInit(): void {
    const preset = this.timer.presetId();
    this.selectedPresetId.set(
      preset === 'track' || preset === 'custom' || typeof preset === 'string'
        ? preset
        : 'classic',
    );
    this.draft.set({ ...this.timer.config() });
    this.refreshPreview();
    this.reloadDailies();
    if (this.isVigilia() && this.watchRunning()) {
      this.enterFocus();
    } else if (this.mode() === 'adhoc' && this.running()) {
      this.enterFocus();
    } else if (this.mode() === 'planned' && this.isActive()) {
      this.enterFocus();
    }
  }

  protected setSetupKind(kind: HorologiumSetupKind): void {
    if (!this.canEdit()) {
      return;
    }
    if (kind === 'vigilia') {
      this.watches.pauseSolo();
      this.setupKind.set('vigilia');
      return;
    }
    this.setupKind.set(kind);
    this.setMode(kind);
  }

  protected setMode(mode: HorologiumMode): void {
    if (!this.canEdit()) {
      return;
    }
    this.timer.setMode(mode);
    if (mode === 'adhoc') {
      this.selectedPresetId.set('track');
      this.timer.presetId.set('track');
    } else {
      if (this.selectedPresetId() === 'track') {
        this.selectedPresetId.set('custom');
        this.timer.presetId.set('custom');
      }
      // Sessio needs at least 2 committed work blocks.
      if (this.draft().iterations < 2) {
        this.draft.update((d) => ({ ...d, iterations: 2 }));
        this.timer.applyConfig({ ...this.draft(), iterations: 2 });
      }
    }
    this.refreshPreview();
  }

  protected selectPreset(id: string): void {
    if (!this.canEdit()) {
      return;
    }
    const preset = this.presets.find((p) => p.id === id);
    if (!preset) {
      return;
    }
    this.setupKind.set('planned');
    this.timer.setMode('planned');
    this.selectedPresetId.set(id);
    this.timer.presetId.set(id);
    this.draft.set({ ...preset.config });
    this.timer.applyConfig(preset.config);
    this.refreshPreview();
  }

  protected enableCustom(): void {
    if (!this.canEdit()) {
      return;
    }
    this.setupKind.set('planned');
    this.timer.setMode('planned');
    this.selectedPresetId.set('custom');
    this.timer.presetId.set('custom');
    this.refreshPreview();
  }

  protected syncCustom(): void {
    if (!this.canEdit()) {
      return;
    }
    if (this.mode() === 'planned') {
      this.selectedPresetId.set('custom');
      this.timer.presetId.set('custom');
    }
    this.timer.applyConfig(this.draft());
    this.refreshPreview();
  }

  protected start(): void {
    if (this.isVigilia()) {
      this.watches.startSolo();
      if (!this.sceneryOpen()) {
        this.enterFocus();
      }
      return;
    }
    this.watches.pauseSolo();
    const config = this.sanitizeDraft();
    const mode = this.mode();
    if (mode === 'adhoc') {
      this.timer.presetId.set('track');
    } else {
      this.timer.presetId.set(
        this.selectedPresetId() === 'track'
          ? 'custom'
          : this.selectedPresetId(),
      );
    }
    this.timer.startSession(config, mode);
    if (!this.sceneryOpen()) {
      this.enterFocus();
    }
  }

  protected pause(): void {
    if (this.isVigilia()) {
      this.watches.pauseSolo();
      this.exitFocus();
      return;
    }
    this.timer.pause();
    if (this.isTrack()) {
      this.exitFocus();
    }
  }

  protected resume(): void {
    if (this.isVigilia()) {
      this.watches.startSolo();
      if (!this.sceneryOpen()) {
        this.enterFocus();
      }
      return;
    }
    this.timer.resume();
    if (this.isTrack() && !this.sceneryOpen()) {
      this.enterFocus();
    }
  }

  protected skipRest(): void {
    this.timer.skipRest();
  }

  protected reset(): void {
    if (this.isVigilia()) {
      this.watches.pauseSolo();
      this.exitFocus();
      return;
    }
    this.taskClock.flush();
    if (this.taskCompleted()) {
      this.timer.abandonSession();
      this.exitFocus();
      return;
    }
    if (this.phase() === 'complete' || this.mode() === 'adhoc' || !this.isActive()) {
      this.timer.reset();
      this.exitFocus();
      return;
    }
    const unfinished = Math.max(
      0,
      this.activeConfig().iterations - this.completedBlocks(),
    );
    const penalty = this.abandonPenaltyNow();
    if (unfinished > 0) {
      this.sessionPrompt.set({
        kind: 'stop',
        title: 'Stop this sessio?',
        body:
          penalty > 0
            ? `${unfinished} unfinished split${unfinished === 1 ? '' : 's'} will be charged if you leave now.`
            : 'The goal is not finished yet.',
        penalty,
        cancelLabel: 'Keep going',
        confirmLabel: 'Stop sessio',
      });
      return;
    }
    this.timer.reset();
  }

  protected completeBoundTask(): void {
    this.taskClock.flush();
    const label = this.taskLabel() || 'this task';
    if (this.phase() === 'complete') {
      this.timer.completeBoundTask(() => false);
      return;
    }
    this.sessionPrompt.set({
      kind: 'task',
      title: `${label} is done`,
      body: 'Full session XP is yours either way. End now, or continue for extra Focus from remaining blocks.',
      penalty: 0,
      cancelLabel: 'Continue',
      confirmLabel: 'End sessio',
    });
  }

  protected closePrompt(): void {
    this.sessionPrompt.set(null);
  }

  protected secondaryPrompt(): void {
    const prompt = this.sessionPrompt();
    this.sessionPrompt.set(null);
    if (prompt?.kind === 'task') {
      this.taskClock.flush();
      this.timer.completeBoundTask(() => false);
    }
  }

  protected acceptPrompt(): void {
    const prompt = this.sessionPrompt();
    this.sessionPrompt.set(null);
    if (prompt?.kind === 'stop') {
      this.taskClock.flush();
      this.timer.abandonSession();
      this.exitFocus();
      return;
    }
    if (prompt?.kind === 'task') {
      this.taskClock.flush();
      this.timer.completeBoundTask(() => true);
      this.exitFocus();
    }
  }

  @HostListener('document:keydown.escape')
  protected onPromptEscape(): void {
    if (!this.sessionPrompt()) {
      return;
    }
    this.closePrompt();
  }

  protected selectDaily(raw: string): void {
    if (!this.canEdit()) {
      return;
    }
    const daily = this.dailies().find((d) => horologiumBindKey(d) === raw) ?? null;
    this.timer.setBoundDaily(daily);
  }

  protected toggleJinglesMute(): void {
    this.timer.toggleJinglesMute();
  }

  protected selectScenery(id: string): void {
    this.sceneryId.set(id);
    saveSceneryId(id);
  }

  protected enterScenery(): void {
    this.sceneryOpen.set(true);
  }

  protected exitScenery(): void {
    this.draft.set({ ...this.timer.config() });
    const preset = this.timer.presetId();
    this.selectedPresetId.set(
      preset === 'track' || preset === 'custom' || typeof preset === 'string'
        ? preset
        : 'classic',
    );
    this.sceneryOpen.set(false);
    if (this.isVigilia() && !this.watchRunning()) {
      this.exitFocus();
    } else if (this.isTrack() && this.isActive() && !this.running()) {
      this.exitFocus();
    }
  }

  protected startFromScenery(): void {
    this.draft.set({ ...this.timer.config() });
    const preset = this.timer.presetId();
    this.selectedPresetId.set(
      preset === 'track' || preset === 'custom' || typeof preset === 'string'
        ? preset
        : 'classic',
    );
    this.start();
  }

  protected watchElapsed(watch: HorologiumWatchRecord): string {
    return this.watches.elapsedLabel(watch);
  }

  protected selectWatch(raw: string): void {
    const id = Number(raw);
    this.watches.select(Number.isFinite(id) && id > 0 ? id : null);
  }

  protected setWatchDraftName(raw: string): void {
    this.watches.draftName.set(raw);
  }

  protected createWatch(): void {
    this.watches.create();
  }

  protected toggleWatchWidget(): void {
    this.watches.toggleWidget();
  }

  protected archiveWatch(id: number): void {
    const row = this.projectWatches().find((w) => w.id === id);
    const ok = window.confirm(
      `Archive ${row?.name ?? 'this watch'}? It leaves the active list.`,
    );
    if (!ok) {
      return;
    }
    this.watches.archive(id);
  }

  private enterFocus(): void {
    if (this.sceneryOpen()) {
      return;
    }
    this.focusMode.set(true);
    this.shell.collapse();
  }

  private exitFocus(): void {
    this.focusMode.set(false);
  }

  private reloadDailies(): void {
    forkJoin({
      quests: this.quests.list('active'),
      board: this.dailiesApi.getBoard(this.localToday()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: ({ quests, board }) => {
        const questRows: HorologiumBoundDaily[] = quests
          .filter((q) => q.canLogJourney && q.journeyDueToday && q.run)
          .map((q) => ({
            source: 'quest' as const,
            runId: q.run!.id,
            dailyTaskId: null,
            subtaskId: null,
            questId: q.id,
            name: q.name,
            journeyLabel: q.journeyLabel,
            kind: q.kind,
            totalXp: q.totalXp,
            durationDays: q.durationDays,
            elapsedMs: 0,
            skillShares: q.skillShares,
          }));
        const subtaskRows: HorologiumBoundDaily[] = quests
          .filter((q) => q.availability === 'active' && q.run)
          .flatMap((q) =>
            (q.subtasks ?? [])
              .filter((s) => !s.completed)
              .map((s) => ({
                source: 'subtask' as const,
                runId: q.run!.id,
                dailyTaskId: null,
                subtaskId: s.id,
                questId: q.id,
                name: s.title,
                journeyLabel: `${q.name} · ${s.title}`,
                kind: q.kind,
                totalXp: q.totalXp,
                durationDays: q.durationDays,
                elapsedMs: s.elapsedMs ?? 0,
                subtaskCount: q.subtasks?.length ?? 0,
                skillShares: q.skillShares,
              })),
          );
        const today = this.character.todayIso();
        const boardRows: HorologiumBoundDaily[] =
          board.date === today
            ? board.tiers
                .flatMap((tier) => tier.slots)
                .filter(
                  (slot) => slot.isFilled && slot.id != null && !slot.completed,
                )
                .map((slot) => ({
                  source: 'daily' as const,
                  runId: 0,
                  dailyTaskId: slot.id,
                  subtaskId: null,
                  questId: 0,
                  name: slot.title,
                  journeyLabel: slot.skill
                    ? `${slot.title} · ${slot.skill.name}`
                    : slot.title,
                  kind: 'BOARD',
                  totalXp: slot.projectedXp,
                  durationDays: null,
                  elapsedMs: slot.elapsedMs ?? 0,
                  skillShares: slot.skill
                    ? [
                        {
                          slug: slot.skill.slug,
                          name: slot.skill.name,
                          weight: 1,
                          xp: slot.projectedXp,
                        },
                      ]
                    : [],
                }))
            : [];
        const available = [...boardRows, ...subtaskRows, ...questRows];
        this.dailies.set(available);
        const bound = this.boundDaily();
        if (
          bound &&
          this.canEdit() &&
          !available.some((d) => horologiumBindKey(d) === horologiumBindKey(bound))
        ) {
          this.timer.setBoundDaily(null);
        }
      },
      error: () => {
        /* keep prior list */
      },
    });
  }

  private reloadSessions(): void {
    this.api
      .listSessionItems(3, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => this.sessions.set(rows),
        error: () => {
          /* keep prior log if offline */
        },
      });
  }

  private refreshPreview(): void {
    const d = this.sanitizeDraft();
    this.api
      .preview(d.workMinutes, d.restMinutes, d.iterations, this.mode())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (p) => this.preview.set(p),
        error: () => this.preview.set(null),
      });
  }

  private sanitizeDraft(): HorologiumConfig {
    const d = this.draft();
    return {
      workMinutes: Math.min(180, Math.max(1, Number(d.workMinutes) || 1)),
      restMinutes: Math.min(60, Math.max(1, Number(d.restMinutes) || 1)),
      iterations: Math.min(
        20,
        Math.max(2, Math.round(Number(d.iterations) || 2)),
      ),
      restAfterLast: false,
    };
  }

  private localToday(): string {
    return this.character.todayIso();
  }
}
