import { DecimalPipe } from '@angular/common';
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
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';
import { Skill, SkillTree } from './skill.model';
import { SkillsService } from './skills.service';

@Component({
  selector: 'app-skills-page',
  imports: [DecimalPipe, FormField, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skills-page.html',
  styleUrl: './skills-page.css',
})
export class SkillsPage implements OnInit {
  private readonly skillsService = inject(SkillsService);
  private readonly xpFeedback = inject(XpFeedbackService);

  protected readonly tree = signal<SkillTree | null>(null);
  protected readonly selected = signal<Skill | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly logging = signal(false);

  protected readonly activityModel = signal({
    xpAmount: 100,
    note: '',
  });
  protected readonly activityForm = form(this.activityModel, (p) => {
    required(p.xpAmount);
    min(p.xpAmount, 1, { message: 'XP must be at least 1' });
  });

  protected readonly totalLevel = computed(() => this.tree()?.totalLevel ?? 0);
  protected readonly averageLevel = computed(() => this.tree()?.averageLevel ?? 1);

  ngOnInit(): void {
    const cached = this.skillsService.peekTree();
    if (cached) {
      this.tree.set(cached);
      this.loading.set(false);
      this.loadTree(false, true);
      return;
    }
    this.loadTree(true, true);
  }

  protected selectSkill(skill: Skill): void {
    this.selected.set(skill);
    this.toast.set(null);
  }

  protected closeDetail(): void {
    this.selected.set(null);
  }

  protected logXp(): void {
    const skill = this.selected();
    if (!skill) {
      return;
    }

    void submit(this.activityForm, async () => {
      const { xpAmount, note } = this.activityModel();
      this.logging.set(true);
      this.skillsService
        .logActivity(skill.id, xpAmount, note.trim() || undefined)
        .subscribe({
          next: (result) => {
            this.selected.set(result.skill);
            this.activityModel.update((m) => ({ ...m, note: '' }));
            this.xpFeedback.publishAward(result);
            if (result.leveledUp) {
              const unlocks = result.newUnlocks ?? [];
              if (unlocks.length === 1) {
                this.toast.set(
                  `${result.skill.name} leveled up! New unlock: ${unlocks[0].label} ✓`,
                );
              } else if (unlocks.length > 1) {
                this.toast.set(
                  `${result.skill.name} leveled up! New unlocks: ${unlocks
                    .map((u) => `${u.label} ✓`)
                    .join(', ')}`,
                );
              } else {
                this.toast.set(`${result.skill.name} leveled up!`);
              }
            }
            this.loadTree(false, true);
            this.logging.set(false);
          },
          error: (err: { error?: { message?: string | string[] } }) => {
            const message = err.error?.message;
            this.toast.set(
              Array.isArray(message)
                ? message.join(', ')
                : (message ?? 'Failed to log XP'),
            );
            this.logging.set(false);
          },
        });
    });
  }

  private loadTree(showLoading = true, force = false): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.skillsService.getTree(force).subscribe({
      next: (tree) => {
        this.tree.set(tree);
        const current = this.selected();
        if (current) {
          const refreshed = tree.categories
            .flatMap((c) => c.skills)
            .find((s) => s.id === current.id);
          if (refreshed) {
            this.selected.set(refreshed);
          }
        }
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        if (!this.tree()) {
          this.error.set(
            'Could not reach the Status server. Is the backend running?',
          );
        }
      },
    });
  }
}
