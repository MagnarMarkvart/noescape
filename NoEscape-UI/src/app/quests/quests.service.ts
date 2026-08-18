import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import {
  ActiveQuestSummary,
  CreateQuestPayload,
  QuestView,
} from './quest.model';

@Injectable({ providedIn: 'root' })
export class QuestsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/quests`;
  private readonly fullCache = new Map<number, QuestView>();

  /** Sidebar cache of active IRL goals. */
  readonly activeQuests = signal<ActiveQuestSummary[]>([]);

  peekFull(id: number): QuestView | null {
    return this.fullCache.get(id) ?? null;
  }

  list(filter = 'all') {
    return this.http.get<QuestView[]>(
      `${this.baseUrl}?filter=${encodeURIComponent(filter)}`,
    ).pipe(
      tap((rows) => {
        for (const q of rows) {
          if (!this.fullCache.has(q.id)) {
            this.fullCache.set(q.id, q);
          }
        }
      }),
    );
  }

  refreshActive() {
    return this.http.get<ActiveQuestSummary[]>(`${this.baseUrl}/active`).pipe(
      tap((rows) => this.activeQuests.set(rows)),
    );
  }

  getOne(id: number) {
    return this.http.get<QuestView>(`${this.baseUrl}/${id}`).pipe(
      tap((q) => this.fullCache.set(q.id, q)),
    );
  }

  create(body: CreateQuestPayload) {
    return this.http.post<QuestView>(this.baseUrl, body).pipe(
      tap((q) => this.fullCache.set(q.id, q)),
    );
  }

  update(id: number, body: CreateQuestPayload) {
    return this.http.patch<QuestView>(`${this.baseUrl}/${id}`, body).pipe(
      tap((q) => this.fullCache.set(q.id, q)),
    );
  }

  start(id: number) {
    return this.http.post<QuestView>(`${this.baseUrl}/${id}/start`, {}).pipe(
      tap((q) => this.fullCache.set(q.id, q)),
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
      .pipe(
        tap((res) => this.fullCache.set(res.quest.id, res.quest)),
        tap(() => void this.refreshActive().subscribe()),
      );
  }

  logJourney(runId: number, body: { date?: string; note?: string; done?: boolean }) {
    return this.http
      .post<{ logged: boolean; date: string; quest: QuestView }>(
        `${this.baseUrl}/runs/${runId}/journey`,
        body,
      )
      .pipe(
        tap((res) => this.fullCache.set(res.quest.id, res.quest)),
        tap(() => void this.refreshActive().subscribe()),
      );
  }

  toggleSubtask(runId: number, subtaskId: number, completed: boolean) {
    return this.http
      .post<QuestView>(`${this.baseUrl}/runs/${runId}/subtasks/${subtaskId}`, {
        completed,
      })
      .pipe(
        tap((q) => this.fullCache.set(q.id, q)),
        tap(() => void this.refreshActive().subscribe()),
      );
  }

  patchSubtaskElapsed(runId: number, subtaskId: number, elapsedMs: number) {
    return this.http.patch<{
      runId: number;
      subtaskId: number;
      elapsedMs: number;
      done: boolean;
    }>(`${this.baseUrl}/runs/${runId}/subtasks/${subtaskId}/elapsed`, {
      elapsedMs,
    });
  }

  completeDestination(runId: number) {
    return this.http
      .post<{
        completed: boolean;
        unlocked: string[];
        awards: import('../skills/skill.model').LogActivityResponse[];
        quest: QuestView;
      }>(`${this.baseUrl}/runs/${runId}/destination`, {})
      .pipe(
        tap((res) => this.fullCache.set(res.quest.id, res.quest)),
        tap(() => void this.refreshActive().subscribe()),
      );
  }
}
