import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import { LogActivityResponse } from '../skills/skill.model';
import {
  HorologiumMode,
  HorologiumSessionRecord,
  HorologiumXpPreview,
} from './horologium.model';

export interface HorologiumSessionPage {
  items: HorologiumSessionRecord[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class HorologiumApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/horologium`;

  listSessions(limit = 40, offset = 0) {
    return this.http.get<HorologiumSessionPage>(
      `${this.baseUrl}/sessions?limit=${limit}&offset=${offset}`,
    );
  }

  /** Convenience: only the rows (Acta uses top 3). */
  listSessionItems(limit = 40, offset = 0) {
    return this.listSessions(limit, offset).pipe(map((p) => p.items));
  }

  preview(
    workMinutes: number,
    restMinutes: number,
    iterations: number,
    mode: HorologiumMode,
  ) {
    const params = new URLSearchParams({
      workMinutes: String(workMinutes),
      restMinutes: String(restMinutes),
      iterations: String(iterations),
      mode,
    });
    return this.http.get<HorologiumXpPreview>(
      `${this.baseUrl}/preview?${params.toString()}`,
    );
  }

  awardBlock(payload: {
    workMinutes: number;
    restMinutes: number;
    mode: HorologiumMode;
    presetId?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      award: LogActivityResponse;
      kind: 'block';
    }>(`${this.baseUrl}/blocks`, payload);
  }

  awardGoalBonus(payload: {
    workMinutes: number;
    restMinutes: number;
    iterations: number;
    restAfterLast?: boolean;
    presetId?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      award: LogActivityResponse | null;
      kind: 'goal';
    }>(`${this.baseUrl}/goal-bonus`, payload);
  }
}
