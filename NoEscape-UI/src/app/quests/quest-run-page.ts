import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE_URL } from '../core/api.config';
import { CharacterService } from '../character/character.service';
import { RuneCheck } from '../shared/rune-check';
import { RuneLoader } from '../shared/rune-loader';
import { formatElapsedShort } from '../shared/time';
import { TimedToast } from '../shared/timed-toast';
import { LogActivityResponse } from '../skills/skill.model';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { QuestView, chronicleKindLabel, deadlineLabel, deadlineTone, questCoverBg, weekdayLabel } from './quest.model';
import { QuestRevealService } from './quest-reveal.service';
import { QuestsService } from './quests.service';
import { DailiesService } from '../dailies/dailies.service';
import { WorkIntervalLog } from '../shared/work-interval-log';

@Component({
  selector: 'app-quest-run-page',
  imports: [RouterLink, RuneCheck, RuneLoader, WorkIntervalLog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-run-page.html',
  styleUrl: './quest-run-page.css',
  host: {
    '[style.background-image]': 'ready() ? coverBg() : null',
  },
})
export class QuestRunPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questsService = inject(QuestsService);
  private readonly reveal = inject(QuestRevealService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly character = inject(CharacterService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly dailiesService = inject(DailiesService);
  private readonly timed = new TimedToast();
  protected readonly addingToToday = signal<number | 'daily_work' | null>(null);

  protected readonly quest = signal<QuestView | null>(null);
  protected readonly loading = signal(true);
  protected readonly ready = signal(false);
  protected readonly showLoader = signal(false);
  protected readonly toast = this.timed.value;
  protected readonly logging = signal(false);
  protected readonly weekdayLabel = weekdayLabel;
  protected readonly chronicleKindLabel = chronicleKindLabel;

  protected dueLabel(iso: string | null | undefined): string {
    if (!iso) {
      return '';
    }
    return deadlineLabel(iso, this.character.formatDate(iso), this.character.todayIso());
  }

  protected dueTone(iso: string | null | undefined): 'overdue' | 'today' | 'soon' | '' {
    return deadlineTone(iso, this.character.todayIso());
  }
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
  private loaderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearLoaderTimer());
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
        if (res.completed) {
          this.xpFeedback.publishQuest({
            kind: 'completed',
            name: q.name,
            subtitle: 'Destination reached',
          });
        }
        for (const award of (res.awards ?? []) as LogActivityResponse[]) {
          this.xpFeedback.publishAward(award);
        }
        if (res.completed) {
          void this.character.getProfile().subscribe();
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

  /** Copy a subtask (or the daily-work slice when subtaskId is null) onto today's board. */
  protected addToToday(subtaskId: number | null): void {
    const q = this.quest();
    if (!q || this.addingToToday() != null) {
      return;
    }
    const key = subtaskId ?? 'daily_work';
    this.addingToToday.set(key);
    this.dailiesService
      .fromQuest({ questId: q.id, questSubtaskId: subtaskId })
      .subscribe({
        next: () => {
          this.addingToToday.set(null);
          this.timed.set('Added to today’s dailies');
        },
        error: (err: { error?: { message?: string } }) => {
          this.addingToToday.set(null);
          this.timed.set(err.error?.message ?? 'Could not add to today');
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
        this.xpFeedback.publishQuest({
          kind: 'completed',
          name: q.name,
          subtitle: 'Destination reached',
        });
        for (const award of (res.awards ?? []) as LogActivityResponse[]) {
          this.xpFeedback.publishAward(award);
        }
        this.timed.set(
          `Quest complete! ${res.unlocked?.join(', ') || 'Destination reached.'}`,
        );
        void this.character.getProfile().subscribe();
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
    this.logging.set(false);
    this.armLoader(seq);
    this.reveal.open(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ quest }) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.revealNow(quest);
        if (quest.availability !== 'active' && quest.run?.status !== 'ACTIVE') {
          void this.router.navigate(['/quests', quest.id], { replaceUrl: true });
        }
      },
      error: () => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.clearLoaderTimer();
        this.loading.set(false);
        this.showLoader.set(false);
        this.timed.set('Could not load quest run');
      },
    });
  }

  private armLoader(seq: number): void {
    this.clearLoaderTimer();
    this.ready.set(false);
    this.showLoader.set(false);
    this.loading.set(true);
    this.loaderTimer = setTimeout(() => {
      if (seq === this.loadSeq && !this.ready()) {
        this.showLoader.set(true);
      }
    }, 70);
  }

  private revealNow(quest: QuestView): void {
    this.clearLoaderTimer();
    this.quest.set(quest);
    this.ready.set(true);
    this.showLoader.set(false);
    this.loading.set(false);
  }

  private clearLoaderTimer(): void {
    if (this.loaderTimer != null) {
      clearTimeout(this.loaderTimer);
      this.loaderTimer = null;
    }
  }

  private todayIso(): string {
    return this.character.todayIso();
  }
}
