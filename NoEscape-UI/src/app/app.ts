import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppSidebar } from './shared/app-sidebar';
import { XpFeedback } from './xp-feedback/xp-feedback';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppSidebar, XpFeedback],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
