import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CharacterService } from '../character/character.service';
import { TimedToast } from '../shared/timed-toast';
import { isValidTimeZone } from '../shared/time';

@Component({
  selector: 'app-settings-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
})
export class SettingsPage implements OnInit {
  private readonly character = inject(CharacterService);
  private readonly timed = new TimedToast();

  protected readonly nickname = signal('');
  protected readonly timezone = signal('Europe/Tallinn');
  protected readonly zones = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;

  ngOnInit(): void {
    this.zones.set(this.listZones());
    this.character.getProfile().subscribe({
      next: (p) => {
        this.nickname.set(p.nickname || '');
        this.timezone.set(p.timezone || 'Europe/Tallinn');
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
