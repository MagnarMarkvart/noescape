import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import { TabulaPeriod, TabulaPolarity, TabulaTone } from '../tabularium/tabularium.model';

export type HabitKind = 'check' | 'tally';
export type HabitQuestRule = 'COUNT' | 'STREAK' | 'WINDOW';
export type HabitQuestTarget = 'JOURNEY' | 'SUBTASK';

export interface HabitQuestEventView {
  id?: number;
  date: string;
  success: boolean;
  kind: string;
  tallyInBand: boolean;
  note: string | null;
}

export interface HabitQuestLinkView {
  questId: number;
  questName: string | null;
  target: HabitQuestTarget;
  subtaskId: number | null;
  subtaskTitle: string | null;
  rule: HabitQuestRule;
  requiredCount: number;
  windowDays: number | null;
  progress: number;
  completed: boolean;
  events: HabitQuestEventView[];
}

export interface HabitGroupView {
  id: number;
  name: string;
  sortOrder: number;
}

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
  kind: HabitKind;
  skillWeights: Array<{ slug: string; weight: number }>;
  effortLevel: number;
  durationMinutes: number;
  allowInDailies: boolean;
  period: TabulaPeriod;
  polarity: TabulaPolarity;
  normMin: number;
  normMax: number;
  step: number;
  questId: number | null;
  questName: string | null;
  sortOrder: number;
  doneToday: boolean;
  successfulToday: boolean;
  dueToday: boolean;
  groupId: number | null;
  groupName: string | null;
  questLink: HabitQuestLinkView | null;
  count: number;
  tone: TabulaTone | null;
  windowFrom: string;
  windowTo: string;
  windowLabel: string;
}

export interface HabitQuestLinkBody {
  questId: number;
  target?: HabitQuestTarget;
  subtaskId?: number | null;
  rule?: HabitQuestRule;
  requiredCount?: number;
  windowDays?: number | null;
}

export interface HabitWriteBody {
  name?: string;
  icon?: string;
  skillId?: number | null;
  cadence?: string;
  everyNDays?: number;
  wealthCents?: number | null;
  skillWeights?: Array<{ slug: string; weight: number }>;
  effortLevel?: number;
  durationMinutes?: number;
  allowInDailies?: boolean;
  kind?: HabitKind;
  period?: TabulaPeriod;
  polarity?: TabulaPolarity;
  normMin?: number;
  normMax?: number;
  step?: number;
  questId?: number | null;
  groupId?: number | null;
  questLink?: HabitQuestLinkBody | null;
}

export interface HabitActionResult {
  habit: HabitView | null;
  awards?: unknown[];
  removed?: boolean;
  date?: string;
}

export interface HabitMonthLog {
  habit: HabitView;
  year: number;
  month: number;
  days: Array<{
    date: string;
    completed: boolean;
    source: string | null;
    count: number;
  }>;
  completedCount: number;
}

export interface HabitRangeLog {
  habit: HabitView;
  from: string;
  to: string;
  days: Array<{
    date: string;
    completed: boolean;
    source: string | null;
    count: number;
  }>;
  completedCount: number;
}

export type HabitStatsGrain = 'day' | 'week' | 'month' | 'year' | 'all';

export interface HabitStats {
  from: string;
  to: string;
  grain: HabitStatsGrain;
  points: number;
  completions: number;
  clicks: number;
  series: Array<{ key: string; label: string; value: number }>;
  days: Array<{
    date: string;
    points: number;
    completions: number;
    clicks: number;
    marks?: Array<{ id: number; icon: string | null; done: boolean }>;
  }>;
  habits: Array<{
    id: number;
    name: string;
    icon: string | null;
    kind: HabitKind;
    questName: string | null;
    points: number;
    completions: number;
    clicks: number;
  }>;
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

  listGroups() {
    return this.http.get<HabitGroupView[]>(`${this.baseUrl}/groups`);
  }

  createGroup(name: string) {
    return this.http.post<HabitGroupView>(`${this.baseUrl}/groups`, { name });
  }

  renameGroup(id: number, name: string) {
    return this.http.patch<HabitGroupView>(`${this.baseUrl}/groups/${id}`, {
      name,
    });
  }

  removeGroup(id: number) {
    return this.http.delete<{ deleted: boolean; id: number }>(
      `${this.baseUrl}/groups/${id}`,
    );
  }

  place(habitId: number, groupId: number | null, sortOrder?: number) {
    return this.http.patch<HabitView>(
      `${this.baseUrl}/${habitId}/place${this.devQuery()}`,
      { groupId, sortOrder },
    );
  }

  upsertQuestLink(habitId: number, link: HabitQuestLinkBody | null) {
    return this.http.patch<HabitView>(
      `${this.baseUrl}/${habitId}/quest-link${this.devQuery()}`,
      link ?? { clear: true },
    );
  }

  getOne(habitId: number) {
    return this.http.get<HabitView>(
      `${this.baseUrl}/${habitId}${this.devQuery()}`,
    );
  }

  stats(input: {
    from?: string;
    to?: string;
    ids?: number[];
    grain?: HabitStatsGrain;
  }) {
    const params = new URLSearchParams();
    if (input.from) params.set('from', input.from);
    if (input.to) params.set('to', input.to);
    if (input.ids?.length) params.set('ids', input.ids.join(','));
    if (input.grain) params.set('grain', input.grain);
    const q = params.toString();
    const join = q ? `?${q}${isDevMode() ? '&dev=1' : ''}` : this.devQuery();
    return this.http.get<HabitStats>(`${this.baseUrl}/stats${join}`);
  }

  create(body: HabitWriteBody) {
    return this.http.post<HabitView>(
      `${this.baseUrl}${this.devQuery()}`,
      body,
    );
  }

  update(habitId: number, body: HabitWriteBody) {
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
    return this.http.post<HabitActionResult>(
      `${this.baseUrl}/${habitId}/complete${this.devQuery()}`,
      { date },
    );
  }

  uncomplete(habitId: number, date: string) {
    return this.http.delete<HabitActionResult>(
      `${this.baseUrl}/${habitId}/complete/${encodeURIComponent(date)}${this.devQuery()}`,
    );
  }

  click(habitId: number, delta?: number) {
    return this.http.post<HabitActionResult>(
      `${this.baseUrl}/${habitId}/click${this.devQuery()}`,
      { delta },
    );
  }

  undo(habitId: number) {
    return this.http.post<HabitActionResult>(
      `${this.baseUrl}/${habitId}/undo${this.devQuery()}`,
      {},
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
