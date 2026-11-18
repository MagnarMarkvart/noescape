import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { UiScroll } from '../shared/ui/ui-scroll';
import { HorologiumBoundDaily, horologiumBindKey } from './horologium.model';

@Component({
  selector: 'app-horologium-task-focus',
  imports: [UiScroll],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-scroll
      kicker="Focus"
      [title]="heading()"
      titleId="task-focus-title"
      layer="top"
      (closed)="closed.emit()"
    >
      <p class="lede">
        Switching focus pauses the previous task clock. The sessio keeps running.
      </p>
      <label class="pick">
        Task
        <select
          [value]="selectedKey()"
          (change)="picked.emit($any($event.target).value)"
        >
          <option value="">None — Focus &amp; Discipline only</option>
          @for (d of dailies(); track bindKey(d)) {
            <option [value]="bindKey(d)">
              @switch (d.source) {
                @case ('daily') {
                  Daily · {{ d.name }}
                }
                @case ('subtask') {
                  {{ d.journeyLabel || 'Quest' }} · {{ d.name }}
                }
                @default {
                  Quest · {{ d.name }}
                }
              }
            </option>
          }
        </select>
      </label>
      @if (canComplete()) {
        <button type="button" class="complete" (click)="complete.emit()">
          Complete {{ heading() }}
        </button>
      }
    </app-ui-scroll>
  `,
  styles: `
    .lede {
      margin: 0;
      color: #b8a878;
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .pick {
      display: grid;
      gap: 0.35rem;
      margin: 1rem 0 0;
      color: #b8a878;
      font-size: 0.82rem;
    }
    select {
      padding: 0.5rem 0.6rem;
      border: 1px solid #8a7340;
      background: rgba(18, 14, 8, 0.7);
      color: #f0e6c8;
      font: inherit;
    }
    .complete {
      margin: 1rem 0 0;
      font-family: 'Cinzel', 'Palatino Linotype', Palatino, serif;
      font-size: 0.85rem;
      padding: 0.5rem 0.8rem;
      border: 1px solid #c6a85a;
      background: rgba(212, 168, 75, 0.16);
      color: #f0e6c8;
      cursor: pointer;
    }
  `,
})
export class HorologiumTaskFocus {
  readonly heading = input('Focus a task');
  readonly dailies = input<HorologiumBoundDaily[]>([]);
  readonly selectedKey = input('');
  readonly canComplete = input(false);
  readonly closed = output<void>();
  readonly picked = output<string>();
  readonly complete = output<void>();
  protected readonly bindKey = horologiumBindKey;
}
