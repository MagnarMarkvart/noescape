import { inject, Injectable, NgZone, signal } from '@angular/core';
import { LogActivityResponse } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { ConsuetudoClockService } from '../horologium/consuetudo-clock.service';
import { HorologiumNotesService } from '../horologium/horologium-notes.service';
import { HorologiumTimerService } from '../horologium/horologium-timer.service';
import { HorologiumWatchService } from '../horologium/horologium-watch.service';
import { ClockApiService } from './clock-api.service';
import { ClockEvent, ClockKind, ClockSnapshot } from './clock.model';
import { clockSkewMs } from './clock-now';

@Injectable({ providedIn: 'root' })
export class ClockSyncService {
  private readonly api = inject(ClockApiService);
  private readonly timer = inject(HorologiumTimerService);
  private readonly consuetudo = inject(ConsuetudoClockService);
  private readonly notes = inject(HorologiumNotesService);
  private readonly watches = inject(HorologiumWatchService);
  private readonly xpFeedback = inject(XpFeedbackService);
  private readonly skills = inject(SkillsService);
  private readonly ngZone = inject(NgZone);
  private source: EventSource | null = null;
  readonly skewMs = signal(0);
  readonly hydrated = signal(false);

  constructor() {
    this.hydrate();
    this.connect();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.hydrate();
        this.connect();
      });
    }
  }

  applyEvent(event: ClockEvent, fromStream = false): void {
    if (event.snapshot?.serverNow) {
      const server = Date.parse(event.snapshot.serverNow);
      if (Number.isFinite(server)) {
        this.skewMs.set(server - Date.now());
        clockSkewMs.set(this.skewMs());
      }
    }
    this.route(event.kind, event.snapshot);
    if (fromStream || event.awards?.length || event.complete || event.jingle) {
      this.timer.handleClockFx(event);
    }
    this.publishAwards(event.awards);
    if (event.awards?.length || event.complete) {
      this.skills.invalidateTree();
      this.timer.sessionsVersion.update((n) => n + 1);
    }
  }

  private hydrate(): void {
    this.api.list().subscribe({
      next: (res) => {
        const server = Date.parse(res.serverNow);
        if (Number.isFinite(server)) {
          this.skewMs.set(server - Date.now());
          clockSkewMs.set(this.skewMs());
        }
        const byKind = new Map(res.clocks.map((c) => [c.kind, c]));
        this.route('sessio', byKind.get('sessio') ?? null);
        this.route('track', byKind.get('track') ?? null);
        this.route('consuetudo', byKind.get('consuetudo') ?? null);
        for (const clock of res.clocks) {
          if (clock.kind === 'vigilia') {
            this.route('vigilia', clock);
          }
        }
        this.hydrated.set(true);
      },
      error: () => this.hydrated.set(true),
    });
  }

  private connect(): void {
    if (typeof EventSource === 'undefined') {
      return;
    }
    this.source?.close();
    const es = new EventSource(this.api.streamUrl());
    this.source = es;
    const onSnapshot = (raw: MessageEvent) => {
      this.ngZone.run(() => {
        try {
          const event = JSON.parse(String(raw.data)) as ClockEvent;
          if (event && event.kind) {
            this.applyEvent(event, true);
          }
        } catch {
          /* ping or malformed */
        }
      });
    };
    es.addEventListener('clock.snapshot', onSnapshot);
    es.onmessage = onSnapshot;
    es.onerror = () => {
      es.close();
      this.source = null;
      window.setTimeout(() => this.connect(), 2000);
    };
  }

  private route(kind: ClockKind, snapshot: ClockSnapshot | null): void {
    this.notes.applySnapshot(kind, snapshot);
    if (kind === 'sessio' || kind === 'track') {
      this.timer.applySnapshot(snapshot, kind);
      return;
    }
    if (kind === 'consuetudo') {
      this.consuetudo.applySnapshot(snapshot);
      return;
    }
    if (kind === 'vigilia') {
      this.watches.applyClockSnapshot(snapshot);
    }
  }

  private publishAwards(awards: unknown[] | undefined): void {
    if (!awards?.length) {
      return;
    }
    for (const award of awards) {
      if (award && typeof award === 'object' && 'activity' in award) {
        this.xpFeedback.publishAward(award as LogActivityResponse);
      }
    }
  }
}
