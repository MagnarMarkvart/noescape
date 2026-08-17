import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE_URL } from '../core/api.config';
import { CharacterService } from '../character/character.service';
import { formatElapsedShort } from '../shared/time';
import { TimedToast } from '../shared/timed-toast';
import { LogActivityResponse } from '../skills/skill.model';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { QuestView, chronicleKindLabel, questCoverBg, weekdayLabel } from './quest.model';
import { QuestsService } from './quests.service';

@Component({
  selector: 'app-quest-run-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-run-page.html',
  styleUrl: './quest-run-page.css',
  host: {
    '[style.background-image]': 'coverBg()',
  },
})
export class QuestRunPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questsService = inject(QuestsService);
  private readonly character = inject(CharacterService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly timed = new TimedToast();

  protected readonly quest = signal<QuestView | null>(null);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;
  protected readonly logging = signal(false);
  protected readonly weekdayLabel = weekdayLabel;
  protected readonly chronicleKindLabel = chronicleKindLabel;
  protected readonly coverBg = computed(() =>
    questCoverBg(this.quest()?.coverUrl ?? null, API_BASE_URL),
  );
  protected readonly lockedGates = computed(() =>
    (this.quest()?.subtasks ?? []).filter((s) => s.gatesJourney && !s.completed),
  );

  protected readonly loggedToday = computed(() => {
    const q = this.quest();
    const today = this.todayIso();
    if (!q?.run) {
      return false;
    }
    if (q.kind === 'STREAK_LOG') {
      return q.run.lastLogDate === today;
    }
    return q.run.journeyLogs.some((l) => l.date === today);
  });

  private loadSeq = 0;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id)) {
        this.loading.set(false);
        return;
      }
      this.load(id);
    });
  }

  protected elapsedLabel(ms: number | null | undefined): string {
    if (!ms) {
      return '';
    }
    return formatElapsedShort(ms);
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

  protected logJourney(done = true): void {
    const q = this.quest();
    const run = q?.run;
    if (!run || run.status !== 'ACTIVE' || this.logging()) {
      return;
    }
    this.logging.set(true);
    this.questsService.logJourney(run.id, { done }).subscribe({
      next: (res) => {
        this.quest.set(res.quest);
        this.logging.set(false);
        this.timed.set(
          res.logged
            ? 'Journey logged for today.'
            : 'Today’s journey mark removed.',
        );
      },
      error: (err: { error?: { message?: string } }) => {
        this.logging.set(false);
        this.timed.set(err.error?.message ?? 'Could not log journey');
      },
    });
  }

  protected toggleSubtask(subtaskId: number, completed: boolean): void {
    const q = this.quest();
    const run = q?.run;
    if (!run || run.status !== 'ACTIVE' || this.logging()) {
      return;
    }
    this.logging.set(true);
    this.questsService.toggleSubtask(run.id, subtaskId, completed).subscribe({
      next: (quest) => {
        this.quest.set(quest);
        this.logging.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.logging.set(false);
        this.timed.set(err.error?.message ?? 'Could not update subtask');
      },
    });
  }

  protected completeDestination(): void {
    const q = this.quest();
    const run = q?.run;
    if (!run || run.status !== 'ACTIVE' || this.logging()) {
      return;
    }
    this.logging.set(true);
    this.questsService.completeDestination(run.id).subscribe({
      next: (res) => {
        this.quest.set(res.quest);
        this.logging.set(false);
        for (const award of (res.awards ?? []) as LogActivityResponse[]) {
          this.xpFeedback.publishAward(award);
        }
        this.timed.set(
          `Quest complete! ${res.unlocked?.join(', ') || 'Destination reached.'}`,
        );
      },
      error: (err: { error?: { message?: string } }) => {
        this.logging.set(false);
        this.timed.set(err.error?.message ?? 'Could not complete destination');
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
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.logging.set(false);
    this.questsService.getOne(id).subscribe({
      next: (q) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.quest.set(q);
        this.loading.set(false);
        if (q.availability !== 'active' && q.run?.status !== 'ACTIVE') {
          void this.router.navigate(['/quests', q.id], { replaceUrl: true });
        }
      },
      error: () => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.loading.set(false);
        this.timed.set('Could not load quest run');
      },
    });
  }

  private todayIso(): string {
    return this.character.todayIso();
  }
}
