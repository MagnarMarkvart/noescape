import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  Injectable,
  NgZone,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { UiIcon } from './ui-icon';

export type DragSortMode = 'swap' | 'insert';

export type DragSortDrop = {
  fromList: string;
  fromIndex: number;
  toList: string;
  toIndex: number;
  mode: DragSortMode;
};

type DragPoint = { list: string; index: number };

/** Move `from` to `to`. `to === items.length` (or -1) appends. */
export function moveIndex<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) {
    return items.slice();
  }
  const next = items.slice();
  const [row] = next.splice(from, 1);
  const dest = to < 0 ? next.length : Math.max(0, Math.min(to, next.length));
  next.splice(dest, 0, row);
  return next;
}

@Injectable()
export class DragSortCoordinator {
  readonly source = signal<DragPoint | null>(null);
  readonly over = signal<DragPoint | null>(null);
  readonly dragging = signal(false);
  readonly lists = new Set<string>();
  onDrop: ((event: DragSortDrop) => void) | null = null;
  moved = false;

  register(id: string): void {
    this.lists.add(id);
  }

  unregister(id: string): void {
    this.lists.delete(id);
  }

  owns(listId: string | null): boolean {
    return !!listId && this.lists.has(listId);
  }

  begin(list: string, index: number): void {
    this.source.set({ list, index });
    this.over.set({ list, index });
    this.dragging.set(true);
    this.moved = false;
    document.body.classList.add('drag-sort-active');
  }

  setOver(list: string, index: number): void {
    const cur = this.over();
    if (cur && cur.list === list && cur.index === index) {
      return;
    }
    this.over.set({ list, index });
  }

  finish(mode: DragSortMode): void {
    const source = this.source();
    const over = this.over();
    const moved = this.moved;
    this.reset();
    if (!moved || !source || !over) {
      return;
    }
    if (source.list === over.list && source.index === over.index) {
      return;
    }
    this.onDrop?.({
      fromList: source.list,
      fromIndex: source.index,
      toList: over.list,
      toIndex: over.index,
      mode,
    });
  }

  reset(): void {
    this.source.set(null);
    this.over.set(null);
    this.dragging.set(false);
    this.moved = false;
    document.body.classList.remove('drag-sort-active');
  }
}

@Component({
  selector: 'app-drop-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [DragSortCoordinator],
  template: `<ng-content />`,
  host: { class: 'drop-group' },
  styles: `
    .drop-group { display: contents; }
    .drag-grip {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6rem;
      min-height: 1.6rem;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: #b8a878;
      cursor: grab;
      touch-action: none;
    }
    .drag-grip:hover,
    .drag-grip:focus-visible {
      color: #d4a84b;
      outline: none;
    }
    body.drag-sort-active,
    body.drag-sort-active * {
      cursor: grabbing !important;
      user-select: none !important;
    }
    [data-drag-item].dragging { opacity: 0.42; }
    [data-drag-item].drag-over-swap {
      outline: 1px solid #d4a84b;
      outline-offset: 2px;
    }
    [data-drop-list].list-over {
      outline: 1px dashed rgba(212, 168, 75, 0.65);
      outline-offset: 4px;
    }
  `,
})
export class DropGroup {
  private readonly coord = inject(DragSortCoordinator);
  readonly dropped = output<DragSortDrop>();

  constructor() {
    this.coord.onDrop = (event) => this.dropped.emit(event);
  }
}

@Component({
  selector: 'app-drag-grip',
  imports: [UiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-ui-icon name="grip" />`,
  host: {
    class: 'drag-grip',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Reorder',
  },
})
export class DragGrip {}

@Directive({
  selector: '[appDropList]',
  host: {
    '[attr.data-drop-list]': 'dropListId()',
    '[class.list-over]': 'isListOver()',
  },
})
export class DropList {
  private readonly coord = inject(DragSortCoordinator);
  readonly dropListId = input.required<string>();
  readonly dropMode = input<DragSortMode>('insert');
  readonly disabled = input(false);
  private registered: string | null = null;

  protected readonly isListOver = computed(() => {
    const over = this.coord.over();
    return !!over && over.index < 0 && over.list === this.dropListId();
  });

  constructor() {
    queueMicrotask(() => {
      const id = this.dropListId();
      this.coord.register(id);
      this.registered = id;
    });
  }

  ngOnDestroy(): void {
    if (this.registered) {
      this.coord.unregister(this.registered);
    }
  }
}

@Directive({
  selector: '[appDragItem]',
  host: {
    '[attr.data-drag-item]': 'index()',
    '[attr.data-drag-list]': 'list.dropListId()',
    '[class.dragging]': 'isSource()',
    '[class.drag-over-swap]': 'isOverSwap()',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onUp($event)',
  },
})
export class DragItem {
  private readonly coord = inject(DragSortCoordinator);
  private readonly zone = inject(NgZone);
  private readonly host = inject(ElementRef<HTMLElement>);
  private capturing = false;
  protected readonly list = inject(DropList);

  readonly index = input.required<number>({ alias: 'appDragItem' });
  readonly dragDisabled = input(false);

  protected readonly isSource = computed(() => {
    const source = this.coord.source();
    return (
      !!source &&
      source.list === this.list.dropListId() &&
      source.index === this.index()
    );
  });

  protected readonly isOverSwap = computed(() => {
    const over = this.coord.over();
    const source = this.coord.source();
    if (!over || over.index < 0) {
      return false;
    }
    if (
      source &&
      source.list === over.list &&
      source.index === over.index
    ) {
      return false;
    }
    return over.list === this.list.dropListId() && over.index === this.index();
  });

  protected onDown(event: PointerEvent): void {
    if (this.dragDisabled() || this.list.disabled() || event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target?.closest('app-drag-grip')) {
      return;
    }
    event.preventDefault();
    this.capturing = true;
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.zone.run(() =>
      this.coord.begin(this.list.dropListId(), this.index()),
    );
  }

  protected onMove(event: PointerEvent): void {
    if (!this.capturing || !this.coord.dragging()) {
      return;
    }
    this.coord.moved = true;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const item = hit?.closest('[data-drag-item]') as HTMLElement | null;
    const listEl = hit?.closest('[data-drop-list]') as HTMLElement | null;
    const listId = listEl?.getAttribute('data-drop-list');
    if (!this.coord.owns(listId ?? null)) {
      return;
    }
    this.zone.run(() => {
      if (item) {
        const index = Number(item.getAttribute('data-drag-item'));
        if (Number.isFinite(index)) {
          this.coord.setOver(listId!, index);
          return;
        }
      }
      this.coord.setOver(listId!, -1);
    });
  }

  protected onUp(event: PointerEvent): void {
    if (!this.capturing) {
      return;
    }
    this.capturing = false;
    try {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const moved = this.coord.moved;
    const mode = this.list.dropMode();
    this.zone.run(() => this.coord.finish(mode));
    if (moved) {
      const block = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
        document.removeEventListener('click', block, true);
      };
      document.addEventListener('click', block, true);
    }
  }
}
