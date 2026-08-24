import { KeyValuePipe } from '@angular/common';
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
import { formatMoney } from '../shared/money';
import { RuneLoader } from '../shared/rune-loader';
import { formatElapsedShort } from '../shared/time';
import {
  QuestView,
  chronicleKindLabel,
  deadlineLabel,
  deadlineTone,
  questCoverBg,
  questDeadline,
  questTasks,
  questTimeframe,
} from './quest.model';
import { QuestRevealService } from './quest-reveal.service';
import { QuestsService } from './quests.service';
import { HorologiumWatchService } from '../horologium/horologium-watch.service';
import {
  DragGrip,
  DragItem,
  DragSortDrop,
  DropGroup,
  DropList,
  moveIndex,
} from '../shared/ui/drag-sort';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';

@Component({
  selector: 'app-quest-detail-page',
  imports: [RouterLink, KeyValuePipe, RuneLoader, DropGroup, DropList, DragItem, DragGrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-detail-page.html',
  styleUrl: './quest-detail-page.css',
  host: { class: 'quest-slide-host' },
})
export class QuestDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questsService = inject(QuestsService);
  private readonly reveal = inject(QuestRevealService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly character = inject(CharacterService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly watches = inject(HorologiumWatchService);
  private loadSeq = 0;
  private loaderTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly quest = signal<QuestView | null>(null);
  protected readonly loading = signal(true);
  protected readonly ready = signal(false);
  protected readonly showLoader = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);

  protected readonly tasks = computed(() => {
    const q = this.quest();
    return q ? questTasks(q) : [];
  });

  protected readonly timeframe = computed(() => {
    const q = this.quest();
    return q ? questTimeframe(q) : '';
  });

  protected readonly dueIso = computed(() => {
    const q = this.quest();
    return q ? questDeadline(q) : null;
  });

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

  protected elapsedLabel(ms: number | null | undefined): string {
    return formatElapsedShort(ms ?? 0);
  }

  protected questElapsed(q: QuestView): number {
    return this.watches.elapsedForQuest(q.id, q.run?.elapsedMs ?? 0);
  }

  protected journeyElapsed(q: QuestView): number {
    return this.watches.elapsedForDailyWork(q.id, q.run?.journeyElapsedMs ?? 0);
  }

  protected subtaskElapsed(t: { id: number; elapsedMs?: number }): number {
    return this.watches.elapsedForSubtask(t.id, t.elapsedMs ?? 0);
  }

  protected onSubtaskDrop(event: DragSortDrop): void {
    const q = this.quest();
    if (!q) {
      return;
    }
    const ids = moveIndex(
      q.subtasks.map((s) => s.id),
      event.fromIndex,
      event.toIndex,
    );
    this.quest.update((cur) =>
      cur
        ? { ...cur, subtasks: moveIndex(cur.subtasks, event.fromIndex, event.toIndex) }
        : cur,
    );
    this.questsService.reorderSubtasks(q.id, ids).subscribe({
      next: (next) => this.quest.set(next),
      error: () => this.load(q.id),
    });
  }

  protected readonly coverBg = computed(() =>
    questCoverBg(this.quest()?.coverUrl ?? null, API_BASE_URL),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.clearLoaderTimer());
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id)) {
        this.error.set('Quest not found');
        this.loading.set(false);
        return;
      }
      this.load(id);
    });
  }

  private load(id: number): void {
    const seq = ++this.loadSeq;
    this.armLoader(seq);
    this.error.set(null);
    this.reveal.open(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ quest }) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.revealNow(quest);
      },
      error: () => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.clearLoaderTimer();
        this.error.set('Could not load quest');
        this.loading.set(false);
        this.showLoader.set(false);
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

  protected start(): void {
    const q = this.quest();
    if (!q || this.starting()) {
      return;
    }
    this.starting.set(true);
    this.questsService.start(q.id).subscribe({
      next: () => {
        this.xpFeedback.publishQuest({
          kind: 'started',
          name: q.name,
          subtitle: 'The path is open',
        });
        void this.router.navigate(['/quests', q.id, 'run']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.starting.set(false);
        this.error.set(err.error?.message ?? 'Could not start quest');
      },
    });
  }

  protected continueRun(): void {
    const q = this.quest();
    if (q) {
      void this.router.navigate(['/quests', q.id, 'run']);
    }
  }

  protected featureLabel(key: string): string {
    const raw = key.replace(/^feature:/, '');
    if (!raw) {
      return key;
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  protected featureHref(key: string): string | null {
    const raw = key.replace(/^feature:/, '').toLowerCase();
    if (raw === 'habitus') {
      return '/habitus/demo';
    }
    if (raw === 'consuetudo') {
      return '/consuetudo/demo';
    }
    return null;
  }

  protected titleDisplay(title: string | undefined): string {
    if (!title) {
      return '';
    }
    const gloss: Record<string, string> = {
      'Mens Sana': 'a sound mind',
      Consuetudo: 'a practice',
    };
    const meaning = gloss[title];
    return meaning ? `${title} (${meaning})` : title;
  }

  protected wealthLabel(cents: number | null | undefined): string {
    const n = Math.round(Number(cents) || 0);
    return n > 0 ? formatMoney(n, this.character.currency()) : '';
  }

  protected kindLabel(kind: string): string {
    return kind.replace(/_/g, ' ');
  }
}
