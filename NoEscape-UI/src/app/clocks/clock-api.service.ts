import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import {
  ClockBoundDaily,
  ClockEvent,
  ClockKind,
  ClockList,
  ClockSnapshot,
} from './clock.model';
import { HorologiumConfig } from '../horologium/horologium.model';

@Injectable({ providedIn: 'root' })
export class ClockApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/clocks`;

  list() {
    return this.http.get<ClockList>(this.baseUrl);
  }

  streamUrl(): string {
    return `${this.baseUrl}/stream`;
  }

  startSessio(
    kind: 'sessio' | 'track',
    body: HorologiumConfig & {
      presetId?: string;
      watchName?: string | null;
      watchId?: number | null;
      boundDaily?: ClockBoundDaily | null;
    },
  ) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/${kind}/start`, body);
  }

  startConsuetudo(routineId: number) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/consuetudo/start`, {
      routineId,
    });
  }

  startVigilia(watchId: number) {
    return this.http.post<ClockSnapshot>(`${this.baseUrl}/vigilia/start`, {
      watchId,
    });
  }

  pauseVigilia(watchId: number) {
    return this.http.post<ClockSnapshot>(`${this.baseUrl}/vigilia/pause`, {
      watchId,
    });
  }

  pause(kind: ClockKind) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/${kind}/pause`, {});
  }

  resume(kind: ClockKind) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/${kind}/resume`, {});
  }

  skip(kind: ClockKind) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/${kind}/skip`, {});
  }

  completeStep() {
    return this.http.post<ClockEvent>(
      `${this.baseUrl}/consuetudo/complete-step`,
      {},
    );
  }

  skipStep() {
    return this.http.post<ClockEvent>(
      `${this.baseUrl}/consuetudo/skip-step`,
      {},
    );
  }

  stop(kind: ClockKind) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/${kind}/stop`, {});
  }

  completeTask(kind: 'sessio' | 'track', endSession: boolean) {
    return this.http.post<ClockEvent>(`${this.baseUrl}/${kind}/complete-task`, {
      endSession,
    });
  }

  patchNotes(kind: ClockKind, notes: string) {
    return this.http.patch<ClockEvent>(`${this.baseUrl}/${kind}/notes`, {
      notes,
    });
  }

  patchBoundDaily(kind: 'sessio' | 'track', boundDaily: ClockBoundDaily | null) {
    return this.http.patch<ClockEvent>(`${this.baseUrl}/${kind}/bound-daily`, {
      boundDaily,
    });
  }
}
