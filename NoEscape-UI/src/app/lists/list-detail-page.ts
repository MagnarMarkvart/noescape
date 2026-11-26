import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { RuneCheck } from '../shared/rune-check';
import { UiConfirm } from '../shared/ui/ui-confirm';
import {
  DEFAULT_LIST_ICON,
  LIST_ICON_CHOICES,
  ListDetailView,
  ListItemMemoryView,
  ListItemView,
} from './lists.model';
import { ListsService } from './lists.service';
import { onRemoteChange } from '../core/data-sync';

/** One row of the unified history: a done item and/or its memory entry. */
export interface HistoryRow {
  key: string;
  title: string;
  doneItem: ListItemView | null;
  memory: ListItemMemoryView | null;
  active: boolean;
}

type ItemConfirm =
  | { kind: 'delete-item'; item: ListItemView }
  | { kind: 'delete-history'; row: HistoryRow };

const norm = (title: string): string => title.trim().toLowerCase();

@Component({
  selector: 'app-list-detail-page',
  imports: [RouterLink, FormsModule, UiConfirm, RuneCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-detail-page.html',
  styleUrl: './list-detail-page.css',
})
export class ListDetailPage implements OnInit {
  /** Refetch when another device changes this data (server SSE). */
  private readonly remoteSync = onRemoteChange(['lists'], () => {
    this.reload();
  });

  private readonly api = inject(ListsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly list = signal<ListDetailView | null>(null);
  protected readonly newItemTitle = signal('');
  protected readonly memoryQuery = signal('');
  protected readonly isEditing = signal(false);
  protected readonly editName = signal('');
  protected readonly editIcon = signal('');
  protected readonly editIsMain = signal(false);
  protected readonly confirm = signal<ItemConfirm | null>(null);
  protected readonly busyItemId = signal<number | null>(null);
  protected readonly isUpdating = signal(false);
  protected readonly DEFAULT_ICON = DEFAULT_LIST_ICON;
  protected readonly ICON_CHOICES = LIST_ICON_CHOICES;
  protected readonly isNew = signal(false);
  protected readonly deleting = signal(false);

  protected readonly activeItems = computed(() =>
    (this.list()?.items ?? []).filter((item) => !item.done),
  );

  protected readonly doneItems = computed(() =>
    (this.list()?.items ?? []).filter((item) => item.done),
  );

  protected readonly filteredSuggestions = computed(() => {
    const query = this.newItemTitle().trim().toLowerCase();
    const memories = this.list()?.memory ?? [];
    const activeItems = this.activeItems();
    const activeTitlesNormalized = new Set(
      activeItems.map((item) => item.title.trim().toLowerCase()),
    );

    const availableMemories = memories.filter(
      (mem) => !activeTitlesNormalized.has(mem.title.trim().toLowerCase()),
    );

    if (!query) {
      return availableMemories.slice(0, 5);
    }
    return availableMemories
      .filter((mem) => mem.title.toLowerCase().includes(query))
      .slice(0, 5);
  });

  /** Done items and memory entries merged by normalized title. */
  protected readonly historyRows = computed<HistoryRow[]>(() => {
    const list = this.list();
    if (!list) {
      return [];
    }
    const activeKeys = new Set(
      list.items.filter((i) => !i.done).map((i) => norm(i.title)),
    );
    const rows = new Map<string, HistoryRow>();
    for (const item of list.items.filter((i) => i.done)) {
      const key = norm(item.title);
      if (!rows.has(key)) {
        rows.set(key, {
          key,
          title: item.title,
          doneItem: item,
          memory: null,
          active: activeKeys.has(key),
        });
      }
    }
    for (const mem of list.memory) {
      const key = norm(mem.title);
      const row = rows.get(key);
      if (row) {
        row.memory = mem;
      } else {
        rows.set(key, {
          key,
          title: mem.title,
          doneItem: null,
          memory: mem,
          active: activeKeys.has(key),
        });
      }
    }
    // Items that are back on the list live in Active; history shows the rest.
    return [...rows.values()].filter((row) => row.doneItem || !row.active);
  });

  protected readonly filteredHistory = computed(() => {
    const query = this.memoryQuery().trim().toLowerCase();
    const rows = this.historyRows();
    return query
      ? rows.filter((row) => row.title.toLowerCase().includes(query))
      : rows;
  });

  ngOnInit(): void {
    // The 'lists/new' route has no :id param, so paramMap.get('id') is null.
    // Number(null) === 0 used to fail the id check and bounce back to /lists.
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === null || idParam === 'new') {
      this.createNewList();
      return;
    }
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      void this.router.navigate(['/lists'], { replaceUrl: true });
      return;
    }
    this.loadList(id);
  }

  protected reload(): void {
    const list = this.list();
    if (!list) {
      return;
    }
    this.loadList(list.id);
  }

  private loadList(id: number): void {
    this.loading.set(true);
    this.api.getOne(id).subscribe({
      next: (data) => {
        this.list.set(data);
        this.title.setTitle(`${data.name} — Inventarium — No Escape`);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load list');
      },
    });
  }

  private createNewList(): void {
    this.isNew.set(true);
    this.isEditing.set(true);
    this.editName.set('');
    this.editIcon.set(DEFAULT_LIST_ICON);
    this.editIsMain.set(false);
    this.loading.set(false);
  }

  protected startEdit(): void {
    const list = this.list();
    if (!list) {
      return;
    }
    this.isEditing.set(true);
    this.editName.set(list.name);
    this.editIcon.set(list.icon || DEFAULT_LIST_ICON);
    this.editIsMain.set(list.isMain);
  }

  protected pickIcon(icon: string): void {
    this.editIcon.set(icon);
  }

  protected deleteList(): void {
    const list = this.list();
    if (!list || this.deleting()) {
      return;
    }
    const ok = window.confirm(
      `Delete "${list.name}"? All items and memory will be permanently deleted.`,
    );
    if (!ok) {
      return;
    }
    this.deleting.set(true);
    this.api.remove(list.id).subscribe({
      next: () => {
        this.deleting.set(false);
        void this.router.navigate(['/lists'], { replaceUrl: true });
      },
      error: () => {
        this.deleting.set(false);
        this.error.set('Could not delete list');
      },
    });
  }

  protected cancelEdit(): void {
    if (!this.list()) {
      void this.router.navigate(['/lists']);
      return;
    }
    this.isEditing.set(false);
  }

  protected saveList(): void {
    const name = this.editName().trim();
    if (!name) {
      this.error.set('Name is required');
      return;
    }

    const payload = {
      name,
      icon: this.editIcon().trim().slice(0, 16) || null,
      isMain: this.editIsMain(),
    };

    if (!this.list()) {
      this.api.create(payload).subscribe({
        next: () => {
          void this.router.navigate(['/lists'], { replaceUrl: true });
        },
        error: (err: { error?: { message?: string } }) => {
          this.error.set(err?.error?.message ?? 'Could not create list');
        },
      });
    } else {
      this.api.update(this.list()!.id, payload).subscribe({
        next: () => {
          this.isEditing.set(false);
          this.reload();
        },
        error: () => {
          this.error.set('Could not update list');
        },
      });
    }
  }

  protected addItem(): void {
    const list = this.list();
    if (!list) {
      return;
    }

    const title = this.newItemTitle().trim();
    if (!title) {
      return;
    }

    this.isUpdating.set(true);
    this.api.addItem(list.id, title).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.newItemTitle.set('');
        this.error.set(null);
        this.isUpdating.set(false);
      },
      error: (err) => {
        this.isUpdating.set(false);
        const message =
          err?.error?.message ?? 'Could not add item';
        this.error.set(message);
      },
    });
  }

  protected toggleItemDone(item: ListItemView): void {
    if (this.busyItemId()) {
      return;
    }

    const list = this.list();
    if (!list) {
      return;
    }

    const optimisticList = { ...list };
    optimisticList.items = list.items.map((i) =>
      i.id === item.id ? { ...i, done: !i.done } : i,
    );
    this.list.set(optimisticList);

    this.busyItemId.set(item.id);
    this.api.updateItem(list.id, item.id, { done: !item.done }).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.busyItemId.set(null);
        this.error.set(null);
      },
      error: () => {
        this.list.set(list);
        this.busyItemId.set(null);
        this.error.set('Could not update item');
      },
    });
  }

  protected askDeleteItem(item: ListItemView): void {
    this.confirm.set({ kind: 'delete-item', item });
  }

  protected askDeleteHistory(row: HistoryRow): void {
    this.confirm.set({ kind: 'delete-history', row });
  }

  protected cancelConfirm(): void {
    if (this.busyItemId()) {
      return;
    }
    this.confirm.set(null);
  }

  protected runConfirm(): void {
    const pending = this.confirm();
    if (!pending || this.busyItemId()) {
      return;
    }
    if (pending.kind === 'delete-item') {
      this.deleteItem(pending.item);
    } else if (pending.kind === 'delete-history') {
      // The API removes the memory entry and done rows together either way.
      if (pending.row.memory) {
        this.deleteMemory(pending.row.memory);
      } else if (pending.row.doneItem) {
        this.deleteItem(pending.row.doneItem);
      }
    }
  }

  private deleteItem(item: ListItemView): void {
    const list = this.list();
    if (!list) {
      return;
    }

    this.busyItemId.set(item.id);
    this.api.removeItem(list.id, item.id).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.busyItemId.set(null);
        this.confirm.set(null);
        this.error.set(null);
      },
      error: () => {
        this.busyItemId.set(null);
        this.confirm.set(null);
        this.error.set('Could not delete item');
      },
    });
  }

  private deleteMemory(memory: ListItemMemoryView): void {
    const list = this.list();
    if (!list) {
      return;
    }

    this.busyItemId.set(memory.id);
    this.api.removeMemory(list.id, memory.id).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.busyItemId.set(null);
        this.confirm.set(null);
        this.error.set(null);
      },
      error: () => {
        this.busyItemId.set(null);
        this.confirm.set(null);
        this.error.set('Could not delete memory entry');
      },
    });
  }

  protected selectSuggestion(memory: ListItemMemoryView): void {
    const list = this.list();
    if (!list) {
      return;
    }

    this.api.restoreMemory(list.id, memory.id).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.newItemTitle.set('');
        this.error.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Could not restore item');
      },
    });
  }

  protected restoreMemory(memory: ListItemMemoryView): void {
    this.selectSuggestion(memory);
  }

  protected toggleSuggestions(): void {
    const list = this.list();
    if (!list) {
      return;
    }

    const optimisticList = {
      ...list,
      suggestionsEnabled: !list.suggestionsEnabled,
      memory: !list.suggestionsEnabled ? list.memory : [],
    };
    this.list.set(optimisticList);

    this.api
      .update(list.id, { suggestionsEnabled: !list.suggestionsEnabled })
      .subscribe({
        next: () => {
          this.reload();
        },
        error: () => {
          this.list.set(list);
          this.error.set('Could not update suggestions');
        },
      });
  }

  protected get confirmTitle(): string {
    const pending = this.confirm();
    if (pending && pending.kind === 'delete-item') {
      return `Delete "${pending.item.title}"?`;
    }
    if (pending && pending.kind === 'delete-history') {
      return `Delete "${pending.row.title}" from history?`;
    }
    return '';
  }

  protected get confirmMessage(): string {
    const pending = this.confirm();
    if (pending && pending.kind === 'delete-item') {
      return 'The item is removed and forgotten (it leaves history and suggestions).';
    }
    if (pending && pending.kind === 'delete-history') {
      return 'Its done entries and memory are deleted, so it is no longer suggested.';
    }
    return '';
  }
}
