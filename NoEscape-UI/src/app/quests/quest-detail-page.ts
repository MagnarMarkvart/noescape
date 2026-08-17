import { KeyValuePipe } from '@angular/common';
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
import {
  QuestView,
  chronicleKindLabel,
  questCoverBg,
  questTasks,
  questTimeframe,
} from './quest.model';
import { formatElapsedShort } from '../shared/time';
import { QuestsService } from './quests.service';

@Component({
  selector: 'app-quest-detail-page',
  imports: [RouterLink, KeyValuePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quest-detail-page.html',
  styleUrl: './quest-detail-page.css',
  host: { class: 'quest-slide-host' },
})
export class QuestDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly questsService = inject(QuestsService);
  private loadSeq = 0;

  protected readonly quest = signal<QuestView | null>(null);
  protected readonly loading = signal(true);
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

  protected readonly chronicleKindLabel = chronicleKindLabel;

  protected elapsedLabel(ms: number | null | undefined): string {
    return formatElapsedShort(ms ?? 0);
  }

  protected readonly coverBg = computed(() =>
    questCoverBg(this.quest()?.coverUrl ?? null, API_BASE_URL),
  );

  constructor() {
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
    this.loading.set(true);
    this.error.set(null);
    this.questsService.getOne(id).subscribe({
      next: (q) => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.quest.set(q);
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) {
          return;
        }
        this.error.set('Could not load quest');
        this.loading.set(false);
      },
    });
  }

  protected start(): void {
    const q = this.quest();
    if (!q || this.starting()) {
      return;
    }
    this.starting.set(true);
    this.questsService.start(q.id).subscribe({
      next: () => {
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
    return key.replace(/^feature:/, '');
  }

  protected kindLabel(kind: string): string {
    return kind.replace(/_/g, ' ');
  }
}
