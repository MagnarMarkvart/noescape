import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import { ForgeShell } from '../shared/ui/forge-shell';
import { IconPicker } from '../shared/ui/icon-picker';
import { NumberField } from '../shared/ui/number-field';
import { UiConfirm } from '../shared/ui/ui-confirm';
import { QuestsService } from '../quests/quests.service';
import {
  emptyTabulaDraft,
  TABULA_PERIOD_OPTIONS,
  TABULA_POLARITY_OPTIONS,
  TabulaPeriod,
  TabulaPolarity,
  TabulaUpsertPayload,
} from './tabularium.model';
import { TabulariumService } from './tabularium.service';

@Component({
  selector: 'app-tabularium-forge-page',
  imports: [
    RouterLink,
    ForgeShell,
    IconPicker,
    NumberField,
    UiConfirm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabularium-forge-page.html',
  styleUrl: './tabularium-forge-page.css',
})
export class TabulariumForgePage implements OnInit {
  private readonly api = inject(TabulariumService);
  private readonly quests = inject(QuestsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly editId = signal<number | null>(null);
  protected readonly draft = signal(emptyTabulaDraft());
  protected readonly questsList = signal<Array<{ id: number; name: string }>>(
    [],
  );

  protected readonly periods = TABULA_PERIOD_OPTIONS;
  protected readonly polarities = TABULA_POLARITY_OPTIONS;

  protected readonly heading = computed(() =>
    this.editId() ? 'Amend tabula' : 'Forge a tabula',
  );
  protected readonly canSave = computed(() => {
    const d = this.draft();
    return d.name.trim().length > 0 && d.normMax >= d.normMin && d.step >= 1;
  });

  ngOnInit(): void {
    this.quests.list('all').subscribe({
      next: (rows) =>
        this.questsList.set(rows.map((q) => ({ id: q.id, name: q.name }))),
    });
    const raw = this.route.snapshot.paramMap.get('id');
    const id = raw ? Number(raw) : NaN;
    if (!Number.isFinite(id) || id < 1) {
      return;
    }
    this.editId.set(id);
    this.api.getOne(id).subscribe({
      next: (row) => {
        this.draft.set({
          name: row.name,
          icon: row.icon || '◆',
          period: row.period,
          polarity: row.polarity,
          normMin: row.normMin,
          normMax: row.normMax,
          step: row.step,
          questId: row.questId,
        });
      },
      error: () => this.timed.set('Tabula not found'),
    });
  }

  protected setName(value: string): void {
    this.draft.update((d) => ({ ...d, name: value }));
  }

  protected pickIcon(icon: string): void {
    this.draft.update((d) => ({ ...d, icon }));
  }

  protected setPeriod(period: TabulaPeriod): void {
    this.draft.update((d) => ({ ...d, period }));
  }

  protected setPolarity(polarity: TabulaPolarity): void {
    this.draft.update((d) => ({ ...d, polarity }));
  }

  protected setNormMin(n: number): void {
    this.draft.update((d) => {
      const normMin = Math.max(0, n);
      return { ...d, normMin, normMax: Math.max(d.normMax, normMin) };
    });
  }

  protected setNormMax(n: number): void {
    this.draft.update((d) => {
      const normMax = Math.max(0, n);
      return { ...d, normMax, normMin: Math.min(d.normMin, normMax) };
    });
  }

  protected setStep(n: number): void {
    this.draft.update((d) => ({ ...d, step: Math.max(1, n) }));
  }

  protected setQuest(raw: string): void {
    const id = Number(raw);
    this.draft.update((d) => ({
      ...d,
      questId: Number.isFinite(id) && id > 0 ? id : null,
    }));
  }

  protected save(): void {
    if (!this.canSave() || this.saving()) {
      return;
    }
    const body = this.payload();
    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.api.update(id, body)
      : this.api.create(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/tabularium']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.timed.set(err.error?.message ?? 'Could not save');
      },
    });
  }

  protected remove(): void {
    const id = this.editId();
    if (!id || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.api.remove(id).subscribe({
      next: () => {
        this.removing.set(false);
        void this.router.navigate(['/tabularium']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.removing.set(false);
        this.confirmRemove.set(false);
        this.timed.set(err.error?.message ?? 'Could not remove');
      },
    });
  }

  private payload(): TabulaUpsertPayload {
    const d = this.draft();
    return {
      name: d.name.trim(),
      icon: d.icon,
      period: d.period,
      polarity: d.polarity,
      normMin: d.normMin,
      normMax: d.normMax,
      step: d.step,
      questId: d.questId ?? null,
    };
  }
}
