import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import {
  ListDetailView,
  ListItemMemoryView,
  ListView,
  ListUpsertPayload,
} from './lists.model';

@Injectable({ providedIn: 'root' })
export class ListsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/lists`;

  list() {
    return this.http.get<ListView[]>(this.baseUrl);
  }

  getOne(id: number) {
    return this.http.get<ListDetailView>(`${this.baseUrl}/${id}`);
  }

  create(body: ListUpsertPayload) {
    return this.http.post<ListView>(this.baseUrl, body);
  }

  update(id: number, body: ListUpsertPayload) {
    return this.http.patch<ListView>(`${this.baseUrl}/${id}`, body);
  }

  remove(id: number) {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/${id}`,
    );
  }

  addItem(id: number, title: string) {
    return this.http.post<ListDetailView>(`${this.baseUrl}/${id}/items`, {
      title,
    });
  }

  updateItem(
    id: number,
    itemId: number,
    body: { title?: string; done?: boolean },
  ) {
    return this.http.patch<ListDetailView>(
      `${this.baseUrl}/${id}/items/${itemId}`,
      body,
    );
  }

  removeItem(id: number, itemId: number) {
    return this.http.delete<ListDetailView>(
      `${this.baseUrl}/${id}/items/${itemId}`,
    );
  }

  reorderItems(id: number, ids: number[]) {
    return this.http.patch<ListDetailView>(
      `${this.baseUrl}/${id}/items/order`,
      { ids },
    );
  }

  getMemory(id: number, query?: string) {
    const url = query
      ? `${this.baseUrl}/${id}/memory?query=${encodeURIComponent(query)}`
      : `${this.baseUrl}/${id}/memory`;
    return this.http.get<ListItemMemoryView[]>(url);
  }

  removeMemory(id: number, memoryId: number) {
    return this.http.delete<ListDetailView>(
      `${this.baseUrl}/${id}/memory/${memoryId}`,
    );
  }

  restoreMemory(id: number, memoryId: number) {
    return this.http.post<ListDetailView>(
      `${this.baseUrl}/${id}/memory/${memoryId}/restore`,
      {},
    );
  }
}
