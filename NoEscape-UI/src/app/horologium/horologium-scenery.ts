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
import {
  HOROLOGIUM_PRESETS,
  HorologiumBoundDaily,
  HorologiumConfig,
  HorologiumSetupKind,
  horologiumBindKey,
} from './horologium.model';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-scenery.html',
  styleUrl: './horologium-scenery.css',
})
export class HorologiumSceneryOverlay implements AfterViewInit, OnDestroy {
  private readonly timer = inject(HorologiumTimerService);
  private readonly watches = inject(HorologiumWatchService);

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
  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly taskDone = new EventEmitter<void>();
  @Output() readonly started = new EventEmitter<void>();
  @Output() readonly stopped = new EventEmitter<void>();
  @Output() readonly sceneChange = new EventEmitter<string>();
  @Output() readonly dailyChange = new EventEmitter<string>();
  @Output() readonly setupKindChange = new EventEmitter<HorologiumSetupKind>();
  protected readonly bindKey = horologiumBindKey;
  @ViewChild('loop') private loop?: ElementRef<HTMLVideoElement>;
  @ViewChild('ambience') private ambience?: ElementRef<HTMLAudioElement>;
  protected readonly scenes = HOROLOGIUM_SCENERY;
  protected readonly presets = HOROLOGIUM_PRESETS;
  protected readonly soundOpen = signal(false);
  protected readonly bedVolume = signal(loadAmbienceVolume());
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
  protected readonly timerPreset = this.timer.presetId;
  protected readonly projectWatches = this.watches.watches;
  protected readonly selectedWatch = this.watches.selected;
  protected readonly selectedWatchId = this.watches.selectedId;
  protected readonly watchDraftName = this.watches.draftName;
  protected readonly watchElapsedLabel = this.watches.selectedElapsedLabel;
  protected readonly watchLinked = this.watches.pomodoroLinked;
  protected readonly watchRunning = this.watches.desiredRunning;
  protected readonly watchHint = this.watches.linkedHint;
  protected readonly statusLine = computed(() => {
    const phase = this.phase();
    const label = this.phaseLabel();
    if ((phase === 'work' || phase === 'rest') && !this.running()) {
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

  protected begin(): void {
    this.started.emit();
  }

  protected pause(): void {
    if (this.setupKind === 'vigilia') {
      this.watches.pauseSolo();
      return;
    }
    this.timer.pause();
  }

  protected resume(): void {
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
    const preset = this.presets.find((p) => p.id === id);
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

  protected setWork(raw: string): void {
    this.patchConfig({ workMinutes: Number(raw) });
  }

  protected setRest(raw: string): void {
    this.patchConfig({ restMinutes: Number(raw) });
  }

  protected setIterations(raw: string): void {
    this.patchConfig({ iterations: Number(raw) });
  }

  protected pickDaily(raw: string): void {
    if (!this.canEdit) {
      return;
    }
    this.dailyChange.emit(raw);
  }

  protected toggleWatchWidget(): void {
    this.watches.toggleWidget();
  }

  protected selectWatch(raw: string): void {
    const id = Number(raw);
    const next = Number.isFinite(id) && id > 0 ? id : null;
    if (next == null && this.watches.selectedId() != null && !this.canEdit) {
      return;
    }
    this.watches.select(next);
  }

  protected setWatchDraftName(raw: string): void {
    this.watches.draftName.set(raw);
  }

  protected createWatch(): void {
    this.watches.create();
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
}
