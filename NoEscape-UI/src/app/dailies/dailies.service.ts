import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import {
  DailyBoard,
  DailyLogDetail,
  DailyLogSummary,
  DailyTaskSlot,
  UpsertDailyTaskPayload,
} from './daily.model';

@Injectable({ providedIn: 'root' })
export class DailiesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/dailies`;

  getBoard(date?: string) {
    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.http.get<DailyBoard>(`${this.baseUrl}${params}`);
  }

  listLogs() {
    return this.http.get<DailyLogSummary[]>(`${this.baseUrl}/logs`);
  }

  getLog(date: string) {
    return this.http.get<DailyLogDetail>(
      `${this.baseUrl}/logs/${encodeURIComponent(date)}`,
    );
  }

  sealDay(date?: string) {
    return this.http.post<DailyLogDetail>(`${this.baseUrl}/seal`, { date });
  }

  copyIncomplete(date?: string, sourceDate?: string) {
    return this.http.post<{
      sourceDate: string;
      targetDate: string;
      copied: number;
      board: DailyBoard;
    }>(`${this.baseUrl}/copy-incomplete`, { date, sourceDate });
  }

  upsertSlot(payload: UpsertDailyTaskPayload) {
    return this.http.put<DailyTaskSlot>(`${this.baseUrl}/slots`, payload);
  }

  complete(id: number) {
    return this.http.post<{
      task: DailyTaskSlot;
      award: {
        leveledUp: boolean;
        levelsGained: number;
        skill: { name: string; level: number };
        activity: { xpGained: number };
      };
    }>(`${this.baseUrl}/${id}/complete`, {});
  }

  uncomplete(id: number) {
    return this.http.post<{
      task: DailyTaskSlot;
      reversal: { xpRemoved: number; leveledDown: boolean } | null;
    }>(`${this.baseUrl}/${id}/uncomplete`, {});
  }

  addRegularSlot(date?: string) {
    return this.http.post<DailyBoard>(`${this.baseUrl}/regular-slots`, { date });
  }

  clearSlot(id: number) {
    return this.http.delete<{ ok: boolean }>(`${this.baseUrl}/${id}`);
  }

  postpone(id: number, targetDate: string) {
    return this.http.post<{
      fromDate: string;
      toDate: string;
      board: DailyBoard;
    }>(`${this.baseUrl}/${id}/postpone`, { targetDate });
  }
}
