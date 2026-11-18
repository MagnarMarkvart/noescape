import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { TimedToast } from '../shared/timed-toast';
import { TabulaClicker } from './tabula-clicker';
import { TabulaView } from './tabularium.model';
import { TabulariumService } from './tabularium.service';

@Component({
  selector: 'app-tabularium-page',
  imports: [UiIconBtn, TabulaClicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabularium-page.html',
  styleUrl: './tabularium-page.css',
})
export class TabulariumPage implements OnInit {
  private readonly api = inject(TabulariumService);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly items = signal<TabulaView[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.items();
    if (!q) {
      return rows;
    }
    return rows.filter((row) => {
      const hay = [row.name, row.questName ?? '', row.windowLabel]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  ngOnInit(): void {
    this.reload();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected click(row: TabulaView): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(row.id);
    this.api.click(row.id).subscribe({
      next: (next) => {
        this.patch(next);
        this.busyId.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.timed.set(err.error?.message ?? 'Could not mark');
      },
    });
  }

  protected undo(row: TabulaView): void {
    if (this.busyId()) {
      return;
    }
    this.busyId.set(row.id);
    this.api.undo(row.id).subscribe({
      next: (next) => {
        this.patch(next);
        this.busyId.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.timed.set(err.error?.message ?? 'Nothing to undo');
      },
    });
  }

  private patch(next: TabulaView): void {
    this.items.update((rows) =>
      rows.map((row) => (row.id === next.id ? next : row)),
    );
  }

  private reload(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.timed.set(err.error?.message ?? 'Could not load Tabularium');
      },
    });
  }
}
