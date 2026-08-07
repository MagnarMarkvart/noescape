import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { API_BASE_URL } from '../core/api.config';
import { LogActivityResponse, XpReversalResponse } from '../skills/skill.model';
import {
  DailyBoard,
  DailyLogDetail,
  DailyLogSummary,
  DailyTaskSlot,
  DailyTaskTemplate,
  UpsertDailyTaskPayload,
} from './daily.model';

@Injectable({ providedIn: 'root' })
export class DailiesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/dailies`;
  private readonly boardCache = new Map<string, DailyBoard>();
  private readonly board$ = new Map<string, Observable<DailyBoard>>();

  peekBoard(date?: string): DailyBoard | null {
    return this.boardCache.get(this.boardKey(date)) ?? null;
  }

  getBoard(date?: string, force = false): Observable<DailyBoard> {
    const key = this.boardKey(date);
    if (!force) {
      const cached = this.boardCache.get(key);
      if (cached) {
        return of(cached);
      }
      const inflight = this.board$.get(key);
      if (inflight) {
        return inflight;
      }
    } else {
      this.board$.delete(key);
    }

    const params = date ? `?date=${encodeURIComponent(date)}` : '';
    const req$ = this.http.get<DailyBoard>(`${this.baseUrl}${params}`).pipe(
      tap((board) => {
        this.boardCache.set(key, board);
        if (board.date && board.date !== key) {
          this.boardCache.set(board.date, board);
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.board$.set(key, req$);
    return req$;
  }

  invalidateBoard(date?: string): void {
    if (date) {
      this.boardCache.delete(date);
      this.board$.delete(date);
      return;
    }
    this.boardCache.clear();
    this.board$.clear();
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
    return this.http
      .post<DailyLogDetail>(`${this.baseUrl}/seal`, { date })
      .pipe(tap((log) => this.invalidateBoard(log.date)));
  }

  copyIncomplete(date?: string, sourceDate?: string) {
    return this.http
      .post<{
        sourceDate: string;
        targetDate: string;
        copied: number;
        board: DailyBoard;
      }>(`${this.baseUrl}/copy-incomplete`, { date, sourceDate })
      .pipe(
        tap((result) => {
          this.boardCache.set(result.targetDate, result.board);
          this.board$.delete(result.targetDate);
        }),
      );
  }

  upsertSlot(payload: UpsertDailyTaskPayload) {
    return this.http
      .put<DailyTaskSlot>(`${this.baseUrl}/slots`, payload)
      .pipe(tap((slot) => this.invalidateBoard(slot.date)));
  }

  complete(id: number) {
    return this.http
      .post<{
        task: DailyTaskSlot;
        award: LogActivityResponse;
      }>(`${this.baseUrl}/${id}/complete`, {})
      .pipe(
        tap((result) => {
          this.invalidateBoard(result.task.date);
        }),
      );
  }

  uncomplete(id: number) {
    return this.http
      .post<{
        task: DailyTaskSlot;
        reversal: XpReversalResponse | null;
      }>(`${this.baseUrl}/${id}/uncomplete`, {})
      .pipe(
        tap((result) => {
          this.invalidateBoard(result.task.date);
        }),
      );
  }

  addRegularSlot(date?: string) {
    return this.http
      .post<DailyBoard>(`${this.baseUrl}/regular-slots`, { date })
      .pipe(
        tap((board) => {
          this.boardCache.set(board.date, board);
          this.board$.delete(board.date);
        }),
      );
  }

  clearSlot(id: number) {
    return this.http
      .delete<{ ok: boolean; date?: string }>(`${this.baseUrl}/${id}`)
      .pipe(tap(() => this.invalidateBoard()));
  }

  postpone(id: number, targetDate: string) {
    return this.http
      .post<{
        fromDate: string;
        toDate: string;
        board: DailyBoard;
      }>(`${this.baseUrl}/${id}/postpone`, { targetDate })
      .pipe(
        tap((result) => {
          this.invalidateBoard(result.fromDate);
          this.boardCache.set(result.toDate, result.board);
          this.board$.delete(result.toDate);
        }),
      );
  }

  listTemplates() {
    return this.http.get<DailyTaskTemplate[]>(`${this.baseUrl}/templates`);
  }

  createTemplate(body: {
    name: string;
    icon?: string;
    skillId: number;
    fixedXp: number;
    effortLevel?: number;
    durationMinutes?: number;
  }) {
    return this.http.post<DailyTaskTemplate>(
      `${this.baseUrl}/templates`,
      body,
    );
  }

  removeTemplate(id: number) {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/templates/${id}`,
    );
  }

  private boardKey(date?: string): string {
    return date ?? '__default__';
  }
}
