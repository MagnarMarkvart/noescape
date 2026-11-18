import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { HABIT_ICON_GROUPS } from '../../habits/habit-icons';

@Component({
  selector: 'app-icon-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="icon-picker" [class.compact]="compact()">
      <div class="head">
        <span>{{ label() }}</span>
        <span class="preview" aria-hidden="true">{{ selected() }}</span>
      </div>
      <div class="tabs" role="tablist" [attr.aria-label]="label() + ' categories'">
        @for (group of groups; track group.id) {
          <button
            type="button"
            role="tab"
            class="tab"
            [class.selected]="groupId() === group.id"
            (pointerdown)="pickGroup($event, group.id)"
          >
            {{ group.label }}
          </button>
        }
      </div>
      <div class="grid" role="listbox">
        @for (opt of active().icons; track opt.glyph) {
          <button
            type="button"
            role="option"
            class="tile"
            [class.selected]="selected() === opt.glyph"
            [title]="opt.label"
            (pointerdown)="pickGlyph($event, opt.glyph)"
          >
            <span class="glyph" aria-hidden="true">{{ opt.glyph }}</span>
            @if (!compact()) {
              <span class="name">{{ opt.label }}</span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .icon-picker {
      display: grid;
      gap: 0.55rem;
      padding: 0.9rem 1rem 1.05rem;
      border: 1px solid #8a7340;
      background: rgba(22, 18, 10, 0.42);
      min-width: 0;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 1.05rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      line-height: 1.25;
      color: #d4a84b;
    }
    .preview {
      font-size: 1.35rem;
    }
    .icon-picker.compact {
      gap: 0.4rem;
      padding: 0;
      border: 0;
      background: transparent;
    }
    .icon-picker.compact .head {
      font-family: inherit;
      font-size: 0.8rem;
      font-weight: 400;
      letter-spacing: 0;
      color: #b8a878;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      min-width: 0;
      max-width: 100%;
    }
    .tab {
      box-sizing: border-box;
      max-width: 100%;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.72rem;
      padding: 0.25rem 0.45rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #b8a878;
      cursor: pointer;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .tab.selected {
      border-color: #c6a85a;
      color: #d4a84b;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 2.75rem), 1fr));
      gap: 0.3rem;
      max-height: 12rem;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 0.25rem;
      border: 1px solid rgba(138, 115, 64, 0.4);
      background: rgba(18, 14, 8, 0.45);
    }
    .tile {
      display: grid;
      justify-items: center;
      gap: 0.1rem;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      padding: 0.35rem 0.15rem;
      border: 1px solid transparent;
      background: rgba(20, 16, 10, 0.55);
      color: #f0e6c8;
      cursor: pointer;
    }
    .tile.selected {
      border-color: #d4a84b;
      background: rgba(212, 168, 75, 0.14);
    }
    .glyph {
      font-size: 1.2rem;
    }
    .name {
      font-size: 0.58rem;
      color: #b8a878;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .compact .head {
      display: none;
    }
    @media (max-width: 360px) {
      .name {
        display: none;
      }
    }
  `,
})
export class IconPicker {
  readonly selected = input.required<string>();
  readonly label = input('Icon');
  readonly compact = input(false);
  readonly picked = output<string>();
  protected readonly groups = HABIT_ICON_GROUPS;
  protected readonly groupId = signal(HABIT_ICON_GROUPS[0].id);
  protected readonly active = computed(
    () => this.groups.find((g) => g.id === this.groupId()) ?? this.groups[0],
  );

  protected pickGroup(event: Event, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.groupId.set(id);
  }

  protected pickGlyph(event: Event, glyph: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.picked.emit(glyph);
  }
}
