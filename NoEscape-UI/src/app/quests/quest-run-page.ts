import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import { LogActivityResponse } from '../skills/skill.model';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { QuestView } from './quest.model';
import { QuestsService } from './quests.service';

@Component({
  selector: 'app-quest-run-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-run-page.html',
  styleUrl: './quest-run-page.css',
})
export class QuestRunPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questsService = inject(QuestsService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly timed = new TimedToast();

  protected readonly quest = signal<QuestView | null>(null);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;
  protected readonly logging = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isFinite(id)) {
      this.loading.set(false);
      return;
    }
    this.load(id);
  }

  protected log(result: 'CLEAN' | 'BROKEN'): void {
    const q = this.quest();
    const run = q?.run;
    if (!run || run.status !== 'ACTIVE' || this.logging()) {
      return;
    }
    this.logging.set(true);
    this.questsService.logDay(run.id, result).subscribe({
      next: (res) => {
        this.quest.set(res.quest);
        this.logging.set(false);
        for (const award of (res.awards ?? []) as LogActivityResponse[]) {
          this.xpFeedback.publishAward(award);
        }
        if (res.completed) {
          this.timed.set(
            `Quest complete! ${res.unlocked?.join(', ') || 'Rewards granted.'}`,
          );
        } else if (result === 'CLEAN') {
          this.timed.set(
            `Clean day — streak ${res.streakCount} (+${res.xpAwarded} XP)`,
          );
        } else {
          this.timed.set('Broken — streak reset. Quest stays active.');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.logging.set(false);
        this.timed.set(err.error?.message ?? 'Log failed');
      },
    });
  }

  protected openBriefing(): void {
    const q = this.quest();
    if (q) {
      void this.router.navigate(['/quests', q.id]);
    }
  }

  private load(id: number): void {
    this.loading.set(true);
    this.questsService.getOne(id).subscribe({
      next: (q) => {
        this.quest.set(q);
        this.loading.set(false);
        if (q.availability !== 'active' && q.run?.status !== 'ACTIVE') {
          void this.router.navigate(['/quests', q.id], { replaceUrl: true });
        }
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load quest run');
      },
    });
  }
}
