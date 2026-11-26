import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';

export type PalmaresUnit = 'seconds' | 'reps' | 'kg' | 'm';

export type PalmaresAttempt = {
  id: number;
  value: number;
  date: string;
  note: string;
  isPb: boolean;
  xpAwarded: number;
  createdAt: string;
};

export type PalmaresRecord = {
  id: number;
  name: string;
  icon: string | null;
  unit: PalmaresUnit;
  higherIsBetter: boolean;
  target: number | null;
  skillSlug: string | null;
  archived: boolean;
  best: number | null;
  bestDate: string | null;
  targetMet: boolean;
  attemptCount: number;
  last: PalmaresAttempt | null;
  attempts: PalmaresAttempt[];
};

export type RecordInput = Partial<Pick<PalmaresRecord, 'name' | 'icon' | 'unit' | 'higherIsBetter' | 'target' | 'skillSlug' | 'archived'>>;

export type AttemptResult = {
  record: PalmaresRecord;
  attempt: PalmaresAttempt;
  pb: boolean;
  firstAttempt: boolean;
  targetReached: boolean;
  xp: number;
  award: unknown;
};

export const UNIT_LABEL: Record<PalmaresUnit, string> = { seconds: 's', reps: 'reps', kg: 'kg', m: 'm' };

@Injectable({ providedIn: 'root' })
export class PalmaresService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/palmares`;

  list() {
    return this.http.get<PalmaresRecord[]>(this.base);
  }
  create(input: RecordInput) {
    return this.http.post<PalmaresRecord>(this.base, input);
  }
  update(id: number, input: RecordInput) {
    return this.http.patch<PalmaresRecord>(`${this.base}/${id}`, input);
  }
  remove(id: number) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/${id}`);
  }
  addAttempt(id: number, value: number, note = '') {
    return this.http.post<AttemptResult>(`${this.base}/${id}/attempts`, { value, note });
  }
  removeAttempt(attemptId: number) {
    return this.http.delete<PalmaresRecord>(`${this.base}/attempts/${attemptId}`);
  }
}
