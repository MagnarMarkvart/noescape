import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { API_BASE_URL } from '../core/api.config';
import { ImageWarmService } from '../shared/image-warm.service';
import { TimedToast } from '../shared/timed-toast';
import {
  QuestView,
  questCoverBg,
  resolveQuestCoverUrl,
  weekdayLabel,
} from './quest.model';
import { QuestsService } from './quests.service';

type QuestBoard = 'today' | 'progress' | 'schedule' | 'ready' | 'done';

const BOARD_KEY = 'noescape.quests.board';
const BOARD_IDS: QuestBoard[] = [
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
  return 'today';
}

function hasStoredQuestBoard(): boolean {
  try {
    const id = sessionStorage.getItem(BOARD_KEY);
    return Boolean(id && BOARD_IDS.includes(id as QuestBoard));
  } catch {
    return false;
  }
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
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quests-page.html',
  styleUrl: './quests-page.css',
})
export class QuestsPage implements OnInit {
  private readonly questsService = inject(QuestsService);
  private readonly images = inject(ImageWarmService);
  private readonly router = inject(Router);
  private readonly timed = new TimedToast();

  protected readonly board = signal<QuestBoard>(loadQuestBoard());
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;
  protected readonly weekdayLabel = weekdayLabel;

  protected readonly boards: Array<{ id: QuestBoard; label: string }> = [
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

  ngOnInit(): void {
    this.reload();
    void this.questsService.refreshActive().subscribe();
  }

  protected setBoard(id: QuestBoard): void {
    this.board.set(id);
    saveQuestBoard(id);
  }

  protected open(q: QuestView): void {
    if (q.availability === 'active') {
      void this.router.navigate(['/quests', q.id, 'run']);
      return;
    }
    void this.router.navigate(['/quests', q.id]);
  }

  protected coverBg(q: QuestView): string | null {
    return questCoverBg(q.coverUrl, API_BASE_URL);
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
        if (
          !hasStoredQuestBoard() &&
          this.board() === 'today' &&
          this.todayQuests().length === 0 &&
          this.inProgress().length > 0
        ) {
          this.board.set('progress');
        }
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load quests');
      },
    });
  }
}
