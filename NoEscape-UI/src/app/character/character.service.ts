import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';

export interface CharacterProfile {
  title: string;
  habitusUnlocked: boolean;
  totalLevel: number;
  activeQuests: number;
  completedQuests: number;
  features: Record<string, boolean>;
  skills: Array<{
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    level: number;
    category: string;
  }>;
  character: { id: number; title: string };
}

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/character`;

  getProfile() {
    return this.http.get<CharacterProfile>(this.baseUrl);
  }
}
