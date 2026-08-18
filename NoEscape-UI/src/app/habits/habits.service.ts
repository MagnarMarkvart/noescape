import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';

export interface HabitView {
  id: number;
  name: string;
  icon: string | null;
  skillId: number | null;
  skill: {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    level: number;
  } | null;
  cadence: string;
  everyNDays: number;
  wealthCents: number;
  active: boolean;
  archived: boolean;
  createdAt: string;
  totalCompletions: number;
  currentStreak: number;
  bestStreak: number;
  firstLog: string | null;
  lastLog: string | null;
  recentDates: string[];
}

export interface HabitMonthLog {
  habit: HabitView;
  year: number;
  month: number;
  days: Array<{ date: string; completed: boolean; source: string | null }>;
  completedCount: number;
}

export interface HabitRangeLog {
  habit: HabitView;
  from: string;
  to: string;
  days: Array<{ date: string; completed: boolean; source: string | null }>;
  completedCount: number;
}

@Injectable({ providedIn: 'root' })
export class HabitsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/habits`;

  private devQuery(): string {
    return isDevMode() ? '?dev=1' : '';
  }

  private devAmp(): string {
    return isDevMode() ? '&dev=1' : '';
  }

  list() {
    return this.http.get<HabitView[]>(`${this.baseUrl}${this.devQuery()}`);
  }

  progression() {
    return this.http.get<HabitView[]>(
      `${this.baseUrl}/progression${this.devQuery()}`,
    );
  }

  create(body: {
    name: string;
    icon?: string;
    skillId?: number;
    cadence?: string;
    everyNDays?: number;
    wealthCents?: number | null;
  }) {
    return this.http.post<HabitView>(
      `${this.baseUrl}${this.devQuery()}`,
      body,
    );
  }

  update(
    habitId: number,
    body: {
      skillId?: number | null;
      wealthCents?: number | null;
    },
  ) {
    return this.http.patch<HabitView>(
      `${this.baseUrl}/${habitId}${this.devQuery()}`,
      body,
    );
  }

  month(habitId: number, year: number, month: number) {
    return this.http.get<HabitMonthLog>(
      `${this.baseUrl}/${habitId}/month?year=${year}&month=${month}${this.devAmp()}`,
    );
  }

  range(habitId: number, from: string, to: string) {
    return this.http.get<HabitRangeLog>(
      `${this.baseUrl}/${habitId}/range?from=${from}&to=${to}${this.devAmp()}`,
    );
  }

  complete(habitId: number, date?: string) {
    return this.http.post(
      `${this.baseUrl}/${habitId}/complete${this.devQuery()}`,
      { date },
    );
  }

  uncomplete(habitId: number, date: string) {
    return this.http.delete(
      `${this.baseUrl}/${habitId}/complete/${encodeURIComponent(date)}${this.devQuery()}`,
    );
  }

  archive(habitId: number) {
    return this.http.patch<HabitView>(
      `${this.baseUrl}/${habitId}/archive${this.devQuery()}`,
      {},
    );
  }

  unarchive(habitId: number) {
    return this.http.patch<HabitView>(
      `${this.baseUrl}/${habitId}/unarchive${this.devQuery()}`,
      {},
    );
  }

  remove(habitId: number) {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/${habitId}${this.devQuery()}`,
    );
  }
}
