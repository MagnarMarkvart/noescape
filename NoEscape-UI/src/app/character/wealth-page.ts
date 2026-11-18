import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CharacterService,
  WealthEntry,
} from './character.service';
import { currencySymbol, formatMoney } from '../shared/money';
import { TimedToast } from '../shared/timed-toast';

@Component({
  selector: 'app-wealth-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wealth-page.html',
  styleUrl: './wealth-page.css',
})
export class WealthPage implements OnInit {
  private readonly character = inject(CharacterService);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly entries = signal<WealthEntry[]>([]);
  protected readonly amount = signal('');
  protected readonly note = signal('');
  protected readonly wealthLabel = this.character.wealthLabel;
  protected readonly currency = this.character.currency;

  ngOnInit(): void {
    this.character.getWealth().subscribe({
      next: (view) => {
        this.entries.set(view.entries);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.timed.set('Could not load wealth');
      },
    });
  }

  protected symbol(): string {
    return currencySymbol(this.currency());
  }

  protected setAmount(event: Event): void {
    this.amount.set((event.target as HTMLInputElement).value);
  }

  protected setNote(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  protected formatDelta(cents: number): string {
    const label = formatMoney(Math.abs(cents), this.currency());
    return cents < 0 ? `−${label}` : `+${label}`;
  }

  protected formatBalance(cents: number): string {
    return formatMoney(cents, this.currency());
  }

  protected sourceLabel(source: string): string {
    if (source === 'daily') {
      return 'Daily';
    }
    if (source === 'habit') {
      return 'Habit';
    }
    if (source === 'quest') {
      return 'Quest';
    }
    return 'Manual';
  }

  protected adjust(direction: 'add' | 'remove'): void {
    const amount = this.amount().trim();
    if (!amount) {
      this.timed.set('Enter an amount');
      return;
    }
    this.saving.set(true);
    this.character
      .adjustWealth({
        amount,
        direction,
        note: this.note().trim() || undefined,
      })
      .subscribe({
        next: (view) => {
          this.saving.set(false);
          this.entries.set(view.entries);
          this.amount.set('');
          this.note.set('');
          this.timed.set(direction === 'remove' ? 'Removed' : 'Added');
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.timed.set(err.error?.message ?? 'Could not update wealth');
        },
      });
  }
}
