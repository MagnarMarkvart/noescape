import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ClockSyncService } from './clocks/clock-sync.service';
import { CharacterService } from './character/character.service';
import { HorologiumTaskClockService } from './horologium/horologium-task-clock.service';
import { HorologiumWatchService } from './horologium/horologium-watch.service';
import { AppSidebar } from './shared/app-sidebar';
import { XpFeedback } from './xp-feedback/xp-feedback';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppSidebar, XpFeedback],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** Keep Horologium clocks alive across routes. */
  private readonly clocks = inject(ClockSyncService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly taskClock = inject(HorologiumTaskClockService);
  private readonly character = inject(CharacterService);

  constructor() {
    void this.clocks;
    void this.watches;
    void this.taskClock;
    void this.character.getProfile().subscribe();
  }
}
