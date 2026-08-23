import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  isDevMode,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, max, min, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { HorologiumApiService } from './horologium-api.service';
import { HorologiumTimerService } from './horologium-timer.service';
import { HorologiumWatchService } from './horologium-watch.service';
import { HorologiumTaskClockService } from './horologium-task-clock.service';
import { ConsuetudoClockService } from './consuetudo-clock.service';
import { HorologiumNotesService } from './horologium-notes.service';
import { CharacterService } from '../character/character.service';
import { HorologiumPresetsService } from './horologium-presets.service';
import {
  DEFAULT_HOROLOGIUM_CONFIG,
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
import { HorologiumTaskFocus } from './horologium-task-focus';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { NumberField } from '../shared/ui/number-field';
import { ClockKind } from '../clocks/clock.model';
import { AppShellService } from '../shared/app-shell.service';
import {
  questDailySpecialPool,
  splitQuestXp,
} from '../quests/quest.model';
import { QuestsService } from '../quests/quests.service';
import { DailiesService } from '../dailies/dailies.service';
import {
  RoutineView,
  RoutinesService,
} from '../consuetudo/routines.service';
import { calculateConsuetudoXp } from '../consuetudo/consuetudo-xp';
import { ScriptoriumService } from '../scriptorium/scriptorium.service';
import { ScriptoriumWorkView } from '../scriptorium/scriptorium.model';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { WorkIntervalLog } from '../shared/work-interval-log';

@Component({
  selector: 'app-horologium-page',
  imports: [
    DecimalPipe,
    RouterLink,
    HorologiumSceneryOverlay,
    HorologiumTaskFocus,
    UiConfirm,
    UiIconBtn,
    NumberField,
    WorkIntervalLog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-page.html',
  styleUrl: './horologium-page.css',
})
export class HorologiumPage implements OnInit {
  private readonly timer = inject(HorologiumTimerService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly taskClock = inject(HorologiumTaskClockService);
  private readonly consuetudo = inject(ConsuetudoClockService);
  private readonly liveNotes = inject(HorologiumNotesService);
  private readonly character = inject(CharacterService);
  private readonly api = inject(HorologiumApiService);
  private readonly presetStore = inject(HorologiumPresetsService);
  private readonly quests = inject(QuestsService);
  private readonly dailiesApi = inject(DailiesService);
  private readonly routinesApi = inject(RoutinesService);
  private readonly scriptoriumApi = inject(ScriptoriumService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly xpFeedback = inject(XpFeedbackService);
  protected readonly shell = inject(AppShellService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly presets = this.presetStore.list;
  protected readonly selectedPresetId = signal<string | 'custom' | 'track'>(
    'custom',
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
  protected readonly running = computed(() =>
    this.isConsuetudo() ? this.consuetudo.running() : this.timer.running(),
  );
  protected readonly remainingLabel = computed(() =>
    this.isConsuetudo()
      ? this.consuetudo.displayLabel()
      : this.timer.remainingLabel(),
  );
  protected readonly progressPercent = computed(() =>
    this.isConsuetudo()
      ? this.consuetudo.progressPercent()
      : this.timer.progressPercent(),
  );
  protected readonly phaseLabel = computed(() => {
    if (!this.isConsuetudo()) {
      const label = this.timer.phaseLabel();
      return this.timer.awaitingContinue()
        ? `${label} · waiting to start`
        : label;
    }
    if (this.consuetudo.overtime()) {
      return 'Over';
    }
    return this.consuetudo.currentStep()?.title || 'Practice';
  });
  protected readonly sessionLabel = computed(() =>
    this.isConsuetudo()
      ? this.consuetudo.stepMeta()
      : this.timer.sessionLabel(),
  );
  protected readonly jinglesMuted = this.timer.jinglesMuted;
  protected readonly currentIteration = this.timer.currentIteration;
  protected readonly activeConfig = this.timer.config;
  protected readonly awarding = computed(() =>
    this.isConsuetudo() ? this.consuetudo.awarding() : this.timer.awarding(),
  );
  protected readonly consuetudoToast = signal<string | null>(null);
  protected readonly toast = computed(
    () => this.timer.lastToast() || this.consuetudoToast(),
  );
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
  protected readonly continueLabel = this.timer.continueLabel;

  protected readonly projectWatches = this.watches.watches;
  protected readonly selectedWatch = this.watches.selected;
  protected readonly selectedWatchId = this.watches.selectedId;
  protected readonly watchDraftName = this.watches.draftName;
  protected readonly watchElapsedLabel = this.watches.selectedElapsedLabel;
  protected readonly watchLinked = this.watches.pomodoroLinked;
  protected readonly watchRunning = this.watches.desiredRunning;
  protected readonly watchHint = this.watches.linkedHint;
  protected readonly watchWidgetVisible = this.watches.widgetVisible;
  protected readonly attachableWatches = this.watches.attachableWatches;
  protected readonly extraWatches = this.watches.extraWatches;
  protected readonly taskElapsedLabel = this.taskClock.elapsedLabel;
  protected readonly setupKind = signal<HorologiumSetupKind>('planned');
  protected readonly focusMode = signal(false);

  protected readonly sessions = signal<HorologiumSessionRecord[]>([]);
  protected readonly preview = signal<HorologiumXpPreview | null>(null);
  protected readonly dailies = signal<HorologiumBoundDaily[]>([]);
  protected readonly bindKey = horologiumBindKey;
  protected readonly sessionPrompt = signal<{
    kind: 'stop' | 'task' | 'task-confirm';
    title: string;
    body: string;
    penalty: number;
    cancelLabel: string;
    confirmLabel: string;
    tone?: 'danger' | 'accent';
  } | null>(null);
  protected readonly taskFocusOpen = signal(false);

  protected readonly isActive = computed(() => {
    const p = this.phase();
    return p === 'work' || p === 'rest';
  });

  protected readonly isVigilia = computed(() => this.setupKind() === 'vigilia');
  protected readonly isConsuetudo = computed(
    () => this.setupKind() === 'consuetudo',
  );
  protected readonly consuetudoUnlocked = signal(false);
  private pendingConsuetudoId: number | null = null;
  private routinesReady = false;
  private profileReady = false;
  private consuetudoQueryApplied = false;
  protected readonly routines = signal<RoutineView[]>([]);
  protected readonly selectedRoutineId = signal<number | null>(null);
  protected readonly scriptoriumWorks = signal<ScriptoriumWorkView[]>([]);
  protected readonly showConsuetudoMode = computed(
    () =>
      isDevMode() ||
      this.consuetudoUnlocked() ||
      this.quests.activeQuests().some((q) => q.slug === 'ordo-diei'),
  );
  protected readonly showVigiliaMode = this.character.vigiliaEnabled;
  protected readonly vigiliaCustomAllowed = this.character.vigiliaTrackCustom;
  protected readonly selectedRoutine = computed((): RoutineView | null => {
    const rows = this.routines();
    const id = this.selectedRoutineId();
    const found = rows.find((r) => r.id === id);
    if (found) {
      return found;
    }
    return rows[0] ?? null;
  });
  protected readonly routineSelectValue = computed(() => {
    const id = this.selectedRoutine()?.id;
    return id == null ? '' : String(id);
  });
  protected readonly consuetudoXpPreview = computed(() => {
    const routine = this.selectedRoutine();
    if (!routine) {
      return null;
    }
    const minutes = routine.steps.reduce(
      (sum, s) => sum + s.durationMinutes,
      0,
    );
    return calculateConsuetudoXp({
      effortLevel: routine.effortLevel,
      completedPlannedMinutes: minutes,
      skippedCount: 0,
      totalSteps: routine.steps.length,
    });
  });
  protected readonly consuetudoOvertime = this.consuetudo.overtime;
  protected readonly consuetudoStep = this.consuetudo.currentStep;
  protected readonly notes = this.liveNotes.text;
  protected readonly notesOpen = this.liveNotes.open;
  protected readonly consuetudoFinished = this.consuetudo.finished;
  protected readonly consuetudoInProgress = this.consuetudo.inProgress;

  protected readonly canEdit = computed(
    () =>
      !this.isActive() &&
      this.phase() !== 'complete' &&
      !(this.isVigilia() && this.watchRunning()) &&
      !this.consuetudo.inProgress(),
  );

  protected readonly isTrack = computed(
    () => this.mode() === 'adhoc' && !this.isVigilia() && !this.isConsuetudo(),
  );

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
      this.reloadRoutines();
    });
    effect(() => {
      if (this.phase() === 'complete') {
        this.exitFocus();
      }
    });
    effect(() => {
      const rows = this.presets();
      const id = this.timer.presetId();
      if (id === 'track' || id === 'custom' || !this.canEdit()) {
        return;
      }
      if (rows.some((p) => p.id === id)) {
        this.selectedPresetId.set(id);
        return;
      }
      const first = rows[0];
      if (first) {
        this.selectPreset(first.id);
      }
    });
    effect(() => {
      if (this.consuetudo.inProgress()) {
        this.setupKind.set('consuetudo');
        const id = this.consuetudo.routine()?.id;
        if (id) {
          this.selectedRoutineId.set(id);
        }
      }
    });
    effect(() => {
      this.liveNotes.setKind(this.clockKind());
    });
    effect(() => {
      const done = this.consuetudo.lastComplete() as {
        xpAwarded?: number;
        bonusXp?: number;
      } | null;
      if (!done) {
        return;
      }
      const bonus =
        (done.bonusXp ?? 0) > 0 ? ` · +${done.bonusXp} bonus` : ' · no bonus';
      this.consuetudoToast.set(
        `Consuetudo +${done.xpAwarded ?? 0} XP${bonus}`,
      );
      this.consuetudo.lastComplete.set(null);
      this.exitFocus();
      void this.quests.refreshActive().subscribe();
      this.character.getProfile().subscribe({
        next: (p) => this.consuetudoUnlocked.set(Boolean(p.consuetudoUnlocked)),
      });
    });
  }

  ngOnInit(): void {
    const preset = this.timer.presetId();
    this.selectedPresetId.set(
      preset === 'track' || preset === 'custom' || typeof preset === 'string'
        ? preset
        : 'custom',
    );
    this.draft.set({ ...this.timer.config() });
    this.refreshPreview();
    this.reloadDailies();
    this.reloadRoutines();
    this.reloadScriptorium();
    const consuetudoRaw = this.route.snapshot.queryParamMap.get('consuetudo');
    const consuetudoId = consuetudoRaw ? Number(consuetudoRaw) : NaN;
    this.pendingConsuetudoId =
      Number.isFinite(consuetudoId) && consuetudoId > 0 ? consuetudoId : null;
    this.character.getProfile().subscribe({
      next: (p) => {
        this.consuetudoUnlocked.set(Boolean(p.consuetudoUnlocked));
        this.profileReady = true;
        this.applyConsuetudoQuery();
      },
      error: () => {
        this.consuetudoUnlocked.set(false);
        this.profileReady = true;
        this.applyConsuetudoQuery();
      },
    });
    if (this.consuetudo.inProgress()) {
      this.setupKind.set('consuetudo');
      if (this.consuetudo.running() && !this.sceneryOpen()) {
        this.enterFocus();
      }
    } else if (this.isVigilia() && this.watchRunning()) {
      this.enterFocus();
    } else if (this.mode() === 'adhoc' && this.running()) {
      this.enterFocus();
    } else if (this.mode() === 'planned' && this.isActive()) {
      this.enterFocus();
    }
    this.bindVigiliaQuery();
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
    if (kind === 'consuetudo') {
      this.watches.pauseSolo();
      this.setupKind.set('consuetudo');
      this.ensureRoutineSelected();
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
    const preset = this.presets().find((p) => p.id === id);
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

  protected setDraftWork(n: number): void {
    this.draft.update((d) => ({ ...d, workMinutes: n }));
    this.syncCustom();
  }

  protected setDraftRest(n: number): void {
    this.draft.update((d) => ({ ...d, restMinutes: n }));
    this.syncCustom();
  }

  protected setDraftIterations(n: number): void {
    this.draft.update((d) => ({ ...d, iterations: n }));
    this.syncCustom();
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
    if (this.isConsuetudo()) {
      const routine = this.selectedRoutine();
      if (!routine) {
        return;
      }
      this.consuetudo.load(routine);
      this.consuetudo.start();
      if (!this.sceneryOpen()) {
        this.enterFocus();
      }
      return;
    }
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
    if (this.isConsuetudo()) {
      this.consuetudo.pause();
      this.exitFocus();
      return;
    }
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
    if (this.isConsuetudo()) {
      this.consuetudo.resume();
      if (!this.sceneryOpen()) {
        this.enterFocus();
      }
      return;
    }
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
    if (this.isConsuetudo()) {
      this.consuetudo.reset();
      this.exitFocus();
      return;
    }
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
    this.sessionPrompt.set({
      kind: 'task-confirm',
      title: `Complete ${label}?`,
      body: 'This marks the focused task done and grants its session XP. The sessio can keep running.',
      penalty: 0,
      cancelLabel: 'Not yet',
      confirmLabel: 'Complete task',
      tone: 'accent',
    });
  }

  protected closePrompt(): void {
    const prompt = this.sessionPrompt();
    this.sessionPrompt.set(null);
    if (prompt?.kind === 'task') {
      this.taskClock.flush();
      this.timer.completeBoundTask(() => false);
    }
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
    if (prompt?.kind === 'task-confirm') {
      if (this.phase() === 'complete') {
        this.taskClock.flush();
        this.timer.completeBoundTask(() => false);
        return;
      }
      const label = this.taskLabel() || 'this task';
      this.sessionPrompt.set({
        kind: 'task',
        title: `${label} is done`,
        body: 'Full session XP is yours either way. End now, or continue for extra Focus from remaining blocks.',
        penalty: 0,
        cancelLabel: 'Continue',
        confirmLabel: 'End sessio',
        tone: 'danger',
      });
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
    this.taskClock.flush();
    const daily = this.dailies().find((d) => horologiumBindKey(d) === raw) ?? null;
    this.timer.setBoundDaily(daily);
  }

  protected openTaskFocus(): void {
    if (this.isVigilia() || this.isConsuetudo()) {
      return;
    }
    this.taskFocusOpen.set(true);
  }

  protected closeTaskFocus(): void {
    this.taskFocusOpen.set(false);
  }

  protected completeFromFocus(): void {
    this.taskFocusOpen.set(false);
    this.completeBoundTask();
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

  protected bindScriptoriumWork(raw: string): void {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    const work = this.scriptoriumWorks().find((w) => w.id === id);
    this.setSetupKind('vigilia');
    this.watches.bindScriptorium(id, work?.title ?? '');
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

  protected completeWatch(id: number): void {
    this.watches.completeExtra(id);
  }

  protected canFinishWatch(watch: HorologiumWatchRecord): boolean {
    return watch.bindKind !== 'quest';
  }

  protected toggleExtraWatch(raw: string): void {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    this.watches.attachExtra(id);
  }

  protected detachExtraWatch(id: number): void {
    this.watches.detachExtra(id);
  }

  protected extraWatchElapsed(watch: HorologiumWatchRecord): string {
    return this.watches.elapsedLabel(watch);
  }

  protected isExtraWatch(id: number): boolean {
    return this.watches.isExtra(id);
  }

  protected selectRoutine(raw: string): void {
    if (!this.canEdit()) {
      return;
    }
    const id = Number(raw);
    const row =
      this.routines().find((r) => r.id === id) ?? this.routines()[0] ?? null;
    this.selectedRoutineId.set(row?.id ?? null);
    if (!this.consuetudo.inProgress()) {
      this.consuetudo.load(row);
    }
  }

  protected completeConsuetudoStep(): void {
    this.consuetudo.completeCurrent();
  }

  protected skipConsuetudoStep(): void {
    this.consuetudo.skipCurrent();
  }

  private clockKind(): ClockKind {
    if (this.isConsuetudo()) {
      return 'consuetudo';
    }
    if (this.isVigilia()) {
      return 'vigilia';
    }
    return this.mode() === 'adhoc' ? 'track' : 'sessio';
  }

  protected toggleNotes(): void {
    this.liveNotes.toggleOpen();
  }

  protected setLiveNotes(value: string): void {
    this.liveNotes.setText(value);
  }

  private reloadRoutines(): void {
    this.routinesApi.list().subscribe({
      next: (rows) => {
        this.routines.set(rows);
        this.routinesReady = true;
        if (this.applyConsuetudoQuery()) {
          return;
        }
        if (this.isConsuetudo()) {
          this.ensureRoutineSelected();
        }
      },
      error: () => {
        this.routines.set([]);
        this.routinesReady = true;
        this.applyConsuetudoQuery();
      },
    });
  }

  private ensureRoutineSelected(): void {
    if (this.consuetudo.inProgress()) {
      const running = this.consuetudo.routine();
      if (running) {
        this.selectedRoutineId.set(running.id);
      }
      return;
    }
    const row = this.selectedRoutine();
    this.selectedRoutineId.set(row?.id ?? null);
    this.consuetudo.load(row);
  }

  private reloadScriptorium(): void {
    this.scriptoriumApi.list('OPEN').subscribe({
      next: (rows) => this.scriptoriumWorks.set(rows),
      error: () => this.scriptoriumWorks.set([]),
    });
  }

  private bindVigiliaQuery(): void {
    const raw = this.route.snapshot.queryParamMap.get('vigilia');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }
    this.setSetupKind('vigilia');
    this.scriptoriumApi.getOne(id).subscribe({
      next: (work) => {
        this.setSetupKind('vigilia');
        this.watches.bindScriptorium(work.id, work.title);
      },
      error: () => this.watches.bindScriptorium(id),
    });
  }

  private applyConsuetudoQuery(): boolean {
    const id = this.pendingConsuetudoId;
    if (id == null || this.consuetudoQueryApplied) {
      return false;
    }
    if (!this.routinesReady || !this.profileReady) {
      return false;
    }
    this.consuetudoQueryApplied = true;
    this.pendingConsuetudoId = null;
    if (this.canEdit()) {
      this.setSetupKind('consuetudo');
      this.selectRoutine(String(id));
    }
    if (this.character.consuetudoStartInScenery()) {
      this.enterScenery();
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { consuetudo: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    return true;
  }

  private enterFocus(): void {
    if (this.sceneryOpen()) {
      return;
    }
    this.focusMode.set(true);
    this.shell.collapse();
    this.liveNotes.openOnDesktop();
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
                  journeyLabel: slot.skillShares?.length
                    ? `${slot.title} · ${slot.skillShares.map((s) => s.name).join(' · ')}`
                    : slot.skill
                      ? `${slot.title} · ${slot.skill.name}`
                      : slot.title,
                  kind: 'BOARD',
                  totalXp: slot.projectedXp,
                  durationDays: null,
                  elapsedMs: slot.elapsedMs ?? 0,
                  skillShares: (slot.skillShares?.length
                    ? slot.skillShares
                    : slot.skill
                      ? [
                          {
                            slug: slot.skill.slug,
                            name: slot.skill.name,
                            weight: 10,
                            xp: slot.projectedXp,
                          },
                        ]
                      : []),
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

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
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
