import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CharacterService } from '../character/character.service';
import { CalendarMarks } from '../shared/rune-calendar';
import { HistoryLog } from '../shared/ui/history-log';
import { HorologiumApiService } from './horologium-api.service';
import { HorologiumSessionRecord } from './horologium.model';
import { HorologiumSessionSheet } from './horologium-session-sheet';

@Component({
  selector: 'app-horologium-log-page',
  imports: [DecimalPipe, HistoryLog, HorologiumSessionSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-log-page.html',
  styleUrl: './horologium-log-page.css',
})
export class HorologiumLogPage implements OnInit {
  private readonly api = inject(HorologiumApiService);
  private readonly character = inject(CharacterService);

  protected readonly items = signal<HorologiumSessionRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly selected = signal<HorologiumSessionRecord | null>(null);
  protected readonly selectedDate = signal(this.character.todayIso());
  protected readonly calendarMarks = signal<CalendarMarks>({});

  protected readonly todayIso = computed(() => this.character.todayIso());
  protected readonly lede = computed(() => {
    const n = this.total();
    return `${n} session${n === 1 ? '' : 's'} on ${this.formatDate(this.selectedDate())}`;
  });

  ngOnInit(): void {
    this.loadDay(this.selectedDate());
  }

  protected onDateNav(iso: string): void {
    this.selectedDate.set(iso);
    this.loadDay(iso);
  }

  protected loadCalendar(range: { from: string; to: string }): void {
    this.api.sessionCalendar(range.from, range.to).subscribe({
      next: (rows) => {
        const marks: CalendarMarks = {};
        for (const row of rows) {
          marks[row.date] = { stars: row.count };
        }
        this.calendarMarks.set(marks);
      },
    });
  }

  protected open(row: HorologiumSessionRecord): void {
    this.selected.set(row);
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected startIso(row: HorologiumSessionRecord): string {
    if (row.startedAt) {
      return row.startedAt;
    }
    const mins = Math.max(0, row.elapsedMinutes ?? row.durationMinutes ?? 0);
    return new Date(
      new Date(row.completedAt).getTime() - mins * 60_000,
    ).toISOString();
  }

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
  }

  protected clock(iso: string): string {
    return this.character.formatTime(iso);
  }

  private loadDay(date: string): void {
    this.loading.set(true);
    this.selected.set(null);
    this.api.listSessions(50, 0, date).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
