import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { form, FormField, min, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TimedToast } from '../shared/timed-toast';
import { Skill, SkillTree } from '../skills/skill.model';
import { SkillsService } from '../skills/skills.service';
import { DailyTaskTemplate } from './daily.model';
import { DailiesService } from './dailies.service';

@Component({
  selector: 'app-daily-defaults-page',
  imports: [RouterLink, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-defaults-page.html',
  styleUrl: './daily-defaults-page.css',
})
export class DailyDefaultsPage implements OnInit {
  private readonly dailies = inject(DailiesService);
  private readonly skillsService = inject(SkillsService);
  private readonly timed = new TimedToast();

  protected readonly toast = this.timed.value;
  protected readonly templates = signal<DailyTaskTemplate[]>([]);
  protected readonly skillTree = signal<SkillTree | null>(null);
  protected readonly creating = signal(false);

  protected readonly createModel = signal({
    name: '',
    icon: '◆',
    skillId: 0,
    fixedXp: 50,
  });
  protected readonly createForm = form(this.createModel, (p) => {
    required(p.name);
    min(p.skillId, 1);
    min(p.fixedXp, 1);
  });

  protected readonly allSkills = computed(() => {
    const tree = this.skillTree();
    if (!tree) {
      return [] as Skill[];
    }
    return tree.categories.flatMap((c) => c.skills);
  });

  ngOnInit(): void {
    this.reload();
    this.skillsService.getTree().subscribe({
      next: (t) => this.skillTree.set(t),
    });
  }

  protected onSkillSelect(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value) || 0;
    this.createModel.update((m) => ({ ...m, skillId: id }));
  }

  protected create(): void {
    void submit(this.createForm, async () => {
      const m = this.createModel();
      this.creating.set(true);
      this.dailies
        .createTemplate({
          name: m.name.trim(),
          icon: m.icon.trim() || '◆',
          skillId: Number(m.skillId),
          fixedXp: Number(m.fixedXp),
        })
        .subscribe({
          next: () => {
            this.creating.set(false);
            this.createModel.set({
              name: '',
              icon: '◆',
              skillId: 0,
              fixedXp: 50,
            });
            this.timed.set('Default task created');
            this.reload();
          },
          error: (err: { error?: { message?: string } }) => {
            this.creating.set(false);
            this.timed.set(err.error?.message ?? 'Create failed');
          },
        });
    });
  }

  protected remove(t: DailyTaskTemplate): void {
    if (!confirm(`Remove “${t.name}” from defaults?`)) {
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
