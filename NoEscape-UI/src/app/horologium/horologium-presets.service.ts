import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { switchMap, tap } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import {
  HOROLOGIUM_PRESETS,
  HorologiumPreset,
} from './horologium.model';

export interface HorologiumPresetRecord {
  id: number;
  label: string;
  workMinutes: number;
  restMinutes: number;
  iterations: number;
  restAfterLast: boolean;
  sortOrder: number;
}

export type HorologiumPresetPayload = {
  label: string;
  workMinutes: number;
  restMinutes: number;
  iterations: number;
  restAfterLast: boolean;
};

export function mapPreset(row: HorologiumPresetRecord): HorologiumPreset {
  return {
    id: String(row.id),
    label: row.label,
    description: `${row.workMinutes} / ${row.restMinutes} · ${row.iterations}`,
    config: {
      workMinutes: row.workMinutes,
      restMinutes: row.restMinutes,
      iterations: row.iterations,
      restAfterLast: row.restAfterLast,
    },
  };
}

@Injectable({ providedIn: 'root' })
export class HorologiumPresetsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/horologium/presets`;

  readonly rows = signal<HorologiumPresetRecord[]>([]);
  readonly list = signal<HorologiumPreset[]>(HOROLOGIUM_PRESETS);

  constructor() {
    this.reload().subscribe({ error: () => undefined });
  }

  reload() {
    return this.http.get<HorologiumPresetRecord[]>(this.baseUrl).pipe(
      tap((rows) => {
        this.rows.set(rows);
        this.list.set(rows.length ? rows.map(mapPreset) : HOROLOGIUM_PRESETS);
      }),
    );
  }

  create(body: HorologiumPresetPayload) {
    return this.http
      .post<HorologiumPresetRecord>(this.baseUrl, body)
      .pipe(switchMap(() => this.reload()));
  }

  update(id: number, body: HorologiumPresetPayload) {
    return this.http
      .patch<HorologiumPresetRecord>(`${this.baseUrl}/${id}`, body)
      .pipe(switchMap(() => this.reload()));
  }

  remove(id: number) {
    return this.http
      .delete<{ deleted: boolean; id: number }>(`${this.baseUrl}/${id}`)
      .pipe(switchMap(() => this.reload()));
  }
}
