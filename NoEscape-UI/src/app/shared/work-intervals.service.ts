import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import { WorkIntervalRecord, WorkIntervalTarget } from './work-interval.model';

/** Read-only client for the append-only WorkInterval log (Phase E: same log shown everywhere). */
@Injectable({ providedIn: 'root' })
export class WorkIntervalsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/work-intervals`;

  list(target: WorkIntervalTarget) {
    const params: Record<string, string> = {};
    if (target.dailyTaskId != null) params['dailyTaskId'] = String(target.dailyTaskId);
    if (target.questSubtaskId != null) params['questSubtaskId'] = String(target.questSubtaskId);
    if (target.questId != null) params['questId'] = String(target.questId);
    if (target.scriptoriumWorkId != null)
      params['scriptoriumWorkId'] = String(target.scriptoriumWorkId);
    if (target.watchId != null) params['watchId'] = String(target.watchId);
    return this.http.get<WorkIntervalRecord[]>(this.baseUrl, { params });
  }
}
