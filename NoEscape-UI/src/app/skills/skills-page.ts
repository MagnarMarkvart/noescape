import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Skill, SkillTree } from './skill.model';
import { SkillsService } from './skills.service';

@Component({
  selector: 'app-skills-page',
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skills-page.html',
  styleUrl: './skills-page.css',
})
export class SkillsPage implements OnInit {
  private readonly skillsService = inject(SkillsService);

  protected readonly tree = signal<SkillTree | null>(null);
  protected readonly selected = signal<Skill | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly logging = signal(false);

  protected xpAmount = 100;
  protected activityNote = '';

  protected readonly totalLevel = computed(() => this.tree()?.totalLevel ?? 0);
  protected readonly averageLevel = computed(() => this.tree()?.averageLevel ?? 1);

  ngOnInit(): void {
    this.loadTree();
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
    if (!skill || this.xpAmount <= 0) {
      return;
    }

    this.logging.set(true);
    this.skillsService
      .logActivity(skill.id, this.xpAmount, this.activityNote || undefined)
      .subscribe({
        next: (result) => {
          this.selected.set(result.skill);
          this.activityNote = '';
          this.toast.set(
            result.leveledUp
              ? `${result.skill.name} leveled up! Now level ${result.skill.level}.`
              : `+${result.activity.xpGained} XP to ${result.skill.name}.`,
          );
          this.loadTree(false);
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
  }

  private loadTree(showLoading = true): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.skillsService.getTree().subscribe({
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
        this.error.set('Could not reach the Status server. Is the backend running?');
      },
    });
  }
}
