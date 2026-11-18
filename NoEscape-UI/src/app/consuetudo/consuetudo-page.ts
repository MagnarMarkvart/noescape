import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CharacterService } from '../character/character.service';
import { QuestsService } from '../quests/quests.service';
import { UiIcon } from '../shared/ui/ui-icon';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { UiScroll } from '../shared/ui/ui-scroll';
import { TimedToast } from '../shared/timed-toast';
import {
  CONSUETUDO_DEMO_ROUTINE,
  CONSUETUDO_UNLOCK_QUEST_SLUG,
} from './consuetudo-demo';
import { formatSignedDelta } from './consuetudo-xp';
import { RoutineAccess, RoutineView, RoutinesService } from './routines.service';

@Component({
  selector: 'app-consuetudo-page',
  imports: [RouterLink, UiIcon, UiIconBtn, UiScroll],
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
  private readonly router = inject(Router);
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
  protected readonly openWalks = signal<Record<number, boolean>>({});
  protected readonly notesText = signal<string | null>(null);

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

  protected isWalkOpen(id: number): boolean {
    return this.openWalks()[id] === true;
  }

  protected toggleWalk(id: number): void {
    this.openWalks.update((map) => ({ ...map, [id]: !map[id] }));
  }

  protected openNotes(notes: string): void {
    this.notesText.set(notes);
  }

  protected closeNotes(): void {
    this.notesText.set(null);
  }

  protected openPractice(event: Event, routine: RoutineView): void {
    if (this.demo()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button, app-ui-icon-btn')) {
      return;
    }
    void this.router.navigate(['/horologium'], {
      queryParams: { consuetudo: routine.id },
    });
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
