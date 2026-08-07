import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';
import { LogActivityResponse, Skill, SkillTree } from './skill.model';

@Injectable({ providedIn: 'root' })
export class SkillsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/skills`;

  getTree() {
    return this.http.get<SkillTree>(`${this.baseUrl}/tree`);
  }

  getAll() {
    return this.http.get<Skill[]>(this.baseUrl);
  }

  getOne(id: number) {
    return this.http.get<Skill>(`${this.baseUrl}/${id}`);
  }

  logActivity(skillId: number, xpGained: number, note?: string, duration?: number) {
    return this.http.post<LogActivityResponse>(`${this.baseUrl}/${skillId}/activities`, {
      xpGained,
      note,
      duration,
    });
  }
}
