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
import { UiIcon } from '../shared/ui/ui-icon';
import { todayInZone } from '../shared/time';
import { formatSignedDelta } from './consuetudo-xp';
import { RoutineWalkRow, RoutinesService } from './routines.service';

@Component({
  selector: 'app-consuetudo-log-page',
  imports: [DecimalPipe, HistoryLog, UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consuetudo-log-page.html',
  styleUrl: './consuetudo-log-page.css',
})
export class ConsuetudoLogPage implements OnInit {
  private readonly api = inject(RoutinesService);
  private readonly character = inject(CharacterService);

  protected readonly items = signal<RoutineWalkRow[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly selected = signal<RoutineWalkRow | null>(null);
  protected readonly selectedDate = signal(this.character.todayIso());
  protected readonly calendarMarks = signal<CalendarMarks>({});
  protected readonly formatDelta = formatSignedDelta;
  protected readonly todayIso = computed(() => this.character.todayIso());
  protected readonly lede = computed(() => {
    const n = this.total();
    return `${n} walk${n === 1 ? '' : 's'} on ${this.formatDate(this.selectedDate())}`;
  });
  protected readonly detailTitle = computed(() => {
    const row = this.selected();
    return row ? row.routineName : null;
  });
  protected readonly detailKicker = computed(() => {
    const row = this.selected();
    return row ? this.formatDate(row.date) : '';
  });

  ngOnInit(): void {
    this.loadDay(this.selectedDate());
  }

  protected onDateNav(iso: string): void {
    this.selectedDate.set(iso);
    this.loadDay(iso);
  }

  protected loadCalendar(range: { from: string; to: string }): void {
    this.api.runCalendar(range.from, range.to).subscribe({
      next: (rows) => {
        const marks: CalendarMarks = {};
        for (const row of rows) {
          marks[row.date] = { stars: row.count };
        }
        this.calendarMarks.set(marks);
      },
    });
  }

  protected open(row: RoutineWalkRow): void {
    this.selected.set(row);
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
  }

  protected clock(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: this.character.timezone(),
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  protected stamp(iso: string): string {
    const date = todayInZone(this.character.timezone(), new Date(iso));
    return `${this.character.formatDate(date)} ${this.clock(iso)}`;
  }

  private loadDay(date: string): void {
    this.loading.set(true);
    this.selected.set(null);
    this.api.listRuns(date).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
