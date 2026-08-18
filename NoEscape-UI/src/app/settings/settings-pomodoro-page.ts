import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { form, FormField, max, maxLength, min, required, submit } from '@angular/forms/signals';
import { RuneCheck } from '../shared/rune-check';
import { TimedToast } from '../shared/timed-toast';
import {
  HorologiumPresetPayload,
  HorologiumPresetRecord,
  HorologiumPresetsService,
} from '../horologium/horologium-presets.service';

@Component({
  selector: 'app-settings-pomodoro-page',
  imports: [FormField, RuneCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-pomodoro-page.html',
  styleUrl: './settings-pomodoro-page.css',
})
export class SettingsPomodoroPage implements OnInit {
  private readonly presets = inject(HorologiumPresetsService);
  private readonly timed = new TimedToast();

  protected readonly rows = this.presets.rows;
  protected readonly toast = this.timed.value;
  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly model = signal<HorologiumPresetPayload>({
    label: '',
    workMinutes: 25,
    restMinutes: 5,
    iterations: 4,
    restAfterLast: true,
  });
  protected readonly editor = form(this.model, (p) => {
    required(p.label, { message: 'Name is required' });
    maxLength(p.label, 40);
    min(p.workMinutes, 1);
    max(p.workMinutes, 180);
    min(p.restMinutes, 0);
    max(p.restMinutes, 60);
    min(p.iterations, 2);
    max(p.iterations, 12);
  });

  ngOnInit(): void {
    this.presets.reload().subscribe({
      error: () => this.timed.set('Could not load presets'),
    });
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.model.set({
      label: '',
      workMinutes: 25,
      restMinutes: 5,
      iterations: 4,
      restAfterLast: true,
    });
  }

  protected edit(row: HorologiumPresetRecord): void {
    this.editingId.set(row.id);
    this.model.set({
      label: row.label,
      workMinutes: row.workMinutes,
      restMinutes: row.restMinutes,
      iterations: row.iterations,
      restAfterLast: row.restAfterLast,
    });
  }

  protected setRestAfterLast(checked: boolean): void {
    this.model.update((m) => ({ ...m, restAfterLast: checked }));
  }

  protected save(): void {
    void submit(this.editor, async () => {
      const m = this.model();
      const payload: HorologiumPresetPayload = {
        label: m.label.trim(),
        workMinutes: Number(m.workMinutes),
        restMinutes: Number(m.restMinutes),
        iterations: Number(m.iterations),
        restAfterLast: m.restAfterLast,
      };
      if (!payload.label) {
        this.timed.set('Name is required');
        return;
      }
      this.saving.set(true);
      const id = this.editingId();
      const req =
        id == null
          ? this.presets.create(payload)
          : this.presets.update(id, payload);
      req.subscribe({
        next: () => {
          this.saving.set(false);
          this.timed.set(id == null ? 'Preset added' : 'Preset updated');
          this.startCreate();
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.timed.set(err.error?.message ?? 'Could not save preset');
        },
      });
    });
  }

  protected remove(row: HorologiumPresetRecord): void {
    if (!confirm(`Delete “${row.label}”?`)) {
      return;
    }
    this.presets.remove(row.id).subscribe({
      next: () => {
        this.timed.set(`Removed: ${row.label}`);
        if (this.editingId() === row.id) {
          this.startCreate();
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.timed.set(err.error?.message ?? 'Could not delete');
      },
    });
  }
}
