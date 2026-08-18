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
import {
  DATE_FORMAT_OPTIONS,
  DateFormatId,
  isValidTimeZone,
  WeekStart,
} from '../shared/time';
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
  protected readonly timezone = signal('Europe/Tallinn');
  protected readonly dateFormat = signal<DateFormatId>('DMY');
  protected readonly weekStartsOn = signal<WeekStart>(1);
  protected readonly menuAutoToggleMobile = signal(true);
  protected readonly menuAutoToggleDesktop = signal(true);
  protected readonly currency = signal<CurrencyId>(DEFAULT_CURRENCY);
  protected readonly xpSoundsEnabled = this.sound.feedbackEnabled;
  protected readonly xpSoundVolume = this.sound.feedbackVolume;
  protected readonly zones = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;
  protected readonly dateFormats = DATE_FORMAT_OPTIONS;
  protected readonly currencies = CURRENCY_OPTIONS;

  ngOnInit(): void {
    this.zones.set(this.listZones());
    this.character.getProfile().subscribe({
      next: (p) => {
        this.nickname.set(p.nickname || '');
        this.timezone.set(p.timezone || 'Europe/Tallinn');
        this.dateFormat.set(p.dateFormat || 'DMY');
        this.weekStartsOn.set(p.weekStartsOn === 0 ? 0 : 1);
        this.menuAutoToggleMobile.set(p.menuAutoToggleMobile !== false);
        this.menuAutoToggleDesktop.set(p.menuAutoToggleDesktop !== false);
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

  protected setTimezone(event: Event): void {
    this.timezone.set((event.target as HTMLSelectElement).value);
  }

  protected setDateFormat(id: DateFormatId, checked: boolean): void {
    if (checked) {
      this.dateFormat.set(id);
    }
    this.cdr.markForCheck();
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

  protected setXpSoundsEnabled(checked: boolean): void {
    this.sound.setFeedbackEnabled(checked);
  }

  protected setXpSoundVolume(raw: string): void {
    this.sound.setFeedbackVolume(raw);
  }

  protected save(): void {
    const tz = this.timezone().trim();
    if (!isValidTimeZone(tz)) {
      this.timed.set('Pick a valid timezone');
      return;
    }
    this.saving.set(true);
    this.character
      .updateSettings({
        nickname: this.nickname().trim(),
        timezone: tz,
        dateFormat: this.dateFormat(),
        weekStartsOn: this.weekStartsOn(),
        menuAutoToggleMobile: this.menuAutoToggleMobile(),
        menuAutoToggleDesktop: this.menuAutoToggleDesktop(),
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

  private listZones(): string[] {
    const supported =
      typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
        ? Intl.supportedValuesOf('timeZone')
        : ['Europe/Tallinn', 'UTC'];
    const preferred = [
      'Europe/Tallinn',
      'Europe/Helsinki',
      'Europe/Riga',
      'Europe/Vilnius',
      'Europe/London',
      'UTC',
    ];
    const rest = supported.filter((z) => !preferred.includes(z));
    return [...preferred.filter((z) => supported.includes(z)), ...rest];
  }
}
