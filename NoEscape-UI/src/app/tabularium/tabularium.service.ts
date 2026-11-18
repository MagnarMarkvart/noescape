import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import {
  TabulaLogView,
  TabulaUpsertPayload,
  TabulaView,
} from './tabularium.model';

@Injectable({ providedIn: 'root' })
export class TabulariumService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/tabularium`;

  list(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.http.get<TabulaView[]>(`${this.baseUrl}${query}`);
  }

  getOne(id: number) {
    return this.http.get<TabulaView>(`${this.baseUrl}/${id}`);
  }

  create(body: TabulaUpsertPayload) {
    return this.http.post<TabulaView>(this.baseUrl, body);
  }

  update(id: number, body: TabulaUpsertPayload) {
    return this.http.patch<TabulaView>(`${this.baseUrl}/${id}`, body);
  }

  remove(id: number) {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/${id}`,
    );
  }

  click(id: number, delta?: number) {
    return this.http.post<TabulaView>(`${this.baseUrl}/${id}/click`, {
      delta,
    });
  }

  undo(id: number) {
    return this.http.post<TabulaView>(`${this.baseUrl}/${id}/undo`, {});
  }

  calendar(from: string, to: string) {
    return this.http.get<Array<{ date: string; count: number }>>(
      `${this.baseUrl}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  }

  log(date: string) {
    return this.http.get<TabulaLogView>(
      `${this.baseUrl}/log?date=${encodeURIComponent(date)}`,
    );
  }
}
