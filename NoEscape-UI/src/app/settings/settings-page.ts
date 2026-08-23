import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CharacterService } from '../character/character.service';
import { RuneCheck } from '../shared/rune-check';
import { SoundSettingsService } from '../shared/sound-settings.service';
import { TimedToast } from '../shared/timed-toast';
import { WeekStart } from '../shared/time';
import {
  CURRENCY_OPTIONS,
  CurrencyId,
  DEFAULT_CURRENCY,
} from '../shared/money';

@Component({
  selector: 'app-settings-page',
  imports: [RuneCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
})
export class SettingsPage implements OnInit {
  private readonly character = inject(CharacterService);
  private readonly sound = inject(SoundSettingsService);
  private readonly timed = new TimedToast();
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly nickname = signal('');
  protected readonly weekStartsOn = signal<WeekStart>(1);
  protected readonly menuAutoToggleMobile = signal(true);
  protected readonly menuAutoToggleDesktop = signal(true);
  protected readonly consuetudoStartInScenery = signal(true);
  protected readonly currency = signal<CurrencyId>(DEFAULT_CURRENCY);
  protected readonly xpSoundsEnabled = this.sound.feedbackEnabled;
  protected readonly xpSoundVolume = this.sound.feedbackVolume;
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;
  protected readonly currencies = CURRENCY_OPTIONS;

  ngOnInit(): void {
    this.character.getProfile().subscribe({
      next: (p) => {
        this.nickname.set(p.nickname || '');
        this.weekStartsOn.set(p.weekStartsOn === 0 ? 0 : 1);
        this.menuAutoToggleMobile.set(p.menuAutoToggleMobile !== false);
        this.menuAutoToggleDesktop.set(p.menuAutoToggleDesktop !== false);
        this.consuetudoStartInScenery.set(p.consuetudoStartInScenery !== false);
        this.currency.set(p.currency || DEFAULT_CURRENCY);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load settings');
      },
    });
  }

  protected setNickname(event: Event): void {
    this.nickname.set((event.target as HTMLInputElement).value);
  }

  protected setWeekStart(start: WeekStart, checked: boolean): void {
    if (checked) {
      this.weekStartsOn.set(start);
    }
    this.cdr.markForCheck();
  }

  protected setCurrency(id: CurrencyId, checked: boolean): void {
    if (checked) {
      this.currency.set(id);
    }
    this.cdr.markForCheck();
  }

  protected setMenuAutoToggleMobile(checked: boolean): void {
    this.menuAutoToggleMobile.set(checked);
    this.character.menuAutoToggleMobile.set(checked);
  }

  protected setMenuAutoToggleDesktop(checked: boolean): void {
    this.menuAutoToggleDesktop.set(checked);
    this.character.menuAutoToggleDesktop.set(checked);
  }

  protected setConsuetudoStartInScenery(value: boolean, checked: boolean): void {
    if (!checked) {
      this.cdr.markForCheck();
      return;
    }
    this.consuetudoStartInScenery.set(value);
    this.character.consuetudoStartInScenery.set(value);
    this.character.updateSettings({ consuetudoStartInScenery: value }).subscribe({
      error: () => this.timed.set('Could not save Consuetudo start view'),
    });
    this.cdr.markForCheck();
  }

  protected setXpSoundsEnabled(checked: boolean): void {
    this.sound.setFeedbackEnabled(checked);
  }

  protected setXpSoundVolume(raw: string): void {
    this.sound.setFeedbackVolume(raw);
  }

  protected save(): void {
    this.saving.set(true);
    this.character
      .updateSettings({
        nickname: this.nickname().trim(),
        weekStartsOn: this.weekStartsOn(),
        menuAutoToggleMobile: this.menuAutoToggleMobile(),
        menuAutoToggleDesktop: this.menuAutoToggleDesktop(),
        consuetudoStartInScenery: this.consuetudoStartInScenery(),
        currency: this.currency(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.timed.set('Settings saved');
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.timed.set(err.error?.message ?? 'Could not save settings');
        },
      });
  }
}
