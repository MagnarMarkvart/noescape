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
import { UiConfirm } from '../shared/ui/ui-confirm';
import {
  DEFAULT_LIST_ICON,
  ListDetailView,
  ListItemMemoryView,
  ListItemView,
} from './lists.model';
import { ListsService } from './lists.service';

type ItemConfirm = { kind: 'delete-item'; item: ListItemView };

@Component({
  selector: 'app-list-detail-page',
  imports: [RouterLink, FormsModule, UiConfirm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-detail-page.html',
  styleUrl: './list-detail-page.css',
})
export class ListDetailPage implements OnInit {
  private readonly api = inject(ListsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly list = signal<ListDetailView | null>(null);
  protected readonly newItemTitle = signal('');
  protected readonly isEditing = signal(false);
  protected readonly editName = signal('');
  protected readonly editIcon = signal('');
  protected readonly confirm = signal<ItemConfirm | null>(null);
  protected readonly busyItemId = signal<number | null>(null);
  protected readonly DEFAULT_ICON = DEFAULT_LIST_ICON;

  protected readonly activeItems = computed(() =>
    (this.list()?.items ?? []).filter((item) => !item.done),
  );

  protected readonly doneItems = computed(() =>
    (this.list()?.items ?? []).filter((item) => item.done),
  );

  protected readonly filteredSuggestions = computed(() => {
    const query = this.newItemTitle().trim().toLowerCase();
    if (!query || !this.list()) {
      return [];
    }
    return (this.list()?.memory ?? [])
      .filter((mem) => mem.title.toLowerCase().includes(query))
      .slice(0, 5);
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === 'new') {
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
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load list. Is the backend running?');
      },
    });
  }

  private createNewList(): void {
    this.isEditing.set(true);
    this.editName.set('');
    this.editIcon.set(DEFAULT_LIST_ICON);
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
      icon: this.editIcon().trim() || null,
    };

    if (!this.list()) {
      this.api.create(payload).subscribe({
        next: (created) => {
          void this.router.navigate(['/lists', created.id], {
            replaceUrl: true,
          });
          this.loadList(created.id);
        },
        error: () => {
          this.error.set('Could not create list.');
        },
      });
    } else {
      this.api.update(this.list()!.id, payload).subscribe({
        next: () => {
          this.isEditing.set(false);
          this.reload();
        },
        error: () => {
          this.error.set('Could not update list.');
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

    this.api.addItem(list.id, title).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.newItemTitle.set('');
        this.error.set(null);
      },
      error: () => {
        this.error.set('Could not add item.');
      },
    });
  }

  protected toggleItemDone(item: ListItemView): void {
    const list = this.list();
    if (!list) {
      return;
    }

    this.busyItemId.set(item.id);
    this.api.updateItem(list.id, item.id, { done: !item.done }).subscribe({
      next: (updated) => {
        this.list.set(updated);
        this.busyItemId.set(null);
        this.error.set(null);
      },
      error: () => {
        this.busyItemId.set(null);
        this.error.set('Could not update item.');
      },
    });
  }

  protected askDeleteItem(item: ListItemView): void {
    this.confirm.set({ kind: 'delete-item', item });
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
    this.deleteItem(pending.item);
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
        this.error.set('Could not delete item.');
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
      error: () => {
        this.error.set('Could not restore item from memory.');
      },
    });
  }

  protected toggleSuggestions(): void {
    const list = this.list();
    if (!list) {
      return;
    }

    this.api
      .update(list.id, { suggestionsEnabled: !list.suggestionsEnabled })
      .subscribe({
        next: () => {
          this.reload();
        },
        error: () => {
          this.error.set('Could not update suggestions setting.');
        },
      });
  }

  protected get confirmTitle(): string {
    const pending = this.confirm();
    if (pending && pending.kind === 'delete-item') {
      return `Delete "${pending.item.title}"?`;
    }
    return '';
  }

  protected get confirmMessage(): string {
    return 'This item will be removed from the list. The memory entry will remain.';
  }
}
