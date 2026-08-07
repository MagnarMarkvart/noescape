import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { TimedToast } from '../shared/timed-toast';
import { DEFAULT_HABIT_ICON, HABIT_ICON_GROUPS } from './habit-icons';
import { HabitsService } from './habits.service';

@Component({
  selector: 'app-habitus-new-page',
  imports: [RouterLink, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './habitus-new-page.html',
  styleUrl: './habitus-new-page.css',
})
export class HabitusNewPage {
  private readonly habitsService = inject(HabitsService);
  private readonly router = inject(Router);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly iconGroups = HABIT_ICON_GROUPS;
  protected readonly iconGroupId = signal(HABIT_ICON_GROUPS[0].id);
  protected readonly creating = signal(false);

  protected readonly createModel = signal({
    name: '',
    icon: DEFAULT_HABIT_ICON,
    cadence: 'DAILY',
    everyNDays: 1,
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
  });

  protected readonly activeIconGroup = computed(
    () =>
      this.iconGroups.find((g) => g.id === this.iconGroupId()) ??
      this.iconGroups[0],
  );

  protected pickIcon(glyph: string): void {
    this.createModel.update((m) => ({ ...m, icon: glyph }));
  }

  protected setIconGroup(id: string): void {
    this.iconGroupId.set(id);
  }

  protected create(): void {
    void submit(this.createForm, async () => {
      const m = this.createModel();
      this.creating.set(true);
      this.habitsService
        .create({
          name: m.name.trim(),
          icon: m.icon.trim() || DEFAULT_HABIT_ICON,
          cadence: m.cadence,
          everyNDays: Number(m.everyNDays) || 1,
        })
        .subscribe({
          next: () => {
            this.creating.set(false);
            void this.router.navigate(['/habitus']);
          },
          error: (err: { error?: { message?: string } }) => {
            this.creating.set(false);
            this.timed.set(err.error?.message ?? 'Create failed');
          },
        });
    });
  }
}
