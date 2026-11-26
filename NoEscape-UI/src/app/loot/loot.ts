import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL } from '../core/api.config';

export type LootDrop = {
  id: number;
  roll: number;
  key: string;
  name: string;
  icon: string;
  tier: string;
  flavor?: string;
  xpGained: number;
  createdAt: string;
  firstFind?: boolean;
};

export type LootItemView = {
  key: string;
  name: string;
  icon: string;
  tier: string;
  flavor: string;
  from: number;
  to: number;
  odds: number;
  count: number;
  lastFoundAt: string | null;
};

export type LootCollection = {
  rollMax: number;
  totalRolls: number;
  items: LootItemView[];
  recent: LootDrop[];
};

export const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique'];

/** Live loot drops (pushed over the clock SSE stream) and the collection API. */
@Injectable({ providedIn: 'root' })
export class LootService {
  private readonly http = inject(HttpClient);
  readonly toasts = signal<LootDrop[]>([]);
  private readonly seen = new Set<number>();

  push(raw: unknown): void {
    const drop = raw as LootDrop | null;
    if (!drop || typeof drop.id !== 'number' || this.seen.has(drop.id)) {
      return;
    }
    this.seen.add(drop.id);
    this.toasts.update((list) => [...list, drop].slice(-4));
    const rank = TIER_ORDER.indexOf(drop.tier);
    const ms = rank >= 2 ? 7000 : 3500;
    setTimeout(() => this.dismiss(drop.id), ms);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((d) => d.id !== id));
  }

  collection() {
    return this.http.get<LootCollection>(`${API_BASE_URL}/loot`);
  }
}
