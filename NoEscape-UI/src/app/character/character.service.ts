import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import { DEFAULT_TZ, todayInZone } from '../shared/time';

export interface CharacterProfile {
  title: string;
  nickname: string;
  timezone: string;
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
  character: { id: number; title: string; nickname?: string; timezone?: string };
}

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/character`;

  readonly nickname = signal('');
  readonly timezone = signal(DEFAULT_TZ);
  readonly todayIso = computed(() => todayInZone(this.timezone()));

  getProfile() {
    return this.http.get<CharacterProfile>(this.baseUrl).pipe(
      tap((p) => this.applyProfile(p)),
    );
  }

  updateSettings(body: { nickname?: string; timezone?: string }) {
    return this.http
      .patch<CharacterProfile>(`${this.baseUrl}/settings`, body)
      .pipe(tap((p) => this.applyProfile(p)));
  }

  private applyProfile(p: CharacterProfile): void {
    this.nickname.set((p.nickname || '').trim());
    const tz = (p.timezone || DEFAULT_TZ).trim();
    this.timezone.set(tz || DEFAULT_TZ);
  }
}
