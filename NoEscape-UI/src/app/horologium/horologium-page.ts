import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, max, min, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { HorologiumApiService } from './horologium-api.service';
import { HorologiumTimerService } from './horologium-timer.service';
import {
  DEFAULT_HOROLOGIUM_CONFIG,
  HOROLOGIUM_PRESETS,
  HorologiumConfig,
  HorologiumMode,
  HorologiumSessionRecord,
  HorologiumXpPreview,
} from './horologium.model';

@Component({
  selector: 'app-horologium-page',
  imports: [DecimalPipe, FormField, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-page.html',
  styleUrl: './horologium-page.css',
})
export class HorologiumPage implements OnInit {
  private readonly timer = inject(HorologiumTimerService);
  private readonly api = inject(HorologiumApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly presets = HOROLOGIUM_PRESETS;
  protected readonly selectedPresetId = signal<string | 'custom' | 'track'>(
    'classic',
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
  protected readonly muted = this.timer.muted;
  protected readonly currentIteration = this.timer.currentIteration;
  protected readonly activeConfig = this.timer.config;
  protected readonly awarding = this.timer.awarding;
  protected readonly toast = this.timer.lastToast;
  protected readonly mode = this.timer.mode;

  protected readonly sessions = signal<HorologiumSessionRecord[]>([]);
  protected readonly preview = signal<HorologiumXpPreview | null>(null);

  protected readonly isActive = computed(() => {
    const p = this.phase();
    return p === 'work' || p === 'rest';
  });

  protected readonly canEdit = computed(
    () => !this.isActive() && this.phase() !== 'complete',
  );

  protected readonly isTrack = computed(() => this.mode() === 'adhoc');

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
    // Sessions reload via sessionsVersion effect — avoid a duplicate fetch.
    this.refreshPreview();
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

  protected setRestAfterLast(value: boolean): void {
    if (!this.canEdit() || this.mode() === 'adhoc') {
      return;
    }
    this.selectedPresetId.set('custom');
    this.timer.presetId.set('custom');
    this.draft.update((d) => ({ ...d, restAfterLast: value }));
    this.timer.applyConfig({ ...this.draft(), restAfterLast: value });
  }

  protected start(): void {
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
  }

  protected pause(): void {
    this.timer.pause();
  }

  protected resume(): void {
    this.timer.resume();
  }

  protected skip(): void {
    this.timer.skip();
  }

  protected reset(): void {
    this.timer.reset();
  }

  protected toggleMute(): void {
    this.timer.toggleMute();
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
      restAfterLast: Boolean(d.restAfterLast),
    };
  }
}
