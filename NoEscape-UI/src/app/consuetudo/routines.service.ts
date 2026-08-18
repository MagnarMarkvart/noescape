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

export interface RoutineCompletePayload {
  steps: Array<{
    stepId?: number | null;
    title: string;
    icon?: string | null;
    plannedSeconds: number;
    elapsedMs: number;
    outcome: 'COMPLETED' | 'SKIPPED';
  }>;
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

  complete(id: number, body: RoutineCompletePayload) {
    return this.http.post<RoutineCompleteResponse>(
      `${this.baseUrl}/${id}/complete${this.devQuery()}`,
      body,
    );
  }
}
