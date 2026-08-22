import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import { ImageWarmService } from '../shared/image-warm.service';
import { TimedToast } from '../shared/timed-toast';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import {
  QuestView,
  questCoverBg,
  resolveQuestCoverUrl,
  weekdayLabel,
} from './quest.model';
import { QuestsService } from './quests.service';

type QuestBoard = 'all' | 'today' | 'progress' | 'schedule' | 'ready' | 'done';

const BOARD_KEY = 'noescape.quests.board.v2';
const BOARD_IDS: QuestBoard[] = [
  'all',
  'today',
  'progress',
  'schedule',
  'ready',
  'done',
];

function loadQuestBoard(): QuestBoard {
  try {
    const id = sessionStorage.getItem(BOARD_KEY);
    if (id && BOARD_IDS.includes(id as QuestBoard)) {
      return id as QuestBoard;
    }
  } catch {
    /* private mode */
  }
  return 'all';
}

function saveQuestBoard(id: QuestBoard): void {
  try {
    sessionStorage.setItem(BOARD_KEY, id);
  } catch {
    /* private mode */
  }
}

@Component({
  selector: 'app-quests-page',
  imports: [RouterLink, UiConfirm, UiIconBtn],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quests-page.html',
  styleUrl: './quests-page.css',
})
export class QuestsPage implements OnInit {
  private readonly questsService = inject(QuestsService);
  private readonly images = inject(ImageWarmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly board = signal<QuestBoard>(loadQuestBoard());
  protected readonly editing = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('edit') === '1')),
    {
      initialValue: this.route.snapshot.queryParamMap.get('edit') === '1',
    },
  );
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly loading = signal(true);
  protected readonly deleting = signal(false);
  protected readonly pendingDelete = signal<QuestView | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly weekdayLabel = weekdayLabel;

  protected readonly boards: Array<{ id: QuestBoard; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'progress', label: 'In progress' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'ready', label: 'Not started' },
    { id: 'done', label: 'Completed' },
  ];

  protected readonly inProgress = computed(() =>
    this.quests().filter((q) => q.availability === 'active'),
  );

  protected readonly todayQuests = computed(() =>
    this.inProgress().filter((q) => q.journeyDueToday),
  );

  protected readonly notStarted = computed(() =>
    this.quests().filter(
      (q) => q.availability === 'available' || q.availability === 'locked',
    ),
  );

  protected readonly completed = computed(() =>
    this.quests().filter((q) => q.availability === 'completed'),
  );

  protected readonly listed = computed(() => {
    if (this.editing() || this.board() === 'all') {
      return this.quests();
    }
    switch (this.board()) {
      case 'today':
        return this.todayQuests();
      case 'progress':
        return this.inProgress();
      case 'ready':
        return this.notStarted();
      case 'done':
        return this.completed();
      default:
        return [];
    }
  });

  protected readonly emptyCopy = computed(() => {
    switch (this.board()) {
      case 'all':
        return 'No quests yet.';
      case 'today':
        return 'Nothing due today. In-progress quests are waiting in the next tab.';
      case 'progress':
        return 'No quests in progress.';
      case 'ready':
        return 'No waiting quests.';
      case 'done':
        return 'No completed quests yet.';
      default:
        return 'Nothing here.';
    }
  });

  ngOnInit(): void {
    this.reload();
    void this.questsService.refreshActive().subscribe();
  }

  protected setBoard(id: QuestBoard): void {
    this.board.set(id);
    saveQuestBoard(id);
  }

  protected toggleEditing(): void {
    void this.router.navigate(['/quests'], {
      queryParams: this.editing() ? {} : { edit: '1' },
      replaceUrl: true,
    });
  }

  protected open(q: QuestView): void {
    if (q.availability === 'active') {
      void this.router.navigate(['/quests', q.id, 'run']);
      return;
    }
    void this.router.navigate(['/quests', q.id]);
  }

  protected editHref(q: QuestView): string {
    return `/quests/${q.id}/edit`;
  }

  protected statusLabel(q: QuestView): string {
    if (!this.editing() && this.board() === 'today') {
      return 'Due today';
    }
    return q.tier;
  }

  protected coverBg(q: QuestView): string | null {
    return questCoverBg(q.coverUrl, API_BASE_URL);
  }

  protected askDelete(q: QuestView): void {
    this.pendingDelete.set(q);
  }

  protected cancelDelete(): void {
    if (this.deleting()) {
      return;
    }
    this.pendingDelete.set(null);
  }

  protected confirmDelete(): void {
    const q = this.pendingDelete();
    if (!q || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.questsService.remove(q.id).subscribe({
      next: () => {
        this.quests.update((rows) => rows.filter((row) => row.id !== q.id));
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.timed.set(`Erased “${q.name}”.`);
      },
      error: (err: { error?: { message?: string } }) => {
        this.deleting.set(false);
        this.timed.set(err.error?.message ?? 'Could not erase the quest.');
      },
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.questsService.list('all').subscribe({
      next: (rows) => {
        this.quests.set(rows);
        this.images.warmAll(
          rows.map((q) => resolveQuestCoverUrl(q.coverUrl, API_BASE_URL)),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load quests');
      },
    });
  }
}
