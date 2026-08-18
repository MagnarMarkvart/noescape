import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import {
  DateFormatId,
  DEFAULT_TZ,
  formatIsoDate,
  isDateFormat,
  isWeekStart,
  todayInZone,
  WeekStart,
} from '../shared/time';
import {
  CurrencyId,
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrency,
} from '../shared/money';

export interface CharacterProfile {
  title: string;
  nickname: string;
  timezone: string;
  dateFormat: DateFormatId;
  weekStartsOn: WeekStart;
  menuAutoToggleMobile: boolean;
  menuAutoToggleDesktop: boolean;
  wealthCents: number;
  currency: CurrencyId;
  habitusUnlocked: boolean;
  consuetudoUnlocked: boolean;
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

export interface WealthEntry {
  id: number;
  date: string;
  deltaCents: number;
  balanceCents: number;
  note: string | null;
  source: string;
  sourceId: number | null;
  createdAt: string;
}

export interface WealthView {
  wealthCents: number;
  currency: CurrencyId;
  entries: WealthEntry[];
}

@Injectable({ providedIn: 'root' })
export class CharacterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${API_BASE_URL}/character`;

  readonly nickname = signal('');
  readonly timezone = signal(DEFAULT_TZ);
  readonly dateFormat = signal<DateFormatId>('DMY');
  readonly weekStartsOn = signal<WeekStart>(1);
  readonly menuAutoToggleMobile = signal(true);
  readonly menuAutoToggleDesktop = signal(true);
  readonly wealthCents = signal(0);
  readonly currency = signal<CurrencyId>(DEFAULT_CURRENCY);
  readonly todayIso = computed(() => todayInZone(this.timezone()));
  readonly wealthLabel = computed(() =>
    formatMoney(this.wealthCents(), this.currency()),
  );

  getProfile() {
    return this.http.get<CharacterProfile>(this.baseUrl).pipe(
      tap((p) => this.applyProfile(p)),
    );
  }

  updateSettings(body: {
    nickname?: string;
    timezone?: string;
    dateFormat?: DateFormatId;
    weekStartsOn?: WeekStart;
    menuAutoToggleMobile?: boolean;
    menuAutoToggleDesktop?: boolean;
    currency?: CurrencyId;
  }) {
    return this.http
      .patch<CharacterProfile>(`${this.baseUrl}/settings`, body)
      .pipe(tap((p) => this.applyProfile(p)));
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) {
      return '';
    }
    return formatIsoDate(iso, this.dateFormat());
  }

  private applyProfile(p: CharacterProfile): void {
    this.nickname.set((p.nickname || '').trim());
    const tz = (p.timezone || DEFAULT_TZ).trim();
    this.timezone.set(tz || DEFAULT_TZ);
    this.dateFormat.set(isDateFormat(p.dateFormat) ? p.dateFormat : 'DMY');
    const start = Number(p.weekStartsOn);
    this.weekStartsOn.set(isWeekStart(start) ? start : 1);
    this.menuAutoToggleMobile.set(p.menuAutoToggleMobile !== false);
    this.menuAutoToggleDesktop.set(p.menuAutoToggleDesktop !== false);
    this.wealthCents.set(Math.round(Number(p.wealthCents) || 0));
    this.currency.set(isCurrency(p.currency) ? p.currency : DEFAULT_CURRENCY);
  }

  getWealth() {
    return this.http.get<WealthView>(`${this.baseUrl}/wealth`).pipe(
      tap((view) => {
        this.wealthCents.set(Math.round(Number(view.wealthCents) || 0));
        this.currency.set(
          isCurrency(view.currency) ? view.currency : DEFAULT_CURRENCY,
        );
      }),
    );
  }

  adjustWealth(body: {
    amount: number | string;
    direction: 'add' | 'remove';
    note?: string;
  }) {
    return this.http.post<WealthView>(`${this.baseUrl}/wealth`, body).pipe(
      tap((view) => {
        this.wealthCents.set(Math.round(Number(view.wealthCents) || 0));
        this.currency.set(
          isCurrency(view.currency) ? view.currency : DEFAULT_CURRENCY,
        );
      }),
    );
  }
}
