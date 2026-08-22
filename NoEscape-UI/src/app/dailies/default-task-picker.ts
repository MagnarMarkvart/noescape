import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DailyTaskTemplate,
  dailySkillLine,
  formatTaskDuration,
} from './daily.model';

@Component({
  selector: 'app-default-task-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="default-search">
      <label class="title-field">
        Load a default
        <input
          type="search"
          role="combobox"
          autocomplete="off"
          placeholder="Search saved tasks"
          aria-autocomplete="list"
          aria-controls="default-hits"
          [attr.aria-expanded]="open()"
          [value]="query()"
          (input)="onQuery($event)"
          (focus)="open.set(true)"
          (blur)="onBlur()"
          (keydown)="onKey($event)"
        />
      </label>
      @if (open()) {
        <ul id="default-hits" class="default-hits" role="listbox">
          @if (hits().length === 0) {
            <li class="default-empty">No matching defaults</li>
          } @else {
            @for (t of hits(); track t.id) {
              <li role="none">
                <button
                  type="button"
                  class="default-hit"
                  role="option"
                  (mousedown)="choose(t)"
                >
                  <span class="hit-title">
                    <span aria-hidden="true">{{ t.icon }}</span>
                    {{ t.name }}
                  </span>
                  <span class="hit-meta">
                    {{ skillLine(t) }}
                    · E{{ t.effortLevel }}
                    · {{ formatDuration(t.durationMinutes) }}
                    @if (t.habit) {
                      · {{ t.habit.icon }} {{ t.habit.name }}
                    }
                  </span>
                </button>
              </li>
            }
          }
        </ul>
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
    .default-search {
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
    .default-hits {
      list-style: none;
      margin: 0.35rem 0 0;
      padding: 0.25rem;
      display: grid;
      gap: 0.2rem;
      max-height: 14rem;
      overflow: auto;
      border: 1px solid var(--rs-border);
      background: #1a1610;
    }
    .default-empty {
      padding: 0.55rem 0.65rem;
      color: var(--rs-muted);
      font-size: 0.85rem;
    }
    .default-hit {
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
    .default-hit:hover,
    .default-hit:focus-visible {
      border-color: var(--rs-border-bright);
      background: rgba(212, 168, 75, 0.12);
      outline: none;
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
export class DefaultTaskPicker {
  readonly templates = input<DailyTaskTemplate[]>([]);
  readonly pick = output<DailyTaskTemplate>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly hits = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.templates();
    const matched = q
      ? rows.filter((t) => this.matches(t, q))
      : rows;
    return matched.slice(0, 12);
  });

  protected skillLine(t: DailyTaskTemplate): string {
    return dailySkillLine(t);
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
      if (first) {
        this.choose(first);
      }
    }
  }

  protected onBlur(): void {
    setTimeout(() => this.open.set(false), 150);
  }

  protected choose(t: DailyTaskTemplate): void {
    this.query.set('');
    this.open.set(false);
    this.pick.emit(t);
  }

  private matches(t: DailyTaskTemplate, q: string): boolean {
    const hay = [
      t.name,
      t.skill.name,
      t.skill.category,
      t.habit?.name ?? '',
      ...(t.skillShares ?? []).map((s) => s.name),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }
}
