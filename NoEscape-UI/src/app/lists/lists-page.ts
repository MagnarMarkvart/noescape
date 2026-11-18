import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RuneCheck } from '../shared/rune-check';
import { DEFAULT_LIST_ICON, ListDetailView, ListView } from './lists.model';
import { ListsService } from './lists.service';

@Component({
  selector: 'app-lists-page',
  imports: [RouterLink, RuneCheck],
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

  protected toggleItemDone(listId: number, itemId: number, done: boolean, _checked?: boolean): void {

    const currentDetail = this.expandedListDetail();
    if (!currentDetail) {
      return;
    }

    const optimisticDetail = { ...currentDetail };
    optimisticDetail.items = currentDetail.items.map((item) =>
      item.id === itemId ? { ...item, done: !done } : item,
    );
    this.expandedListDetail.set(optimisticDetail);

    const optimisticLists = this.lists().map((list) => {
      if (list.id !== listId) {
        return list;
      }
      return {
        ...list,
        activeCount: done ? list.activeCount + 1 : list.activeCount - 1,
        doneCount: done ? list.doneCount - 1 : list.doneCount + 1,
      };
    });
    this.lists.set(optimisticLists);

    this.api.updateItem(listId, itemId, { done: !done }).subscribe({
      next: (updated) => {
        this.expandedListDetail.set(updated);
      },
      error: () => {
        this.expandedListDetail.set(currentDetail);
        this.reload();
        this.error.set('Could not update item');
      },
    });
  }
}
