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
import { ConsuetudoClockService } from '../horologium/consuetudo-clock.service';
import { DailyBoard, DailyTaskSlot, dailySkillLine } from '../dailies/daily.model';
import { DailiesService } from '../dailies/dailies.service';
import { QuickTaskPanel } from '../dailies/quick-task-panel';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { HabitsService, HabitView } from '../habits/habits.service';
import { HabitCard } from '../habits/habit-card';
import { HorologiumTimerService } from '../horologium/horologium-timer.service';
import { HorologiumWatchService } from '../horologium/horologium-watch.service';
import { LevelUpLogItem } from '../level-ups/level-ups.model';
import { QuestView } from '../quests/quest.model';
import { QuestsService } from '../quests/quests.service';
import { formatElapsedShort } from '../shared/time';
import { TimedToast } from '../shared/timed-toast';
import { SkillsService } from '../skills/skills.service';
import { ScriptoriumService } from '../scriptorium/scriptorium.service';
import {
  durationLabel,
  ScriptoriumDueView,
  SCRIPTORIUM_TIERS,
} from '../scriptorium/scriptorium.model';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';

type LiveKind = 'sessio' | 'track' | 'consuetudo' | 'vigilia';

@Component({
  selector: 'app-dashboard-page',
  imports: [DecimalPipe, RouterLink, QuickTaskPanel, UiIconBtn, HabitCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
})
export class DashboardPage implements OnInit {
  private readonly skillsService = inject(SkillsService);
  private readonly dailiesService = inject(DailiesService);
  private readonly habitsService = inject(HabitsService);
  private readonly questsService = inject(QuestsService);
  private readonly scriptoriumApi = inject(ScriptoriumService);
  private readonly characterService = inject(CharacterService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly timer = inject(HorologiumTimerService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly consuetudo = inject(ConsuetudoClockService);
  private readonly timed = new TimedToast();

  protected readonly habits = signal<HabitView[]>([]);
  protected readonly board = signal<DailyBoard | null>(null);
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly dueWorks = signal<ScriptoriumDueView[]>([]);
  protected readonly levelLogs = signal<LevelUpLogItem[]>([]);
  protected readonly totalLevel = signal(0);
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
  protected readonly selectedWatch = this.watches.selected;

  private readonly ringCircumference = 2 * Math.PI * 42;

  protected readonly todayIso = this.characterService.todayIso;
  protected readonly durationLabel = durationLabel;
  protected readonly wealthLabel = this.characterService.wealthLabel;

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

  protected readonly liveKind = computed((): LiveKind | null => {
    if (this.consuetudo.inProgress() && !this.consuetudo.finished()) {
      return 'consuetudo';
    }
    const phase = this.phase();
    if (phase === 'work' || phase === 'rest') {
      return this.timer.mode() === 'adhoc' ? 'track' : 'sessio';
    }
    if (this.watches.soloRunning() && this.watches.selected()) {
      return 'vigilia';
    }
    return null;
  });

  protected readonly clockPhase = computed(() => {
    const kind = this.liveKind();
    if (kind === 'consuetudo') {
      return this.consuetudo.overtime() ? 'overtime' : 'consuetudo';
    }
    if (kind === 'vigilia') {
      return 'vigilia';
    }
    return this.phase();
  });

  protected readonly clockTime = computed(() => {
    const kind = this.liveKind();
    if (kind === 'consuetudo') {
      return this.consuetudo.displayLabel();
    }
    if (kind === 'vigilia') {
      return this.watchElapsed();
    }
    return this.remainingLabel();
  });

  protected readonly clockKindLabel = computed(() => {
    switch (this.liveKind()) {
      case 'consuetudo':
        return 'Consuetudo';
      case 'track':
        return 'Track';
      case 'vigilia':
        return 'Vigilia';
      case 'sessio':
        return 'Sessio';
      default:
        return 'Horologium';
    }
  });

  protected readonly clockTask = computed(() => {
    const kind = this.liveKind();
    if (kind === 'consuetudo') {
      return this.consuetudo.currentStep()?.title || this.consuetudo.routine()?.name || '';
    }
    if (kind === 'vigilia') {
      return this.selectedWatch()?.name || '';
    }
    return this.taskLabel();
  });

  protected readonly clockSession = computed(() => {
    const kind = this.liveKind();
    if (kind === 'consuetudo') {
      const running = this.consuetudo.running()
        ? this.consuetudo.overtime()
          ? 'Over'
          : 'Practice'
        : 'Paused';
      const meta = this.consuetudo.stepMeta();
      const name = this.consuetudo.routine()?.name;
      return [running, meta, name].filter(Boolean).join(' · ');
    }
    if (kind === 'vigilia') {
      return this.watches.soloRunning() ? 'Running' : 'Paused';
    }
    const phase = this.phase();
    const status = this.running()
      ? this.phaseLabel()
      : phase === 'rest' || phase === 'work'
        ? 'Paused'
        : this.phaseLabel();
    return [status, this.sessionLabel()].filter(Boolean).join(' · ');
  });

  protected readonly ringDashOffset = computed(() => {
    const kind = this.liveKind();
    let pct = 0;
    if (kind === 'consuetudo') {
      pct = this.consuetudo.progressPercent();
    } else if (kind === 'sessio' || kind === 'track') {
      pct = this.progressPercent();
    }
    pct = Math.min(100, Math.max(0, pct));
    return this.ringCircumference * (1 - pct / 100);
  });

  ngOnInit(): void {
    this.reload();
  }

  protected elapsedLabel(ms: number | null | undefined): string {
    return formatElapsedShort(ms ?? 0);
  }

  protected skillLine(slot: DailyTaskSlot): string {
    return dailySkillLine(slot) || '—';
  }

  protected habitDoneToday(habit: HabitView): boolean {
    return habit.recentDates.includes(this.todayIso());
  }

  protected dueSideCount(quest: QuestView): number {
    const open = (quest.subtasks ?? []).filter((s) => !s.completed);
    if (quest.journeyDueToday) {
      return open.length;
    }
    return open.filter((s) => s.gatesJourney).length;
  }

  protected workDueCaption(row: ScriptoriumDueView): string {
    const pretty = this.characterService.formatDate(row.dueDate);
    if (row.urgency === 'overdue') {
      const n = Math.abs(row.dueInDays);
      return n === 1 ? `Overdue · ${pretty}` : `${n} days overdue · ${pretty}`;
    }
    if (row.urgency === 'today') {
      return `Due today · ${pretty}`;
    }
    if (row.dueInDays === 1) {
      return `Tomorrow · ${pretty}`;
    }
    return `In ${row.dueInDays} days · ${pretty}`;
  }

  protected workTierName(tier: string): string {
    return SCRIPTORIUM_TIERS.find((t) => t.id === tier)?.name ?? tier;
  }

  protected completeHabit(habit: HabitView): void {
    if (habit.kind === 'tally') {
      this.clickHabit(habit);
      return;
    }
    if (this.habitDoneToday(habit) || this.busyHabitId()) {
      return;
    }
    this.busyHabitId.set(habit.id);
    this.habitsService.complete(habit.id, this.todayIso()).subscribe({
      next: () => {
        this.busyHabitId.set(null);
        this.timed.set(`Logged ${habit.name}`);
        this.reloadHabits();
        void this.characterService.getProfile().subscribe();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyHabitId.set(null);
        this.timed.set(err.error?.message ?? 'Could not log habit');
      },
    });
  }

  protected clickHabit(habit: HabitView): void {
    if (this.busyHabitId()) {
      return;
    }
    this.busyHabitId.set(habit.id);
    this.habitsService.click(habit.id).subscribe({
      next: (next) => {
        this.habits.update((rows) =>
          rows.map((row) => (row.id === next.id ? next : row)),
        );
        this.busyHabitId.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyHabitId.set(null);
        this.timed.set(err.error?.message ?? 'Could not mark');
      },
    });
  }

  protected onQuickLogged(): void {
    this.reloadLevelLogs();
    this.characterService.getProfile().subscribe({
      next: (p) => this.totalLevel.set(p.totalLevel),
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
        for (const award of result.awards ?? (result.award ? [result.award] : [])) {
          this.xpFeedback.publishAward(award);
        }
        this.reloadBoard();
        this.reloadLevelLogs();
        this.characterService.getProfile().subscribe({
          next: (p) => this.totalLevel.set(p.totalLevel),
        });
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.busyDailyId.set(null);
        this.timed.set(this.readError(err, 'Could not complete daily'));
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
      board: this.dailiesService.getBoard(this.todayIso(), true),
      quests: this.questsService.list('active'),
      habits: this.habitsService.list().pipe(catchError(() => of([] as HabitView[]))),
      dueWorks: this.scriptoriumApi.dueSoon(14).pipe(
        catchError(() => of([] as ScriptoriumDueView[])),
      ),
      profile: this.characterService.getProfile().pipe(
        catchError(() => of(null)),
      ),
      levels: this.skillsService.listLevelUps(1, 3).pipe(
        catchError(() => of(null)),
      ),
    }).subscribe({
      next: ({ board, quests, habits, dueWorks, profile, levels }) => {
        this.board.set(board);
        this.quests.set(quests);
        this.dueWorks.set(dueWorks);
        this.habits.set(habits.filter((h) => h.active && !h.archived));
        this.totalLevel.set(profile?.totalLevel ?? 0);
        this.levelLogs.set(levels?.items.slice(0, 3) ?? []);
        this.loading.set(false);
        this.error.set(null);
        void this.questsService.refreshActive().subscribe();
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not reach the server. Is the backend running?');
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

  private reloadLevelLogs(): void {
    this.skillsService.listLevelUps(1, 3).subscribe({
      next: (result) => this.levelLogs.set(result.items.slice(0, 3)),
      error: () => {
        /* keep prior log */
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
