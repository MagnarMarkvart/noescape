import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { formatTaskDuration } from './daily.model';
import {
  QuestSubtaskView,
  QuestView,
} from '../quests/quest.model';
import { QuestsService } from '../quests/quests.service';

export interface QuestTaskPick {
  title: string;
  questId: number;
  questSubtaskId?: number;
  skillWeights: Array<{ slug: string; weight: number }>;
  durationMinutes: number;
  effortLevel: number;
}

@Component({
  selector: 'app-quest-task-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quest-search">
      <label class="title-field">
        Load from a quest
        <input
          type="search"
          role="combobox"
          autocomplete="off"
          placeholder="Search active quests"
          aria-autocomplete="list"
          aria-controls="quest-hits"
          [attr.aria-expanded]="open()"
          [value]="query()"
          (input)="onQuery($event)"
          (focus)="open.set(true)"
          (blur)="onBlur()"
          (keydown)="onKey($event)"
        />
      </label>
      @if (open()) {
        <div id="quest-hits" class="quest-hits" role="listbox">
          @if (loading()) {
            <p class="quest-empty">Loading quests…</p>
          } @else if (hits().length === 0) {
            <p class="quest-empty">No matching quests</p>
          } @else {
            @for (q of hits(); track q.id) {
              <section class="quest-group">
                <button
                  type="button"
                  class="quest-head"
                  [attr.aria-expanded]="isExpanded(q.id)"
                  (mousedown)="toggle(q.id, $event)"
                >
                  <span class="hit-title">{{ q.name }}</span>
                  <span class="hit-meta">
                    {{ q.tier }}
                    · {{ q.progressPercent }}%
                  </span>
                </button>
                @if (isExpanded(q.id)) {
                  @if (showDailyWork(q)) {
                    <button
                      type="button"
                      class="quest-hit"
                      role="option"
                      (mousedown)="chooseDailyWork(q)"
                    >
                      <span class="hit-title">
                        {{ dailyWorkTitle(q) }}
                      </span>
                      <span class="hit-meta">
                        Daily work
                        · {{ formatDuration(dailyWorkMinutes(q)) }}
                      </span>
                    </button>
                  }
                  @for (s of q.subtasks; track s.id) {
                    <button
                      type="button"
                      class="quest-hit"
                      role="option"
                      (mousedown)="chooseSubtask(q, s)"
                    >
                      <span class="hit-title">{{ s.title }}</span>
                      @if (s.estimateMinutes) {
                        <span class="hit-meta">
                          {{ formatDuration(s.estimateMinutes) }}
                        </span>
                      }
                    </button>
                  }
                }
              </section>
            }
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      --rs-border: #8a7340;
      --rs-border-bright: #c6a85a;
      --rs-text: #f0e6c8;
      --rs-muted: #b8a878;
      --rs-accent: #d4a84b;
      --font-display: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      --font-body: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .quest-search {
      position: relative;
    }
    .title-field {
      display: grid;
      gap: 0.3rem;
      font-size: 0.82rem;
      color: var(--rs-muted);
    }
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 0.45rem 0.55rem;
      border: 1px solid var(--rs-border);
      background: #1a1610;
      color: var(--rs-text);
      font: inherit;
    }
    .quest-hits {
      margin: 0.35rem 0 0;
      padding: 0.25rem;
      display: grid;
      gap: 0.25rem;
      max-height: 18rem;
      overflow: auto;
      border: 1px solid var(--rs-border);
      background: #1a1610;
    }
    .quest-empty {
      margin: 0;
      padding: 0.55rem 0.65rem;
      color: var(--rs-muted);
      font-size: 0.85rem;
    }
    .quest-group {
      display: grid;
      gap: 0.15rem;
    }
    .quest-head,
    .quest-hit {
      width: 100%;
      display: grid;
      gap: 0.15rem;
      padding: 0.5rem 0.6rem;
      text-align: left;
      color: inherit;
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      font-family: var(--font-body);
    }
    .quest-head {
      border-color: var(--rs-border);
      background: rgba(212, 168, 75, 0.06);
    }
    .quest-head:hover,
    .quest-head:focus-visible,
    .quest-hit:hover,
    .quest-hit:focus-visible {
      border-color: var(--rs-border-bright);
      background: rgba(212, 168, 75, 0.12);
      outline: none;
    }
    .quest-hit {
      padding-left: 1rem;
    }
    .hit-title {
      font-family: var(--font-display);
      display: flex;
      gap: 0.35rem;
      align-items: baseline;
    }
    .hit-meta {
      color: var(--rs-muted);
      font-size: 0.78rem;
    }
  `,
})
export class QuestTaskPicker implements OnInit {
  private readonly questsService = inject(QuestsService);

  readonly pick = output<QuestTaskPick>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly loading = signal(true);
  protected readonly quests = signal<QuestView[]>([]);
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly hits = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.quests();
    return q ? rows.filter((quest) => this.matches(quest, q)) : rows;
  });

  ngOnInit(): void {
    this.questsService.list('active').subscribe({
      next: (rows) => {
        this.quests.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.quests.set([]);
        this.loading.set(false);
      },
    });
  }

  protected isExpanded(id: number): boolean {
    return this.query().trim().length > 0 || this.expanded().has(id);
  }

  protected showDailyWork(q: QuestView): boolean {
    return Boolean(q.dailyWorkMinutes) || q.subtasks.length > 0;
  }

  protected dailyWorkTitle(q: QuestView): string {
    return q.dailyWorkTitle || q.journeyLabel || q.name;
  }

  protected dailyWorkMinutes(q: QuestView): number {
    return q.dailyWorkMinutes || 45;
  }

  protected formatDuration(minutes: number): string {
    return formatTaskDuration(minutes);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.open.set(true);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.open.set(false);
      (event.target as HTMLInputElement).blur();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = this.hits()[0];
      if (!first) {
        return;
      }
      if (this.showDailyWork(first)) {
        this.chooseDailyWork(first);
        return;
      }
      const sub = first.subtasks[0];
      if (sub) {
        this.chooseSubtask(first, sub);
      }
    }
  }

  protected onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }

  protected toggle(id: number, event: MouseEvent): void {
    event.preventDefault();
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected chooseDailyWork(q: QuestView): void {
    this.emitPick(q, {
      title: this.dailyWorkTitle(q),
      durationMinutes: this.dailyWorkMinutes(q),
    });
  }

  protected chooseSubtask(q: QuestView, subtask: QuestSubtaskView): void {
    this.emitPick(q, {
      title: subtask.title,
      questSubtaskId: subtask.id,
      durationMinutes: subtask.estimateMinutes || q.dailyWorkMinutes || 45,
    });
  }

  private emitPick(
    q: QuestView,
    extras: { title: string; questSubtaskId?: number; durationMinutes: number },
  ): void {
    this.query.set('');
    this.open.set(false);
    this.pick.emit({
      title: extras.title,
      questId: q.id,
      questSubtaskId: extras.questSubtaskId,
      skillWeights: (q.skillShares ?? []).map((s) => ({
        slug: s.slug,
        weight: s.weight,
      })),
      durationMinutes: extras.durationMinutes,
      effortLevel: 5,
    });
  }

  private matches(q: QuestView, query: string): boolean {
    const hay = [
      q.name,
      ...q.subtasks.map((s) => s.title),
      ...(q.skillShares ?? []).map((s) => s.name),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(query);
  }
}
