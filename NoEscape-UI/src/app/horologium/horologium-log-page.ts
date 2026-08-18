import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CharacterService } from '../character/character.service';
import { DateNav } from '../shared/date-nav';
import { CalendarMarks } from '../shared/rune-calendar';
import { todayInZone } from '../shared/time';
import { HorologiumApiService } from './horologium-api.service';
import {
  HorologiumSessionRecord,
  HorologiumSkillXp,
} from './horologium.model';

@Component({
  selector: 'app-horologium-log-page',
  imports: [RouterLink, DecimalPipe, DateNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-log-page.html',
  styleUrl: './horologium-log-page.css',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
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

  protected onEscape(): void {
    this.close();
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

  protected minutesLabel(mins: number): string {
    const n = Math.max(0, Math.round(mins) || 0);
    if (n < 1) {
      return 'under 1m';
    }
    const h = Math.floor(n / 60);
    const m = n % 60;
    if (h > 0 && m > 0) {
      return `${h}h ${m}m`;
    }
    if (h > 0) {
      return `${h}h`;
    }
    return `${m}m`;
  }

  protected restTotal(row: HorologiumSessionRecord): number {
    if (row.restTotalMinutes != null) {
      return row.restTotalMinutes;
    }
    return row.restMinutes * Math.max(0, row.iterations - 1);
  }

  protected skillXp(row: HorologiumSessionRecord): HorologiumSkillXp[] {
    if (row.skillXp?.length) {
      return row.skillXp;
    }
    const out: HorologiumSkillXp[] = [];
    if (row.focusXpAwarded) {
      out.push({
        slug: 'focus',
        name: 'Focus',
        icon: row.skill?.slug === 'focus' ? row.skill.icon : '🎯',
        xp: row.focusXpAwarded,
      });
    }
    if (row.disciplineXpAwarded) {
      out.push({
        slug: 'discipline',
        name: 'Discipline',
        icon: row.skill?.slug === 'discipline' ? row.skill.icon : '⚖️',
        xp: row.disciplineXpAwarded,
      });
    }
    if (!out.length && row.skill) {
      out.push({
        slug: row.skill.slug,
        name: row.skill.name,
        icon: row.skill.icon,
        xp: row.xpAwarded,
      });
    }
    return out;
  }

  protected outcomeLabel(row: HorologiumSessionRecord): string {
    switch (row.outcome) {
      case 'block':
        return row.iterations > 1 ? 'Work block' : 'Track block';
      case 'goal':
        return 'Sessio complete';
      case 'abandon':
        return 'Stopped early';
      case 'task':
        return 'Task settled';
      case 'task_early':
        return 'Ended after task';
      default:
        return row.endedEarly ? 'Ended early' : 'Session';
    }
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
