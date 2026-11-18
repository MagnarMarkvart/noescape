import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Skill, SkillCategory } from '../../skills/skill.model';

@Component({
  selector: 'app-skill-tree-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tree">
      <div class="grid parents" role="listbox" aria-label="Parent skills">
        @for (cat of categories(); track cat.category) {
          <button
            type="button"
            class="tile"
            role="option"
            [class.selected]="selectedCategory() === cat.category"
            (click)="categoryChange.emit(cat.category)"
          >
            <span class="glyph" aria-hidden="true">{{ cat.icon }}</span>
            <span class="name">{{ cat.label }}</span>
          </button>
        }
      </div>
      @if (skills().length) {
        <div class="grid kids" role="listbox" aria-label="Subskills">
          @for (skill of skills(); track skill.id) {
            <button
              type="button"
              class="tile"
              role="option"
              [class.selected]="selectedSlugs().includes(skill.slug)"
              (click)="skillPick.emit(skill)"
            >
              <span class="glyph" aria-hidden="true">{{ skill.icon }}</span>
              <span class="name">{{ skill.name }}</span>
              @if (showLevel()) {
                <span class="meta">Lv {{ skill.level }}</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .tree {
      display: grid;
      gap: 0.45rem;
      min-width: 0;
    }
    .grid {
      display: grid;
      gap: 0.3rem;
      min-width: 0;
      max-width: 100%;
    }
    .grid.parents {
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 5rem), 1fr));
    }
    .grid.kids {
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 6.25rem), 1fr));
    }
    .tile {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0.28rem;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      padding: 0.6rem 0.45rem;
      border: 1px solid #8a7340;
      background: transparent;
      color: #b8a878;
      cursor: pointer;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.72rem;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .tile.selected {
      border-color: #c6a85a;
      color: #d4a84b;
    }
    .glyph {
      display: grid;
      place-items: center;
      min-height: 1.45rem;
      padding-block: 0.12rem;
      font-size: 1.2rem;
      line-height: 1.15;
    }
    .name {
      text-align: center;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .meta {
      font-size: 0.62rem;
      color: #b8a878;
    }
  `,
})
export class SkillTreePicker {
  readonly categories = input<SkillCategory[]>([]);
  readonly skills = input<Skill[]>([]);
  readonly selectedCategory = input<string | null>(null);
  readonly selectedSlugs = input<string[]>([]);
  readonly showLevel = input(false);
  readonly categoryChange = output<string>();
  readonly skillPick = output<Skill>();
}
