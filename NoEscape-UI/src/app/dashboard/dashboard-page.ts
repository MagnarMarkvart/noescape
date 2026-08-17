import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CharacterService } from '../character/character.service';
import { DailyBoard, DailyTaskSlot } from '../dailies/daily.model';
import { DailiesService } from '../dailies/dailies.service';
import { HabitsService, HabitView } from '../habits/habits.service';
import { HorologiumTimerService } from '../horologium/horologium-timer.service';
import { HorologiumWatchService } from '../horologium/horologium-watch.service';
import { QuestSubtaskView, QuestView } from '../quests/quest.model';
import { QuestsService } from '../quests/quests.service';
import { formatElapsedShort } from '../shared/time';
import { TimedToast } from '../shared/timed-toast';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';

@Component({
  selector: 'app-dashboard-page',
  imports: [DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage implements OnInit {
  private readonly skillsService = inject(SkillsService);
  private readonly dailiesService = inject(DailiesService);
  private readonly habitsService = inject(HabitsService);
  private readonly questsService = inject(QuestsService);
  private readonly characterService = inject(CharacterService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly timer = inject(HorologiumTimerService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly timed = new TimedToast();

  protected readonly tree = signal<SkillTree | null>(null);
  protected readonly habits = signal<HabitView[]>([]);
  protected readonly board = signal<DailyBoard | null>(null);
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly habitusUnlocked = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly busyHabitId = signal<number | null>(null);
  protected readonly busyDailyId = signal<number | null>(null);
  protected readonly busyQuestKey = signal<string | null>(null);

  protected readonly remainingLabel = this.timer.remainingLabel;
  protected readonly phaseLabel = this.timer.phaseLabel;
  protected readonly sessionLabel = this.timer.sessionLabel;
  protected readonly progressPercent = this.timer.progressPercent;
  protected readonly running = this.timer.running;
  protected readonly phase = this.timer.phase;
  protected readonly taskLabel = this.timer.taskLabel;
  protected readonly watchElapsed = this.watches.selectedElapsedLabel;
  protected readonly watchRunning = this.watches.desiredRunning;
  protected readonly selectedWatch = this.watches.selected;

  private readonly ringCircumference = 2 * Math.PI * 42;

  protected readonly todayIso = this.characterService.todayIso;

  protected readonly totalLevel = computed(() => this.tree()?.totalLevel ?? 0);

  protected readonly todayDailies = computed(() => {
    const board = this.board();
    if (!board || board.date !== this.todayIso()) {
      return [] as DailyTaskSlot[];
    }
    return board.tiers.flatMap((tier) =>
      tier.slots.filter((slot) => slot.isFilled && slot.id != null),
    );
  });

  protected readonly todayQuests = computed(() =>
    this.quests().filter((q) => q.availability === 'active'),
  );

  protected readonly clockLive = computed(() => {
    const phase = this.phase();
    if (phase === 'work' || phase === 'rest' || phase === 'complete') {
      return true;
    }
    return this.watchRunning();
  });

  protected readonly clockTime = computed(() => {
    const phase = this.phase();
    if (phase === 'work' || phase === 'rest') {
      return this.remainingLabel();
    }
    if (phase === 'complete') {
      return 'Done';
    }
    if (this.watchRunning()) {
      return this.watchElapsed();
    }
    const work = this.timer.config().workMinutes;
    return `${String(work).padStart(2, '0')}:00`;
  });

  protected readonly clockCaption = computed(() => {
    const phase = this.phase();
    if (phase === 'work' || phase === 'rest') {
      return this.running() ? this.phaseLabel() : 'Paused';
    }
    if (phase === 'complete') {
      return this.sessionLabel();
    }
    if (this.watchRunning()) {
      return this.selectedWatch()?.name || 'Vigilia';
    }
    return 'Ready';
  });

  protected readonly ringDashOffset = computed(() => {
    const live = this.phase() === 'work' || this.phase() === 'rest';
    const pct = live ? Math.min(100, Math.max(0, this.progressPercent())) : 0;
    return this.ringCircumference * (1 - pct / 100);
  });

  ngOnInit(): void {
    const cached = this.skillsService.peekTree();
    if (cached) {
      this.tree.set(cached);
    }
    this.reload();
  }

  protected elapsedLabel(ms: number | null | undefined): string {
    return formatElapsedShort(ms ?? 0);
  }

  protected habitDoneToday(habit: HabitView): boolean {
    return habit.recentDates.includes(this.todayIso());
  }

  protected todayTasks(quest: QuestView): QuestSubtaskView[] {
    const open = (quest.subtasks ?? []).filter((s) => !s.completed);
    if (quest.journeyDueToday) {
      return open;
    }
    return open.filter((s) => s.gatesJourney);
  }

  protected skillTip(skill: Skill): string {
    if (skill.level >= skill.maxLevel) {
      return `${skill.name} · Lv ${skill.level} · Max`;
    }
    return `${skill.name} · Lv ${skill.level} · ${skill.progress.percent}% · ${skill.xpToNext} XP to next`;
  }

  protected completeHabit(habit: HabitView): void {
    if (this.habitDoneToday(habit) || this.busyHabitId()) {
      return;
    }
    this.busyHabitId.set(habit.id);
    this.habitsService.complete(habit.id, this.todayIso()).subscribe({
      next: () => {
        this.busyHabitId.set(null);
        this.timed.set(`Logged ${habit.name}`);
        this.reloadHabits();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyHabitId.set(null);
        this.timed.set(err.error?.message ?? 'Could not log habit');
      },
    });
  }

  protected completeDaily(slot: DailyTaskSlot): void {
    if (!slot.id || slot.completed || this.busyDailyId()) {
      return;
    }
    this.busyDailyId.set(slot.id);
    this.dailiesService.complete(slot.id).subscribe({
      next: (result) => {
        this.busyDailyId.set(null);
        this.skillsService.invalidateTree();
        this.xpFeedback.publishAward(result.award);
        this.reloadBoard();
        this.reloadTree();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.busyDailyId.set(null);
        this.timed.set(this.readError(err, 'Could not complete daily'));
      },
    });
  }

  protected completeSubtask(quest: QuestView, task: QuestSubtaskView): void {
    const runId = quest.run?.id;
    if (!runId || this.busyQuestKey()) {
      return;
    }
    this.busyQuestKey.set(`t:${task.id}`);
    this.questsService.toggleSubtask(runId, task.id, true).subscribe({
      next: (updated) => {
        this.busyQuestKey.set(null);
        this.patchQuest(updated);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyQuestKey.set(null);
        this.timed.set(err.error?.message ?? 'Could not complete task');
      },
    });
  }

  protected logJourney(quest: QuestView): void {
    const runId = quest.run?.id;
    if (!runId || !quest.canLogJourney || this.busyQuestKey()) {
      return;
    }
    this.busyQuestKey.set(`j:${runId}`);
    this.questsService.logJourney(runId, { done: true }).subscribe({
      next: (res) => {
        this.busyQuestKey.set(null);
        this.patchQuest(res.quest);
        this.timed.set('Journey logged for today.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyQuestKey.set(null);
        this.timed.set(err.error?.message ?? 'Could not log journey');
      },
    });
  }

  private patchQuest(updated: QuestView): void {
    this.quests.update((rows) =>
      rows.map((q) => (q.id === updated.id ? updated : q)),
    );
    void this.questsService.refreshActive().subscribe();
  }

  private reload(): void {
    this.loading.set(true);
    forkJoin({
      tree: this.skillsService.getTree(),
      board: this.dailiesService.getBoard(this.todayIso(), true),
      quests: this.questsService.list('active'),
      habits: this.habitsService.list().pipe(catchError(() => of([] as HabitView[]))),
      profile: this.characterService.getProfile().pipe(
        catchError(() => of(null)),
      ),
    }).subscribe({
      next: ({ tree, board, quests, habits, profile }) => {
        this.tree.set(tree);
        this.board.set(board);
        this.quests.set(quests);
        this.habits.set(habits.filter((h) => h.active && !h.archived));
        this.habitusUnlocked.set(Boolean(profile?.habitusUnlocked));
        this.loading.set(false);
        this.error.set(null);
        void this.questsService.refreshActive().subscribe();
      },
      error: () => {
        this.loading.set(false);
        if (!this.tree()) {
          this.error.set('Could not reach the server. Is the backend running?');
        }
      },
    });
  }

  private reloadHabits(): void {
    this.habitsService.list().subscribe({
      next: (rows) => this.habits.set(rows.filter((h) => h.active && !h.archived)),
      error: () => {
        /* keep prior list */
      },
    });
  }

  private reloadBoard(): void {
    this.dailiesService.getBoard(this.todayIso(), true).subscribe({
      next: (board) => this.board.set(board),
      error: () => {
        /* keep prior board */
      },
    });
  }

  private reloadTree(): void {
    this.skillsService.getTree(true).subscribe({
      next: (tree) => this.tree.set(tree),
      error: () => {
        /* keep prior tree */
      },
    });
  }

  private readError(
    err: { error?: { message?: string | string[] } },
    fallback: string,
  ): string {
    const message = err.error?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    return message ?? fallback;
  }
}
