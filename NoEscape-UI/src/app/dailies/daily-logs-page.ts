import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DailyLogDetail, DailyLogSummary } from './daily.model';
import { DailiesService } from './dailies.service';

@Component({
  selector: 'app-daily-logs-page',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-logs-page.html',
  styleUrl: './daily-logs-page.css',
})
export class DailyLogsPage implements OnInit {
  private readonly dailiesService = inject(DailiesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly logs = signal<DailyLogSummary[]>([]);
  protected readonly selected = signal<DailyLogDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.dailiesService.listLogs().subscribe({
      next: (logs) => {
        this.logs.set(logs);
        this.loading.set(false);
        const date = this.route.snapshot.paramMap.get('date');
        if (date) {
          this.openLog(date);
        } else if (logs[0]) {
          this.openLog(logs[0].date);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load quest logs.');
      },
    });
  }

  protected openLog(date: string): void {
    void this.router.navigate(['/dailies/logs', date], { replaceUrl: true });
    this.dailiesService.getLog(date).subscribe({
      next: (log) => this.selected.set(log),
      error: () => this.error.set(`Could not open log for ${date}.`),
    });
  }

  protected completionRate(log: DailyLogSummary): number {
    if (log.filledCount === 0) {
      return 0;
    }
    return Math.round((log.completedCount / log.filledCount) * 100);
  }
}
