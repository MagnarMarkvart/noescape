import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CharacterService } from '../character/character.service';
import { RuneCheck } from '../shared/rune-check';
import { TimedToast } from '../shared/timed-toast';
import {
  civilDateInZone,
  DATE_FORMAT_OPTIONS,
  DateFormatId,
  dayStartHourLabel,
  formatIsoDate,
  isValidTimeZone,
  shiftIsoDays,
  TIME_FORMAT_OPTIONS,
  TimeFormatId,
} from '../shared/time';

@Component({
  selector: 'app-settings-time-page',
  imports: [RuneCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-time-page.html',
  styleUrl: './settings-page.css',
})
export class SettingsTimePage implements OnInit {
  private readonly character = inject(CharacterService);
  private readonly timed = new TimedToast();
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly timezone = signal('Europe/Tallinn');
  protected readonly dateFormat = signal<DateFormatId>('DMY');
  protected readonly timeFormat = signal<TimeFormatId>('H24');
  protected readonly dayStartHour = signal(0);
  protected readonly zones = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;
  protected readonly dateFormats = DATE_FORMAT_OPTIONS;
  protected readonly timeFormats = TIME_FORMAT_OPTIONS;
  protected readonly dayHours = Array.from({ length: 24 }, (_, hour) => hour);

  protected readonly todayPreview = computed(() =>
    civilDateInZone(this.timezone(), this.dayStartHour()),
  );

  protected readonly exampleHint = computed(() => {
    const start = this.dayStartHour();
    const fmt = this.dateFormat();
    const clock = this.timeFormat();
    const today = this.todayPreview();
    if (start <= 0) {
      return `The log day follows midnight. Right now that is ${formatIsoDate(today, fmt)}.`;
    }
    const prior = shiftIsoDays(today, -1);
    const begin = dayStartHourLabel(start, clock);
    const early = dayStartHourLabel(start - 1, clock);
    return `A mark at ${early} files under ${formatIsoDate(prior, fmt)}. The day begins at ${begin} (${formatIsoDate(today, fmt)}).`;
  });

  ngOnInit(): void {
    this.zones.set(this.listZones());
    this.character.getProfile().subscribe({
      next: (p) => {
        this.timezone.set(p.timezone || 'Europe/Tallinn');
        this.dateFormat.set(p.dateFormat || 'DMY');
        this.timeFormat.set(p.timeFormat || 'H24');
        this.dayStartHour.set(
          Number.isInteger(p.dayStartHour) ? p.dayStartHour : 0,
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load time settings');
      },
    });
  }

  protected setTimezone(event: Event): void {
    this.timezone.set((event.target as HTMLSelectElement).value);
  }

  protected setDayStartHour(event: Event): void {
    const hour = Number((event.target as HTMLSelectElement).value);
    this.dayStartHour.set(Number.isInteger(hour) ? hour : 0);
  }

  protected setDateFormat(id: DateFormatId, checked: boolean): void {
    if (checked) {
      this.dateFormat.set(id);
    }
    this.cdr.markForCheck();
  }

  protected setTimeFormat(id: TimeFormatId, checked: boolean): void {
    if (checked) {
      this.timeFormat.set(id);
    }
    this.cdr.markForCheck();
  }

  protected hourLabel(hour: number): string {
    return dayStartHourLabel(hour, this.timeFormat());
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
        timezone: tz,
        dateFormat: this.dateFormat(),
        timeFormat: this.timeFormat(),
        dayStartHour: this.dayStartHour(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.timed.set('Time settings saved');
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.timed.set(err.error?.message ?? 'Could not save time settings');
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
