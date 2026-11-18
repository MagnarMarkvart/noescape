import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { DEFAULT_LIST_ICON, ListDetailView, ListView } from './lists.model';
import { ListsService } from './lists.service';

type ListConfirm = { kind: 'delete'; list: ListView };

@Component({
  selector: 'app-lists-page',
  imports: [RouterLink, UiConfirm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lists-page.html',
  styleUrl: './lists-page.css',
})
export class ListsPage implements OnInit {
  private readonly api = inject(ListsService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly lists = signal<ListView[]>([]);
  protected readonly expandedListId = signal<number | null>(null);
  protected readonly expandedListDetail = signal<ListDetailView | null>(null);
  protected readonly confirm = signal<ListConfirm | null>(null);
  protected readonly busyId = signal<number | null>(null);
  protected readonly DEFAULT_ICON = DEFAULT_LIST_ICON;

  protected readonly sortedLists = computed(() =>
    [...this.lists()].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (rows) => {
        this.lists.set(rows);
        this.loading.set(false);
        this.error.set(null);

        const mainList = rows.find((list) => list.isMain);
        if (mainList && !this.expandedListId()) {
          this.expandList(mainList.id);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load lists');
      },
    });
  }

  protected toggleExpand(listId: number): void {
    if (this.expandedListId() === listId) {
      this.expandedListId.set(null);
      this.expandedListDetail.set(null);
    } else {
      this.expandList(listId);
    }
  }

  private expandList(listId: number): void {
    this.expandedListId.set(listId);
    this.api.getOne(listId).subscribe({
      next: (detail) => {
        this.expandedListDetail.set(detail);
      },
      error: () => {
        this.error.set('Could not load list details');
      },
    });
  }

  protected isExpanded(listId: number): boolean {
    return this.expandedListId() === listId;
  }

  protected navigateToDetail(listId: number, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/lists', listId]);
  }

  protected toggleItemDone(listId: number, itemId: number, done: boolean, event: Event): void {
    event.stopPropagation();
    this.api.updateItem(listId, itemId, { done: !done }).subscribe({
      next: (updated) => {
        this.expandedListDetail.set(updated);
        this.reload();
      },
      error: () => {
        this.error.set('Could not update item');
      },
    });
  }

  protected askDelete(list: ListView, event: Event): void {
    event.stopPropagation();
    this.confirm.set({ kind: 'delete', list });
  }

  protected cancelConfirm(): void {
    if (this.busyId()) {
      return;
    }
    this.confirm.set(null);
  }

  protected runConfirm(): void {
    const pending = this.confirm();
    if (!pending || this.busyId()) {
      return;
    }
    this.deleteList(pending.list);
  }

  private deleteList(list: ListView): void {
    this.busyId.set(list.id);
    this.api.remove(list.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirm.set(null);
        if (this.expandedListId() === list.id) {
          this.expandedListId.set(null);
          this.expandedListDetail.set(null);
        }
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.confirm.set(null);
        this.error.set('Could not delete list');
      },
    });
  }

  protected get confirmTitle(): string {
    const pending = this.confirm();
    if (pending && pending.kind === 'delete') {
      return `Delete "${pending.list.name}"?`;
    }
    return '';
  }

  protected get confirmMessage(): string {
    const pending = this.confirm();
    if (pending && pending.kind === 'delete') {
      return 'All items and memory will be permanently deleted';
    }
    return '';
  }
}
