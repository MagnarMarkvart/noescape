import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HorologiumApiService } from './horologium-api.service';
import {
  HorologiumSessionRecord,
  HorologiumSkillXp,
} from './horologium.model';

const PAGE_SIZE = 15;
const TZ = 'Europe/Tallinn';

@Component({
  selector: 'app-horologium-log-page',
  imports: [RouterLink, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-log-page.html',
  styleUrl: './horologium-log-page.css',
})
export class HorologiumLogPage implements OnInit {
  private readonly api = inject(HorologiumApiService);

  protected readonly items = signal<HorologiumSessionRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly loading = signal(true);
  protected readonly selected = signal<HorologiumSessionRecord | null>(null);

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / PAGE_SIZE)),
  );

  ngOnInit(): void {
    this.load(0);
  }

  protected prev(): void {
    if (this.page() <= 0) {
      return;
    }
    this.load(this.page() - 1);
  }

  protected next(): void {
    if (this.page() + 1 >= this.pageCount()) {
      return;
    }
    this.load(this.page() + 1);
  }

  protected open(row: HorologiumSessionRecord): void {
    this.selected.set(row);
  }

  protected close(): void {
    this.selected.set(null);
  }

  @HostListener('document:keydown.escape')
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

  protected clock(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  }

  protected stamp(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
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

  private load(page: number): void {
    this.loading.set(true);
    this.selected.set(null);
    this.api.listSessions(PAGE_SIZE, page * PAGE_SIZE).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.page.set(page);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
