import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, max, min, required } from '@angular/forms/signals';
import {
  DEFAULT_QUEST_TIMER_CONFIG,
  QUEST_TIMER_PRESETS,
  QuestTimerConfig,
} from './quest-timer.model';
import { QuestTimerService } from './quest-timer.service';

@Component({
  selector: 'app-quest-timer-page',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-timer-page.html',
  styleUrl: './quest-timer-page.css',
})
export class QuestTimerPage {
  private readonly timer = inject(QuestTimerService);

  protected readonly presets = QUEST_TIMER_PRESETS;
  protected readonly selectedPresetId = signal<string | 'custom'>('classic');

  protected readonly draft = signal<QuestTimerConfig>({
    ...DEFAULT_QUEST_TIMER_CONFIG,
  });
  protected readonly draftForm = form(this.draft, (p) => {
    required(p.workMinutes);
    min(p.workMinutes, 1);
    max(p.workMinutes, 180);
    required(p.restMinutes);
    min(p.restMinutes, 1);
    max(p.restMinutes, 60);
    required(p.iterations);
    min(p.iterations, 1);
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

  protected readonly isActive = computed(() => {
    const p = this.phase();
    return p === 'work' || p === 'rest';
  });

  protected readonly canEdit = computed(
    () => !this.isActive() && this.phase() !== 'complete',
  );

  protected readonly ringStyle = computed(() => {
    const pct = this.progressPercent();
    const color =
      this.phase() === 'rest'
        ? '#6ea8d8'
        : this.phase() === 'work'
          ? '#d4a84b'
          : '#8a7340';
    return {
      background: `conic-gradient(${color} ${pct}%, #1a1610 ${pct}%)`,
    };
  });

  protected selectPreset(id: string): void {
    if (!this.canEdit()) {
      return;
    }
    const preset = this.presets.find((p) => p.id === id);
    if (!preset) {
      return;
    }
    this.selectedPresetId.set(id);
    this.draft.set({ ...preset.config });
    this.timer.applyConfig(preset.config);
  }

  protected enableCustom(): void {
    if (!this.canEdit()) {
      return;
    }
    this.selectedPresetId.set('custom');
  }

  protected syncCustom(): void {
    if (!this.canEdit()) {
      return;
    }
    this.selectedPresetId.set('custom');
    this.timer.applyConfig(this.draft());
  }

  protected setRestAfterLast(value: boolean): void {
    if (!this.canEdit()) {
      return;
    }
    this.selectedPresetId.set('custom');
    this.draft.update((d) => ({ ...d, restAfterLast: value }));
    this.timer.applyConfig({ ...this.draft(), restAfterLast: value });
  }

  protected start(): void {
    const config = this.sanitizeDraft();
    this.timer.startSession(config);
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

  private sanitizeDraft(): QuestTimerConfig {
    const d = this.draft();
    return {
      workMinutes: Math.min(180, Math.max(1, Number(d.workMinutes) || 1)),
      restMinutes: Math.min(60, Math.max(1, Number(d.restMinutes) || 1)),
      iterations: Math.min(20, Math.max(1, Math.round(Number(d.iterations) || 1))),
      restAfterLast: Boolean(d.restAfterLast),
    };
  }
}
