import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { tap } from 'rxjs';
import { API_BASE_URL } from '../core/api.config';
import {
  civilDateInZone,
  clampDayStartHour,
  DateFormatId,
  DEFAULT_TZ,
  formatIsoDate,
  formatTimeInZone,
  isDateFormat,
  isTimeFormat,
  isWeekStart,
  TimeFormatId,
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
  timeFormat: TimeFormatId;
  dayStartHour: number;
  weekStartsOn: WeekStart;
  menuAutoToggleMobile: boolean;
  menuAutoToggleDesktop: boolean;
  pomodoroAutoContinue: boolean;
  consuetudoStartInScenery: boolean;
  vigiliaTrackQuests: boolean;
  vigiliaTrackDailies: boolean;
  vigiliaTrackScriptorium: boolean;
  vigiliaTrackCustom: boolean;
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
  private readonly clockTick = signal(Date.now());

  readonly nickname = signal('');
  readonly timezone = signal(DEFAULT_TZ);
  readonly dateFormat = signal<DateFormatId>('DMY');
  readonly timeFormat = signal<TimeFormatId>('H24');
  readonly dayStartHour = signal(0);
  readonly weekStartsOn = signal<WeekStart>(1);
  readonly menuAutoToggleMobile = signal(true);
  readonly menuAutoToggleDesktop = signal(true);
  readonly pomodoroAutoContinue = signal(true);
  readonly consuetudoStartInScenery = signal(true);
  readonly vigiliaTrackQuests = signal(true);
  readonly vigiliaTrackDailies = signal(false);
  readonly vigiliaTrackScriptorium = signal(false);
  readonly vigiliaTrackCustom = signal(false);
  readonly vigiliaEnabled = computed(
    () =>
      this.vigiliaTrackQuests() ||
      this.vigiliaTrackDailies() ||
      this.vigiliaTrackScriptorium() ||
      this.vigiliaTrackCustom(),
  );
  readonly wealthCents = signal(0);
  readonly currency = signal<CurrencyId>(DEFAULT_CURRENCY);
  readonly todayIso = computed(() =>
    civilDateInZone(
      this.timezone(),
      this.dayStartHour(),
      new Date(this.clockTick()),
    ),
  );
  readonly wealthLabel = computed(() =>
    formatMoney(this.wealthCents(), this.currency()),
  );

  constructor() {
    const id = setInterval(() => this.clockTick.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  getProfile() {
    return this.http.get<CharacterProfile>(this.baseUrl).pipe(
      tap((p) => this.applyProfile(p)),
    );
  }

  updateSettings(body: {
    nickname?: string;
    timezone?: string;
    dateFormat?: DateFormatId;
    timeFormat?: TimeFormatId;
    dayStartHour?: number;
    weekStartsOn?: WeekStart;
    menuAutoToggleMobile?: boolean;
    menuAutoToggleDesktop?: boolean;
    pomodoroAutoContinue?: boolean;
    consuetudoStartInScenery?: boolean;
    vigiliaTrackQuests?: boolean;
    vigiliaTrackDailies?: boolean;
    vigiliaTrackScriptorium?: boolean;
    vigiliaTrackCustom?: boolean;
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

  civilDate(input: Date | string = new Date()): string {
    return civilDateInZone(this.timezone(), this.dayStartHour(), input);
  }

  formatTime(input: Date | string): string {
    return formatTimeInZone(input, this.timezone(), this.timeFormat());
  }

  /** Civil log date plus clock, e.g. 16.08.2026 05:00 when start of day is 06:00. */
  formatDateTime(input: Date | string): string {
    return `${this.formatDate(this.civilDate(input))} ${this.formatTime(input)}`;
  }

  private applyProfile(p: CharacterProfile): void {
    this.nickname.set((p.nickname || '').trim());
    const tz = (p.timezone || DEFAULT_TZ).trim();
    this.timezone.set(tz || DEFAULT_TZ);
    this.dateFormat.set(isDateFormat(p.dateFormat) ? p.dateFormat : 'DMY');
    this.timeFormat.set(isTimeFormat(p.timeFormat) ? p.timeFormat : 'H24');
    this.dayStartHour.set(clampDayStartHour(p.dayStartHour));
    const start = Number(p.weekStartsOn);
    this.weekStartsOn.set(isWeekStart(start) ? start : 1);
    this.menuAutoToggleMobile.set(p.menuAutoToggleMobile !== false);
    this.menuAutoToggleDesktop.set(p.menuAutoToggleDesktop !== false);
    this.pomodoroAutoContinue.set(p.pomodoroAutoContinue !== false);
    this.consuetudoStartInScenery.set(p.consuetudoStartInScenery !== false);
    this.vigiliaTrackQuests.set(p.vigiliaTrackQuests !== false);
    this.vigiliaTrackDailies.set(p.vigiliaTrackDailies === true);
    this.vigiliaTrackScriptorium.set(p.vigiliaTrackScriptorium === true);
    this.vigiliaTrackCustom.set(p.vigiliaTrackCustom === true);
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
