import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HorologiumApiService } from './horologium-api.service';
import { HorologiumSessionRecord } from './horologium.model';

const PAGE_SIZE = 15;

@Component({
  selector: 'app-horologium-log-page',
  imports: [RouterLink, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './horologium-log-page.html',
  styleUrl: './horologium-log-page.css',
})
export class HorologiumLogPage implements OnInit {
  private readonly api = inject(HorologiumApiService);

  protected readonly items = signal<HorologiumSessionRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly loading = signal(true);

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / PAGE_SIZE)),
  );

  ngOnInit(): void {
    this.load(0);
  }

  protected prev(): void {
    if (this.page() <= 0) {
      return;
    }
    this.load(this.page() - 1);
  }

  protected next(): void {
    if (this.page() + 1 >= this.pageCount()) {
      return;
    }
    this.load(this.page() + 1);
  }

  private load(page: number): void {
    this.loading.set(true);
    this.api.listSessions(PAGE_SIZE, page * PAGE_SIZE).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.page.set(page);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
