import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import { QuestView } from './quest.model';
import { QuestsService } from './quests.service';

@Component({
  selector: 'app-quests-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quests-page.html',
  styleUrl: './quests-page.css',
})
export class QuestsPage implements OnInit {
  private readonly questsService = inject(QuestsService);
  private readonly router = inject(Router);
  private readonly timed = new TimedToast();

  protected readonly filter = signal('all');
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly loading = signal(true);
  protected readonly toast = this.timed.value;

  ngOnInit(): void {
    this.reload();
    void this.questsService.refreshActive().subscribe();
  }

  protected setFilter(f: string): void {
    this.filter.set(f);
    this.reload();
  }

  protected open(q: QuestView): void {
    void this.router.navigate(['/quests', q.id]);
  }

  private reload(): void {
    this.loading.set(true);
    this.questsService.list(this.filter()).subscribe({
      next: (rows) => {
        this.quests.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load quests');
      },
    });
  }
}
