import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HorologiumTimerService } from './horologium-timer.service';
import { HorologiumWatchService } from './horologium-watch.service';
import { HorologiumPresetsService } from './horologium-presets.service';
import { ConsuetudoClockService } from './consuetudo-clock.service';
import { HorologiumNotesService } from './horologium-notes.service';
import { SoundSettingsService } from '../shared/sound-settings.service';
import {
  HorologiumBoundDaily,
  HorologiumConfig,
  HorologiumSetupKind,
  VigiliaPickerGroup,
  horologiumBindKey,
} from './horologium.model';
import { RoutineView } from '../consuetudo/routines.service';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { NumberField } from '../shared/ui/number-field';
import { ScriptoriumWorkView } from '../scriptorium/scriptorium.model';

export interface HorologiumScene {
  id: string;
  name: string;
  src: string;
  audio?: string;
}

export const HOROLOGIUM_SCENERY: HorologiumScene[] = [
  {
    id: 'wisteria-temple-canal',
    name: 'Wisteria Temple Canal',
    src: '/assets/scenery/videos/296960_medium.mp4',
    audio: '/assets/scenery/audio/58570_wisteria-temple-canal.mp3?v=2',
  },
  {
    id: 'alpine-lake-reflection',
    name: 'Alpine Lake Reflection',
    src: '/assets/scenery/videos/332544_medium.mp4',
    audio: '/assets/scenery/audio/700637_alpine-lake-reflection.mp3?v=2',
  },
  {
    id: 'purple-forest-dusk',
    name: 'Purple Forest Dusk',
    src: '/assets/scenery/videos/332716_medium.mp4',
    audio: '/assets/scenery/audio/719558_purple-forest-dusk.mp3?v=2',
  },
  {
    id: 'misty-moss-forest',
    name: 'Misty Moss Forest',
    src: '/assets/scenery/videos/334239_medium.mp4',
    audio: '/assets/scenery/audio/157767_misty-moss-forest.mp3?v=2',
  },
  {
    id: 'garden-tea-hour',
    name: 'Garden Tea Hour',
    src: '/assets/scenery/videos/334438_medium.mp4',
    audio: '/assets/scenery/audio/398953_garden-tea-hour.mp3?v=2',
  },
  {
    id: 'candlelit-rain-cafe',
    name: 'Candlelit Rain Cafe',
    src: '/assets/scenery/videos/201947-916877801_medium.mp4',
    audio: '/assets/scenery/audio/346946_candlelit-rain-cafe.mp3',
  },
  {
    id: 'scholars-hearth',
    name: "Scholar's Hearth",
    src: '/assets/scenery/videos/204117-923594068_medium.mp4',
    audio: '/assets/scenery/audio/533428_scholars-hearth.mp3',
  },
  {
    id: 'fireside-lodge-night',
    name: 'Fireside Lodge Night',
    src: '/assets/scenery/videos/208856_medium.mp4',
    audio: '/assets/scenery/audio/580921_fireside-lodge-night.mp3',
  },
  {
    id: 'rainwood-hermitage',
    name: 'Rainwood Hermitage',
    src: '/assets/scenery/videos/213923_medium.mp4',
    audio: '/assets/scenery/audio/695571_rainwood-hermitage.mp3',
  },
  {
    id: 'golden-ripple-tide',
    name: 'Golden Ripple Tide',
    src: '/assets/scenery/videos/284518_medium.mp4',
    audio: '/assets/scenery/audio/573191_golden-ripple-tide.mp3',
  },
  {
    id: 'lumenwing-night-grove',
    name: 'Lumenwing Night Grove',
    src: '/assets/scenery/videos/42197-429661458_medium.mp4',
    audio: '/assets/scenery/audio/825635_lumenwing-night-grove.mp3',
  },
];

const STORAGE_KEY = 'noescape.horologium.scenery';
const VOLUME_KEY = 'noescape.horologium.ambienceVolume';

function loadAmbienceVolume(): number {
  try {
    const raw = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(raw)) {
      return Math.min(100, Math.max(0, Math.round(raw)));
    }
  } catch {
    /* private mode */
  }
  return 100;
}

export function loadSceneryId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && HOROLOGIUM_SCENERY.some((s) => s.id === id)) {
      return id;
    }
  } catch {
    /* private mode */
  }
  return HOROLOGIUM_SCENERY[0].id;
}

export function saveSceneryId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
}

@Component({
  selector: 'app-horologium-scenery',
  imports: [UiIconBtn, NumberField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-scenery.html',
  styleUrl: './horologium-scenery.css',
})
export class HorologiumSceneryOverlay implements AfterViewInit, OnDestroy {
  private readonly timer = inject(HorologiumTimerService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly presetStore = inject(HorologiumPresetsService);
  private readonly consuetudo = inject(ConsuetudoClockService);
  private readonly liveNotes = inject(HorologiumNotesService);
  private readonly sound = inject(SoundSettingsService);

  @Input({ required: true }) src = '';
  @Input() name = '';
  @Input() audio = '';
  @Input() taskLabel = '';
  @Input() canCompleteTask = false;
  @Input() sceneId = '';
  @Input() dailies: HorologiumBoundDaily[] = [];
  @Input() boundDailyId: number | string = '';
  @Input() canEdit = true;
  @Input() setupKind: HorologiumSetupKind = 'planned';
  @Input() widgetVisible = true;
  @Input() blockEscape = false;
  @Input() showConsuetudo = false;
  @Input() routines: RoutineView[] = [];
  @Input() selectedRoutineId: number | null = null;
  @Input() scriptoriumWorks: ScriptoriumWorkView[] = [];
  @Input() vigiliaGroups: VigiliaPickerGroup[] = [];
  @Input() vigiliaSelectValue = '';
  @Input() vigiliaCustomAllowed = false;
  @Input() vigiliaTrackScriptorium = false;
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly taskDone = new EventEmitter<void>();
  @Output() readonly taskFocus = new EventEmitter<void>();
  @Output() readonly started = new EventEmitter<void>();
  @Output() readonly stopped = new EventEmitter<void>();
  @Output() readonly sceneChange = new EventEmitter<string>();
  @Output() readonly dailyChange = new EventEmitter<string>();
  @Output() readonly setupKindChange = new EventEmitter<HorologiumSetupKind>();
  @Output() readonly routineChange = new EventEmitter<string>();
  @Output() readonly vigiliaBind = new EventEmitter<string>();
  protected readonly bindKey = horologiumBindKey;
  @ViewChild('loop') private loop?: ElementRef<HTMLVideoElement>;
  @ViewChild('ambience') private ambience?: ElementRef<HTMLAudioElement>;
  protected readonly scenes = HOROLOGIUM_SCENERY;
  protected readonly presets = this.presetStore.list;
  protected readonly soundOpen = signal(false);
  protected readonly bedVolume = signal(loadAmbienceVolume());
  protected readonly generalVolume = this.sound.feedbackVolume;
  private htmlOverflow = '';
  private bodyOverflow = '';

  protected audioUrl(): string {
    return this.audio || '';
  }

  protected readonly phase = this.timer.phase;
  protected readonly running = this.timer.running;
  protected readonly remainingLabel = this.timer.remainingLabel;
  protected readonly phaseLabel = this.timer.phaseLabel;
  protected readonly sessionLabel = this.timer.sessionLabel;
  protected readonly currentIteration = this.timer.currentIteration;
  protected readonly completedBlocks = this.timer.completedBlocks;
  protected readonly config = this.timer.config;
  protected readonly mode = this.timer.mode;
  protected readonly jinglesMuted = this.timer.jinglesMuted;
  protected readonly ambienceMuted = this.timer.ambienceMuted;
  protected readonly awarding = this.timer.awarding;
  protected readonly restCarryMs = this.timer.restCarryMs;
  protected readonly nextRestLabel = this.timer.nextRestLabel;
  protected readonly restStatLabel = this.timer.restStatLabel;
  protected readonly canSkipRest = this.timer.canSkipRest;
  protected readonly continueLabel = this.timer.continueLabel;
  protected readonly timerPreset = this.timer.presetId;
  protected readonly projectWatches = this.watches.visibleWatches;
  protected readonly selectedWatch = this.watches.selected;
  protected readonly selectedWatchId = this.watches.selectedId;
  protected readonly watchDraftName = this.watches.draftName;
  protected readonly watchElapsedLabel = this.watches.selectedElapsedLabel;
  protected readonly watchLinked = this.watches.pomodoroLinked;
  protected readonly watchRunning = this.watches.desiredRunning;
  protected readonly watchHint = this.watches.linkedHint;
  protected readonly consuetudoLabel = this.consuetudo.displayLabel;
  protected readonly consuetudoOvertime = this.consuetudo.overtime;
  protected readonly consuetudoStep = this.consuetudo.currentStep;
  protected readonly consuetudoRunning = this.consuetudo.running;
  protected readonly consuetudoInProgress = this.consuetudo.inProgress;
  protected readonly consuetudoFinished = this.consuetudo.finished;
  protected readonly consuetudoMeta = this.consuetudo.stepMeta;
  protected readonly consuetudoAwarding = this.consuetudo.awarding;
  protected readonly notes = this.liveNotes.text;
  protected readonly notesOpen = this.liveNotes.open;

  protected routineName(): string {
    return (
      this.consuetudo.routine()?.name ||
      this.routines.find((r) => r.id === this.selectedRoutineId)?.name ||
      ''
    );
  }
  protected readonly statusLine = computed(() => {
    const phase = this.phase();
    const label = this.phaseLabel();
    if ((phase === 'work' || phase === 'rest') && !this.running()) {
      if (this.timer.awaitingContinue()) {
        return `${label} · waiting to start`;
      }
      return `${label} · paused`;
    }
    return label;
  });

  ngAfterViewInit(): void {
    this.htmlOverflow = document.documentElement.style.overflow;
    this.bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    this.playLoop();
    this.playAmbience();
  }

  ngOnDestroy(): void {
    this.ambience?.nativeElement.pause();
    document.documentElement.style.overflow = this.htmlOverflow;
    document.body.style.overflow = this.bodyOverflow;
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.blockEscape) {
      return;
    }
    if (this.soundOpen()) {
      this.soundOpen.set(false);
      return;
    }
    this.closed.emit();
  }

  protected playLoop(): void {
    void this.loop?.nativeElement.play().catch(() => undefined);
  }

  protected playAmbience(): void {
    const bed = this.ambience?.nativeElement;
    if (!bed) {
      return;
    }
    bed.volume = this.bedVolume() / 100;
    void bed.play().catch(() => undefined);
  }

  protected setBedVolume(raw: string | number): void {
    const value = Math.min(100, Math.max(0, Math.round(Number(raw) || 0)));
    this.bedVolume.set(value);
    const bed = this.ambience?.nativeElement;
    if (bed) {
      bed.volume = value / 100;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch {
      /* private mode */
    }
  }

  protected setGeneralVolume(raw: string | number): void {
    this.sound.setFeedbackVolume(raw);
    this.timer.applyJingleVolume();
  }

  protected begin(): void {
    this.started.emit();
  }

  protected pause(): void {
    if (this.setupKind === 'consuetudo') {
      this.consuetudo.pause();
      return;
    }
    if (this.setupKind === 'vigilia') {
      this.watches.pauseSolo();
      return;
    }
    this.timer.pause();
  }

  protected resume(): void {
    if (this.setupKind === 'consuetudo') {
      this.consuetudo.resume();
      return;
    }
    if (this.setupKind === 'vigilia') {
      this.watches.startSolo();
      return;
    }
    this.timer.resume();
  }

  protected stop(): void {
    this.stopped.emit();
  }

  protected skipRest(): void {
    this.timer.skipRest();
  }

  protected setSetupKind(kind: HorologiumSetupKind): void {
    if (!this.canEdit) {
      return;
    }
    this.setupKindChange.emit(kind);
  }

  protected selectPreset(id: string): void {
    if (!this.canEdit) {
      return;
    }
    const preset = this.presets().find((p) => p.id === id);
    if (!preset) {
      return;
    }
    this.timer.setMode('planned');
    this.setupKindChange.emit('planned');
    this.timer.presetId.set(id);
    this.timer.applyConfig(preset.config);
  }

  protected patchConfig(patch: Partial<HorologiumConfig>): void {
    if (!this.canEdit) {
      return;
    }
    this.timer.presetId.set(
      this.timer.mode() === 'adhoc' ? 'track' : 'custom',
    );
    this.timer.applyConfig({ ...this.timer.config(), ...patch });
  }

  protected setWork(minutes: number): void {
    this.patchConfig({ workMinutes: minutes });
  }

  protected setRest(minutes: number): void {
    this.patchConfig({ restMinutes: minutes });
  }

  protected setIterations(n: number): void {
    this.patchConfig({ iterations: n });
  }

  protected pickDaily(raw: string): void {
    if (!this.canEdit) {
      return;
    }
    this.dailyChange.emit(raw);
  }

  protected pickRoutine(raw: string): void {
    if (!this.canEdit) {
      return;
    }
    this.routineChange.emit(raw);
  }

  protected completeStep(): void {
    this.consuetudo.completeCurrent();
  }

  protected skipStep(): void {
    this.consuetudo.skipCurrent();
  }

  protected toggleSceneryNotes(): void {
    this.liveNotes.toggleOpen();
  }

  protected setLiveNotes(value: string): void {
    this.liveNotes.setText(value);
  }

  protected toggleWatchWidget(): void {
    this.watches.toggleWidget();
  }

  protected selectWatch(raw: string): void {
    if (!raw && this.watches.selectedId() != null && !this.canEdit) {
      return;
    }
    this.vigiliaBind.emit(raw);
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
    const work = this.scriptoriumWorks.find((w) => w.id === id);
    this.setupKindChange.emit('vigilia');
    this.watches.bindScriptorium(id, work?.title ?? '');
  }

  protected toggleWatch(): void {
    this.watches.toggleSolo();
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

  protected watchElapsed(id: number): string {
    const row = this.projectWatches().find((w) => w.id === id);
    return row ? this.watches.elapsedLabel(row) : '';
  }

  protected exit(): void {
    this.closed.emit();
  }

  protected toggleAmbienceMute(): void {
    this.timer.toggleAmbienceMute();
  }

  protected toggleJinglesMute(): void {
    this.timer.toggleJinglesMute();
  }

  protected toggleSoundPanel(): void {
    this.soundOpen.update((open) => !open);
  }

  protected pickScene(id: string): void {
    this.sceneChange.emit(id);
  }

  protected markTaskDone(): void {
    this.taskDone.emit();
  }

  protected openTaskFocus(): void {
    this.taskFocus.emit();
  }
}
