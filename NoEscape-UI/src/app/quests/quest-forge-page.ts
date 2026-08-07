import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { TimedToast } from '../shared/timed-toast';
import { QuestsService } from './quests.service';

@Component({
  selector: 'app-quest-forge-page',
  imports: [RouterLink, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-forge-page.html',
  styleUrl: './quest-forge-page.css',
})
export class QuestForgePage {
  private readonly questsService = inject(QuestsService);
  private readonly router = inject(Router);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly creating = signal(false);

  protected readonly createModel = signal({
    name: '',
    summary: '',
    description: '',
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
  });

  protected createQuest(): void {
    void submit(this.createForm, async () => {
      const m = this.createModel();
      this.creating.set(true);
      this.questsService
        .create({
          name: m.name.trim(),
          summary: m.summary.trim() || undefined,
          description: m.description.trim() || undefined,
        })
        .subscribe({
          next: (q) => {
            this.creating.set(false);
            void this.router.navigate(['/quests', q.id]);
          },
          error: (err: { error?: { message?: string } }) => {
            this.creating.set(false);
            this.timed.set(err.error?.message ?? 'Create failed');
          },
        });
    });
  }
}
