import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import { LogActivityResponse } from '../skills/skill.model';

export interface RoutineStepView {
  id: number;
  title: string;
  icon: string | null;
  durationMinutes: number;
  sortOrder: number;
}

export interface RoutineStepLogView {
  id: number;
  stepId: number | null;
  title: string;
  icon: string | null;
  plannedSeconds: number;
  elapsedMs: number;
  outcome: 'COMPLETED' | 'SKIPPED' | string;
  deltaMs: number;
  sortOrder: number;
}

export interface RoutineRunView {
  id: number;
  date: string;
  startedAt: string;
  completedAt: string | null;
  skippedCount: number;
  completedCount: number;
  plannedSeconds: number;
  elapsedMs: number;
  baseXp: number;
  bonusXp: number;
  xpAwarded: number;
  notes?: string;
  steps: RoutineStepLogView[];
}

export interface RoutineView {
  id: number;
  name: string;
  icon: string | null;
  effortLevel: number;
  skillWeights: Array<{ slug: string; weight: number }>;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  steps: RoutineStepView[];
  runs: RoutineRunView[];
}

export interface RoutineAccess {
  unlocked: boolean;
  questActive: boolean;
  open: boolean;
  canCreate: boolean;
  count: number;
}

export interface RoutineWritePayload {
  name: string;
  icon?: string | null;
  effortLevel: number;
  skillWeights: Array<{ slug: string; weight: number }>;
  steps: Array<{
    title: string;
    icon?: string | null;
    durationMinutes: number;
  }>;
}

export type RoutineWalkRow = RoutineRunView & {
  routineId: number;
  routineName: string;
  routineIcon: string | null;
};

export interface RoutineCompletePayload {
  steps: Array<{
    stepId?: number | null;
    title: string;
    icon?: string | null;
    plannedSeconds: number;
    elapsedMs: number;
    outcome: 'COMPLETED' | 'SKIPPED';
  }>;
  notes?: string;
}

export interface RoutineCompleteResponse {
  run: RoutineRunView;
  awards: LogActivityResponse[];
  baseXp: number;
  bonusXp: number;
  xpAwarded: number;
}

@Injectable({ providedIn: 'root' })
export class RoutinesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/routines`;

  private devQuery(): string {
    return isDevMode() ? '?dev=1' : '';
  }

  access() {
    return this.http.get<RoutineAccess>(
      `${this.baseUrl}/access${this.devQuery()}`,
    );
  }

  list() {
    return this.http.get<RoutineView[]>(`${this.baseUrl}${this.devQuery()}`);
  }

  getOne(id: number) {
    return this.http.get<RoutineView>(
      `${this.baseUrl}/${id}${this.devQuery()}`,
    );
  }

  create(body: RoutineWritePayload) {
    return this.http.post<RoutineView>(
      `${this.baseUrl}${this.devQuery()}`,
      body,
    );
  }

  update(id: number, body: RoutineWritePayload) {
    return this.http.patch<RoutineView>(
      `${this.baseUrl}/${id}${this.devQuery()}`,
      body,
    );
  }

  remove(id: number) {
    return this.http.delete<{ ok: boolean }>(
      `${this.baseUrl}/${id}${this.devQuery()}`,
    );
  }

  listRuns(date?: string, limit = 50, offset = 0) {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (date) {
      q.set('date', date);
    }
    if (isDevMode()) {
      q.set('dev', '1');
    }
    return this.http.get<{
      items: RoutineWalkRow[];
      total: number;
    }>(`${this.baseUrl}/runs?${q.toString()}`);
  }

  runCalendar(from: string, to: string) {
    const q = new URLSearchParams({ from, to });
    if (isDevMode()) {
      q.set('dev', '1');
    }
    return this.http.get<Array<{ date: string; count: number }>>(
      `${this.baseUrl}/runs/calendar?${q.toString()}`,
    );
  }

  complete(id: number, body: RoutineCompletePayload) {
    return this.http.post<RoutineCompleteResponse>(
      `${this.baseUrl}/${id}/complete${this.devQuery()}`,
      body,
    );
  }
}
