import { computed, inject, Injectable, signal } from '@angular/core';
import { ClockApiService } from '../clocks/clock-api.service';
import { ClockKind, ClockSnapshot } from '../clocks/clock.model';

const EMPTY: Record<ClockKind, string> = {
  sessio: '',
  track: '',
  consuetudo: '',
  vigilia: '',
};

@Injectable({ providedIn: 'root' })
export class HorologiumNotesService {
  private readonly api = inject(ClockApiService);
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private dirtyKind: ClockKind | null = null;

  readonly kind = signal<ClockKind>('sessio');
  readonly open = signal(false);
  private readonly textByKind = signal<Record<ClockKind, string>>({ ...EMPTY });

  readonly text = computed(() => this.textByKind()[this.kind()]);

  setKind(kind: ClockKind): void {
    this.kind.set(kind);
  }

  toggleOpen(): void {
    this.open.update((open) => !open);
  }

  openOnDesktop(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.matchMedia('(min-width: 900px)').matches) {
      this.open.set(true);
    }
  }

  setText(value: string): void {
    const kind = this.kind();
    const notes = String(value ?? '').slice(0, 4000);
    this.textByKind.update((map) => ({ ...map, [kind]: notes }));
    this.dirtyKind = kind;
    if (this.debounce) {
      clearTimeout(this.debounce);
    }
    this.debounce = setTimeout(() => this.flush(), 400);
  }

  applySnapshot(kind: ClockKind, snapshot: ClockSnapshot | null): void {
    if (kind === 'vigilia') {
      return;
    }
    if (this.dirtyKind === kind) {
      if (snapshot && !snapshot.notes && this.textByKind()[kind]) {
        this.flush();
      }
      return;
    }
    this.textByKind.update((map) => ({
      ...map,
      [kind]: snapshot?.notes ?? '',
    }));
  }

  private flush(): void {
    this.debounce = null;
    const kind = this.dirtyKind ?? this.kind();
    const notes = this.textByKind()[kind];
    this.api.patchNotes(kind, notes).subscribe({
      next: () => {
        if (this.dirtyKind === kind) {
          this.dirtyKind = null;
        }
      },
      error: () => {
        /* No live clock yet — keep the draft until one exists. */
      },
    });
  }
}
