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
import { TimedToast } from '../shared/timed-toast';

type VigiliaFlag =
  | 'vigiliaTrackQuests'
  | 'vigiliaTrackDailies'
  | 'vigiliaTrackScriptorium'
  | 'vigiliaTrackCustom';

@Component({
  selector: 'app-settings-vigilia-page',
  imports: [RuneCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-vigilia-page.html',
  styleUrl: './settings-pomodoro-page.css',
})
export class SettingsVigiliaPage implements OnInit {
  private readonly character = inject(CharacterService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly saving = signal<VigiliaFlag | null>(null);

  protected readonly trackQuests = this.character.vigiliaTrackQuests;
  protected readonly trackDailies = this.character.vigiliaTrackDailies;
  protected readonly trackScriptorium = this.character.vigiliaTrackScriptorium;
  protected readonly trackCustom = this.character.vigiliaTrackCustom;
  protected readonly vigiliaEnabled = this.character.vigiliaEnabled;

  ngOnInit(): void {
    this.character.getProfile().subscribe({
      error: () => this.timed.set('Could not load Vigilia settings'),
    });
  }

  protected toggle(flag: VigiliaFlag, checked: boolean): void {
    const current = this.character[flag]();
    if (current === checked || this.saving()) {
      return;
    }
    this.saving.set(flag);
    this.character[flag].set(checked);
    this.character.updateSettings({ [flag]: checked }).subscribe({
      next: () => {
        this.saving.set(null);
        this.timed.set(checked ? 'Enabled' : 'Disabled');
        this.cdr.markForCheck();
      },
      error: (err: { error?: { message?: string } }) => {
        this.character[flag].set(current);
        this.saving.set(null);
        this.timed.set(err.error?.message ?? 'Could not save Vigilia settings');
        this.cdr.markForCheck();
      },
    });
    this.cdr.markForCheck();
  }
}
