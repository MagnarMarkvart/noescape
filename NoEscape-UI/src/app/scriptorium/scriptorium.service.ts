import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import {
  ScriptoriumDueView,
  ScriptoriumUpsertPayload,
  ScriptoriumWorkView,
} from './scriptorium.model';

@Injectable({ providedIn: 'root' })
export class ScriptoriumService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/scriptorium`;

  list(status = 'OPEN') {
    return this.http.get<ScriptoriumWorkView[]>(
      `${this.baseUrl}?status=${encodeURIComponent(status)}`,
    );
  }

  dueSoon(days = 14) {
    return this.http.get<ScriptoriumDueView[]>(
      `${this.baseUrl}/due?days=${days}`,
    );
  }

  getOne(id: number) {
    return this.http.get<ScriptoriumWorkView>(`${this.baseUrl}/${id}`);
  }

  create(body: ScriptoriumUpsertPayload) {
    return this.http.post<ScriptoriumWorkView>(this.baseUrl, body);
  }

  update(id: number, body: ScriptoriumUpsertPayload) {
    return this.http.patch<ScriptoriumWorkView>(`${this.baseUrl}/${id}`, body);
  }

  remove(id: number) {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/${id}`,
    );
  }

  addSubtask(id: number, title: string) {
    return this.http.post<ScriptoriumWorkView>(
      `${this.baseUrl}/${id}/subtasks`,
      { title },
    );
  }

  updateSubtask(
    id: number,
    subId: number,
    body: { title?: string; done?: boolean },
  ) {
    return this.http.patch<ScriptoriumWorkView>(
      `${this.baseUrl}/${id}/subtasks/${subId}`,
      body,
    );
  }

  removeSubtask(id: number, subId: number) {
    return this.http.delete<ScriptoriumWorkView>(
      `${this.baseUrl}/${id}/subtasks/${subId}`,
    );
  }
}
