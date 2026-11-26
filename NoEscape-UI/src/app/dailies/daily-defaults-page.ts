import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import {
  DailyTaskTemplate,
  dailySkillLine,
  formatTaskDuration,
} from './daily.model';
import { DailiesService } from './dailies.service';
import { DefaultsReturn } from './defaults-return';
import { UiIconBtn } from '../shared/ui/ui-icon-btn';
import { formatMoney } from '../shared/money';
import { CharacterService } from '../character/character.service';
import { ConfirmService } from '../shared/ui/confirm-host';

@Component({
  selector: 'app-daily-defaults-page',
  imports: [UiIconBtn],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-defaults-page.html',
  styleUrl: './daily-defaults-page.css',
})
export class DailyDefaultsPage implements OnInit {
  private readonly confirmDialog = inject(ConfirmService);
  private readonly dailies = inject(DailiesService);
  private readonly character = inject(CharacterService);
  private readonly route = inject(ActivatedRoute);
  private readonly defaultsReturn = inject(DefaultsReturn);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly templates = signal<DailyTaskTemplate[]>([]);
  protected readonly query = signal('');
  protected readonly backHref = signal('/dailies');
  protected readonly backLabel = signal('Back to Dailies');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.templates();
    if (!q) {
      return rows;
    }
    return rows.filter((t) => {
      const hay = [
        t.name,
        t.skill.name,
        t.skill.category,
        t.habit?.name ?? '',
        ...(t.skillShares ?? []).map((s) => s.name),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  });

  ngOnInit(): void {
    this.defaultsReturn.remember(this.route.snapshot.queryParamMap.get('from'));
    const origin = this.defaultsReturn.origin();
    this.backHref.set(origin.href);
    this.backLabel.set(origin.label);
    this.reload();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected skillLine(t: DailyTaskTemplate): string {
    return dailySkillLine(t);
  }

  protected formatDuration(minutes: number): string {
    return formatTaskDuration(minutes);
  }

  protected formatWealth(cents: number | null | undefined): string {
    const n = Math.round(Number(cents) || 0);
    return n > 0 ? formatMoney(n, this.character.currency()) : '';
  }

  protected async remove(t: DailyTaskTemplate): Promise<void> {
    const ok = await this.confirmDialog.ask({
      kicker: 'Dailies',
      title: `Remove “${t.name}” from defaults?`,
      body: 'Days already planned keep their tasks.',
      confirmLabel: 'Remove',
    });
    if (!ok) {
      return;
    }
    this.dailies.removeTemplate(t.id).subscribe({
      next: () => {
        this.timed.set(`Removed: ${t.name}`);
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Remove failed');
      },
    });
  }

  private reload(): void {
    this.dailies.listTemplates().subscribe({
      next: (rows) => this.templates.set(rows),
    });
  }
}
