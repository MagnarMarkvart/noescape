import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import { LogActivityResponse, XpReversalResponse } from '../skills/skill.model';
import { QuestView } from '../quests/quest.model';
import {
  HorologiumMode,
  HorologiumSessionRecord,
  HorologiumWatchRecord,
  HorologiumXpPreview,
  VigiliaBindKind,
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

  listSessions(limit = 40, offset = 0, date?: string) {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (date) {
      q.set('date', date);
    }
    return this.http.get<HorologiumSessionPage>(
      `${this.baseUrl}/sessions?${q.toString()}`,
    );
  }

  sessionCalendar(from: string, to: string) {
    return this.http.get<Array<{ date: string; count: number }>>(
      `${this.baseUrl}/sessions/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
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
    questRunId?: number;
    questSubtaskId?: number;
    lapIndex?: number;
    laps?: number;
    specialDrops?: boolean;
    startedAt?: string;
    watchName?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      award: LogActivityResponse;
      awards: LogActivityResponse[];
      kind: 'block';
    }>(`${this.baseUrl}/blocks`, payload);
  }

  awardGoalBonus(payload: {
    workMinutes: number;
    restMinutes: number;
    iterations: number;
    restAfterLast?: boolean;
    presetId?: string;
    startedAt?: string;
    watchName?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      award: LogActivityResponse | null;
      awards?: LogActivityResponse[];
      kind: 'goal';
    }>(`${this.baseUrl}/goal-bonus`, payload);
  }

  abandonSession(payload: {
    workMinutes: number;
    restMinutes: number;
    iterations: number;
    completedBlocks: number;
    presetId?: string;
    startedAt?: string;
    watchName?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      reversal: XpReversalResponse | null;
      xpRemoved: number;
      unfinishedSplits: number;
      blockXp: number;
      kind: 'abandon';
    }>(`${this.baseUrl}/abandon`, payload);
  }

  completeTask(payload: {
    workMinutes: number;
    restMinutes: number;
    iterations: number;
    mode: HorologiumMode;
    completedBlocks: number;
    elapsedMinutes: number;
    questRunId: number;
    questSubtaskId?: number;
    endSession: boolean;
    disciplineGranted?: boolean;
    specialLapsAwarded?: number;
    presetId?: string;
    startedAt?: string;
    watchName?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      awards: LogActivityResponse[];
      kind: 'task' | 'task_early';
      endedEarly: boolean;
      elapsedMinutes: number;
      taskLabel: string;
      focusXp: number;
      disciplineXp: number;
      specialXp: number;
      quest: QuestView;
    }>(`${this.baseUrl}/complete-task`, payload);
  }

  closeEarly(payload: {
    workMinutes: number;
    restMinutes: number;
    iterations: number;
    elapsedMinutes: number;
    completedBlocks: number;
    questRunId?: number;
    taskLabel?: string;
    presetId?: string;
    startedAt?: string;
    watchName?: string;
  }) {
    return this.http.post<{
      session: HorologiumSessionRecord;
      kind: 'task_early';
      endedEarly: true;
    }>(`${this.baseUrl}/close-early`, payload);
  }

  listWatches(status = 'ACTIVE') {
    return this.http.get<HorologiumWatchRecord[]>(
      `${this.baseUrl}/watches`,
      { params: { status } },
    );
  }

  createWatch(
    name: string,
    scriptoriumWorkId?: number,
    bind?: {
      bindKind?: VigiliaBindKind;
      questId?: number;
      questSubtaskId?: number;
      dailyTaskId?: number;
    },
  ) {
    return this.http.post<HorologiumWatchRecord>(`${this.baseUrl}/watches`, {
      name,
      ...(scriptoriumWorkId ? { scriptoriumWorkId } : {}),
      ...(bind ?? {}),
    });
  }

  completeWatch(id: number) {
    return this.http.post<HorologiumWatchRecord>(
      `${this.baseUrl}/watches/${id}/complete`,
      {},
    );
  }

  updateWatch(
    id: number,
    payload: {
      name?: string;
      elapsedMs?: number;
      running?: boolean;
      status?: string;
    },
  ) {
    return this.http.patch<HorologiumWatchRecord>(
      `${this.baseUrl}/watches/${id}`,
      payload,
    );
  }

  archiveWatch(id: number) {
    return this.http.post<HorologiumWatchRecord>(
      `${this.baseUrl}/watches/${id}/archive`,
      {},
    );
  }
}
