import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CharacterService } from '../character/character.service';
import { QuestsService } from '../quests/quests.service';
import { TimedToast } from '../shared/timed-toast';
import {
  CONSUETUDO_DEMO_ROUTINE,
  CONSUETUDO_UNLOCK_QUEST_SLUG,
} from './consuetudo-demo';
import { formatSignedDelta } from './consuetudo-xp';
import { RoutineAccess, RoutineView, RoutinesService } from './routines.service';

@Component({
  selector: 'app-consuetudo-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consuetudo-page.html',
  styleUrl: './consuetudo-page.css',
  host: {
    '[class.demo]': 'demo()',
  },
})
export class ConsuetudoPage implements OnInit {
  private readonly routines = inject(RoutinesService);
  private readonly character = inject(CharacterService);
  private readonly quests = inject(QuestsService);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly demo = toSignal(
    this.route.data.pipe(map((d) => d['demo'] === true)),
    { initialValue: this.route.snapshot.data['demo'] === true },
  );
  protected readonly unlockQuestPath = signal('/quests');
  protected readonly rows = signal<RoutineView[]>([]);
  protected readonly access = signal<RoutineAccess | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = this.timed.value;
  protected readonly formatDelta = formatSignedDelta;

  ngOnInit(): void {
    this.quests.list('all').subscribe({
      next: (quests) => {
        const q = quests.find((r) => r.slug === CONSUETUDO_UNLOCK_QUEST_SLUG);
        if (q) {
          this.unlockQuestPath.set(`/quests/${q.id}`);
        }
      },
    });
    if (this.demo()) {
      this.rows.set([CONSUETUDO_DEMO_ROUTINE]);
      this.access.set({
        unlocked: false,
        questActive: false,
        open: false,
        canCreate: false,
        count: 0,
      });
      return;
    }
    this.reload();
  }

  protected formatDate(iso: string): string {
    return this.character.formatDate(iso);
  }

  protected plannedLabel(routine: RoutineView): string {
    const minutes = routine.steps.reduce(
      (sum, step) => sum + step.durationMinutes,
      0,
    );
    return `${routine.steps.length} steps · ${minutes}m`;
  }

  private reload(): void {
    this.routines.access().subscribe({
      next: (access) => this.access.set(access),
      error: () => this.access.set(null),
    });
    this.routines.list().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.error.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.error.set(err.error?.message ?? 'Could not load Consuetudo.');
      },
    });
  }
}
