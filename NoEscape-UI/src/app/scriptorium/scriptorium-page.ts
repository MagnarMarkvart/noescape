import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CharacterService } from '../character/character.service';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import {
  durationLabel,
  DEFAULT_SCRIPTORIUM_ICON,
  SCRIPTORIUM_SORTS,
  SCRIPTORIUM_TIERS,
  ScriptoriumSortId,
  ScriptoriumWorkView,
  workLocked,
} from './scriptorium.model';
import { ScriptoriumService } from './scriptorium.service';

type CatalogConfirm =
  | { kind: 'erase'; work: ScriptoriumWorkView }
  | { kind: 'complete'; work: ScriptoriumWorkView };

@Component({
  selector: 'app-scriptorium-page',
  imports: [RouterLink, UiConfirm, UiIconBtn],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scriptorium-page.html',
  styleUrl: './scriptorium-page.css',
})
export class ScriptoriumPage implements OnInit {
  private readonly api = inject(ScriptoriumService);
  private readonly character = inject(CharacterService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly xpFeedback = inject(XpFeedbackService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly works = signal<ScriptoriumWorkView[]>([]);
  protected readonly query = signal('');
  protected readonly sortId = signal<ScriptoriumSortId>('due');
  protected readonly showArchived = signal(false);
  protected readonly confirm = signal<CatalogConfirm | null>(null);
  protected readonly busyId = signal<number | null>(null);

  protected readonly sorts = SCRIPTORIUM_SORTS;
  protected readonly durationLabel = durationLabel;
  protected readonly defaultIcon = DEFAULT_SCRIPTORIUM_ICON;
  protected readonly workLocked = workLocked;

  protected readonly todayIso = this.character.todayIso;

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sort = this.sortId();
    const rows = this.works().filter((w) => {
      if (!q) {
        return true;
      }
      const hay = [
        w.title,
        w.notes,
        w.tier,
        ...w.subtasks.map((s) => s.title),
        ...w.skillShares.map((s) => s.name),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    return [...rows].sort((a, b) => this.compareWorks(a, b, sort));
  });

  protected readonly columns = computed(() =>
    SCRIPTORIUM_TIERS.map((tier) => ({
      ...tier,
      works: this.filtered().filter((w) => w.tier === tier.id),
    })),
  );

  ngOnInit(): void {
    const raw = this.route.snapshot.queryParamMap.get('work');
    const id = raw ? Number(raw) : NaN;
    if (Number.isFinite(id) && id > 0) {
      void this.router.navigate(['/scriptorium', id], { replaceUrl: true });
      return;
    }
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.api.list(this.showArchived() ? 'all' : 'OPEN').subscribe({
      next: (rows) => {
        this.works.set(rows);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not open the Scriptorium. Is the backend running?');
      },
    });
  }

  protected setQuery(raw: string): void {
    this.query.set(raw);
  }

  protected setSort(raw: string): void {
    const next = this.sorts.find((s) => s.id === raw);
    if (next) {
      this.sortId.set(next.id);
    }
  }

  protected toggleArchived(): void {
    this.showArchived.update((v) => !v);
    this.reload();
  }

  protected assignedLabel(work: ScriptoriumWorkView): string {
    if (work.assignedKind === 'quest' || work.questId) {
      return work.questName ? `Assigned · ${work.questName}` : 'Assigned to a quest';
    }
    if (work.assignedKind === 'daily') {
      return work.assignedDailyDate
        ? `Assigned · daily ${this.character.formatDate(work.assignedDailyDate)}`
        : 'Assigned to a daily';
    }
    if (work.status === 'ARCHIVED') {
      return 'Shelved';
    }
    return '';
  }

  protected askComplete(work: ScriptoriumWorkView): void {
    if (workLocked(work) || work.status === 'ARCHIVED') {
      return;
    }
    this.confirm.set({ kind: 'complete', work });
  }

  protected askErase(work: ScriptoriumWorkView): void {
    this.confirm.set({ kind: 'erase', work });
  }

  protected cancelConfirm(): void {
    if (this.busyId()) {
      return;
    }
    this.confirm.set(null);
  }

  protected runConfirm(): void {
    const pending = this.confirm();
    if (!pending || this.busyId()) {
      return;
    }
    if (pending.kind === 'complete') {
      this.completeWork(pending.work);
      return;
    }
    this.eraseWork(pending.work);
  }

  protected archiveWork(work: ScriptoriumWorkView): void {
    if (workLocked(work) && work.status !== 'ARCHIVED') {
      return;
    }
    const next = work.status === 'ARCHIVED' ? 'OPEN' : 'ARCHIVED';
    this.busyId.set(work.id);
    this.api.update(work.id, { status: next }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(
          next === 'ARCHIVED'
            ? 'Could not shelve the folio.'
            : 'Could not restore the folio.',
        );
      },
    });
  }

  protected dueLabel(iso: string | null): string {
    if (!iso) {
      return 'No due day';
    }
    const today = this.todayIso();
    const days = this.diffDays(today, iso);
    const pretty = this.character.formatDate(iso);
    if (days < 0) {
      return `Overdue · ${pretty}`;
    }
    if (days === 0) {
      return `Due today · ${pretty}`;
    }
    if (days === 1) {
      return `Due tomorrow · ${pretty}`;
    }
    return `Due ${pretty}`;
  }

  protected dueTone(iso: string | null): 'overdue' | 'today' | 'soon' | '' {
    if (!iso) {
      return '';
    }
    const days = this.diffDays(this.todayIso(), iso);
    if (days < 0) {
      return 'overdue';
    }
    if (days === 0) {
      return 'today';
    }
    if (days <= 3) {
      return 'soon';
    }
    return '';
  }

  private completeWork(work: ScriptoriumWorkView): void {
    this.busyId.set(work.id);
    this.api.complete(work.id).subscribe({
      next: (result) => {
        this.busyId.set(null);
        this.confirm.set(null);
        for (const award of result.awards ?? []) {
          this.xpFeedback.publishAward(award);
        }
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.confirm.set(null);
        this.error.set(err.error?.message ?? 'Could not complete the folio.');
      },
    });
  }

  private eraseWork(work: ScriptoriumWorkView): void {
    this.busyId.set(work.id);
    this.api.remove(work.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirm.set(null);
        this.reload();
      },
      error: () => {
        this.busyId.set(null);
        this.confirm.set(null);
        this.error.set('Could not erase the folio.');
      },
    });
  }

  private compareWorks(
    a: ScriptoriumWorkView,
    b: ScriptoriumWorkView,
    sort: ScriptoriumSortId,
  ): number {
    if (sort === 'title') {
      return a.title.localeCompare(b.title);
    }
    if (sort === 'effort') {
      return b.effort - a.effort || a.title.localeCompare(b.title);
    }
    if (sort === 'duration') {
      return (b.durationMinutes ?? -1) - (a.durationMinutes ?? -1);
    }
    if (sort === 'created') {
      return b.createdAt.localeCompare(a.createdAt);
    }
    const ad = a.dueDate ?? '9999-99-99';
    const bd = b.dueDate ?? '9999-99-99';
    return ad.localeCompare(bd) || a.title.localeCompare(b.title);
  }

  private diffDays(fromIso: string, toIso: string): number {
    const from = Date.parse(`${fromIso}T00:00:00Z`);
    const to = Date.parse(`${toIso}T00:00:00Z`);
    return Math.round((to - from) / 86_400_000);
  }
}
