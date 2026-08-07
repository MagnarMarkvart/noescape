import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import { ActiveQuestSummary, QuestView } from './quest.model';

@Injectable({ providedIn: 'root' })
export class QuestsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/quests`;

  /** Sidebar cache of active IRL goals. */
  readonly activeQuests = signal<ActiveQuestSummary[]>([]);

  list(filter = 'all') {
    return this.http.get<QuestView[]>(
      `${this.baseUrl}?filter=${encodeURIComponent(filter)}`,
    );
  }

  refreshActive() {
    return this.http.get<ActiveQuestSummary[]>(`${this.baseUrl}/active`).pipe(
      tap((rows) => this.activeQuests.set(rows)),
    );
  }

  getOne(id: number) {
    return this.http.get<QuestView>(`${this.baseUrl}/${id}`);
  }

  create(body: {
    name: string;
    summary?: string;
    description?: string;
    tier?: string;
    skillSlug?: string;
  }) {
    return this.http.post<QuestView>(this.baseUrl, body);
  }

  start(id: number) {
    return this.http.post<QuestView>(`${this.baseUrl}/${id}/start`, {}).pipe(
      tap(() => void this.refreshActive().subscribe()),
    );
  }

  logDay(runId: number, result: 'CLEAN' | 'BROKEN', note?: string) {
    return this.http
      .post<{
        streakCount: number;
        completed: boolean;
        xpAwarded: number;
        unlocked: string[];
        awards: import('../skills/skill.model').LogActivityResponse[];
        quest: QuestView;
      }>(`${this.baseUrl}/runs/${runId}/log`, { result, note })
      .pipe(tap(() => void this.refreshActive().subscribe()));
  }
}
