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
import { bandLabel, periodCaption, TabulaClickView, TabulaView } from './tabularium.model';
import { TabulaClicker } from './tabula-clicker';
import { TabulariumService } from './tabularium.service';

@Component({
  selector: 'app-tabularium-log-page',
  imports: [HistoryLog, TabulaClicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabularium-log-page.html',
  styleUrl: './tabularium-log-page.css',
})
export class TabulariumLogPage implements OnInit {
  private readonly api = inject(TabulariumService);
  private readonly character = inject(CharacterService);

  protected readonly clicks = signal<TabulaClickView[]>([]);
  protected readonly board = signal<TabulaView[]>([]);
  protected readonly loading = signal(true);
  protected readonly selected = signal<TabulaClickView | null>(null);
  protected readonly selectedDate = signal(this.character.todayIso());
  protected readonly calendarMarks = signal<CalendarMarks>({});
  protected readonly busyId = signal<number | null>(null);

  protected readonly todayIso = computed(() => this.character.todayIso());
  protected readonly lede = computed(() => {
    const n = this.clicks().length;
    return `${n} mark${n === 1 ? '' : 's'} on ${this.formatDate(this.selectedDate())}`;
  });
  protected readonly detailTitle = computed(() => {
    const row = this.selected();
    return row ? row.tabulaName : null;
  });
  protected readonly detailKicker = computed(() => {
    const row = this.selected();
    return row ? this.formatDate(row.date) : '';
  });
  protected readonly bandLabel = bandLabel;
  protected readonly periodCaption = periodCaption;

  ngOnInit(): void {
    this.loadDay(this.selectedDate());
  }

  protected onDateNav(iso: string): void {
    this.selectedDate.set(iso);
    this.selected.set(null);
    this.loadDay(iso);
  }

  protected loadCalendar(range: { from: string; to: string }): void {
    this.api.calendar(range.from, range.to).subscribe({
      next: (rows) => {
        const marks: CalendarMarks = {};
        for (const row of rows) {
          marks[row.date] = { stars: row.count };
        }
        this.calendarMarks.set(marks);
      },
    });
  }

  protected open(row: TabulaClickView): void {
    this.selected.set(row);
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected click(row: TabulaView): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(row.id);
    this.api.click(row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.loadDay(this.selectedDate());
      },
      error: () => this.busyId.set(null),
    });
  }

  protected undo(row: TabulaView): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(row.id);
    this.api.undo(row.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.loadDay(this.selectedDate());
      },
      error: () => this.busyId.set(null),
    });
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

  protected signed(delta: number): string {
    return delta > 0 ? `+${delta}` : String(delta);
  }

  private loadDay(date: string): void {
    this.loading.set(true);
    this.api.log(date).subscribe({
      next: (res) => {
        this.clicks.set(res.clicks);
        this.board.set(res.board);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
