import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CharacterService } from '../character/character.service';
import { CalendarMarks } from '../shared/rune-calendar';
import { HistoryLog } from '../shared/ui/history-log';
import { DailyDayCard } from './daily-day-card';
import { DailyLogDetail, DailyTaskSlot, DailyVerdict } from './daily.model';
import { DailiesService } from './dailies.service';
import { filledSlotsFromBoard, verdictFromLog } from './day-score';

@Component({
  selector: 'app-dailies-log-page',
  imports: [HistoryLog, DailyDayCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dailies-log-page.html',
  styleUrl: './dailies-log-page.css',
})
export class DailiesLogPage implements OnInit {
  private readonly dailies = inject(DailiesService);
  private readonly character = inject(CharacterService);
  private readonly route = inject(ActivatedRoute);

  protected readonly log = signal<DailyLogDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly selectedDate = signal(this.character.todayIso());
  protected readonly calendarMarks = signal<CalendarMarks>({});

  protected readonly todayIso = computed(() => this.character.todayIso());
  protected readonly lede = computed(() => {
    if (this.loading()) {
      return '';
    }
    const log = this.log();
    if (!log) {
      return 'This day is not sealed.';
    }
    return `${log.verdict || log.grade} · ${log.score}`;
  });
  protected readonly verdict = computed((): DailyVerdict | null => {
    const log = this.log();
    return log ? verdictFromLog(log) : null;
  });
  protected readonly tasks = computed((): DailyTaskSlot[] => {
    const log = this.log();
    return log ? filledSlotsFromBoard(log.snapshot.board) : [];
  });

  ngOnInit(): void {
    const queryDate = this.route.snapshot.queryParamMap.get('date');
    if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      this.selectedDate.set(queryDate);
    }
    this.loadDay(this.selectedDate());
  }

  protected onDateNav(iso: string): void {
    this.selectedDate.set(iso);
    this.loadDay(iso);
  }

  protected loadCalendar(range: { from: string; to: string }): void {
    this.dailies.calendar(range.from, range.to).subscribe({
      next: (rows) => {
        const marks: CalendarMarks = {};
        for (const row of rows) {
          marks[row.date] = row.grade
            ? { grade: row.grade }
            : { status: row.status };
        }
        this.calendarMarks.set(marks);
      },
    });
  }

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
  }

  private loadDay(date: string): void {
    this.loading.set(true);
    this.dailies
      .getLog(date)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) {
            return of(null);
          }
          return of(null);
        }),
      )
      .subscribe({
        next: (log) => {
          this.log.set(log);
          this.loading.set(false);
        },
        error: () => {
          this.log.set(null);
          this.loading.set(false);
        },
      });
  }
}
