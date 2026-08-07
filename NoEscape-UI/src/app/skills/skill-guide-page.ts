import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Reward, SkillGuide } from './skill.model';
import { SkillsService } from './skills.service';

@Component({
  selector: 'app-skill-guide-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skill-guide-page.html',
  styleUrl: './skill-guide-page.css',
})
export class SkillGuidePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly skillsService = inject(SkillsService);

  protected readonly guide = signal<SkillGuide | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly claimingId = signal<number | null>(null);
  protected readonly toast = signal<string | null>(null);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('skillId'));
    if (!Number.isFinite(id) || id < 1) {
      this.loading.set(false);
      this.error.set('Invalid skill.');
      return;
    }
    this.load(id);
  }

  protected claim(reward: Reward): void {
    if (reward.status !== 'available' || reward.claimedAt) {
      return;
    }
    this.claimingId.set(reward.id);
    this.skillsService.claimReward(reward.id).subscribe({
      next: () => {
        this.claimingId.set(null);
        this.toast.set(`Claimed: ${reward.label}`);
        const skillId = this.guide()?.skill.id;
        if (skillId) {
          this.load(skillId, false);
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.claimingId.set(null);
        const message = err.error?.message;
        this.toast.set(
          Array.isArray(message)
            ? message.join(', ')
            : (message ?? 'Could not claim reward'),
        );
      },
    });
  }

  protected statusLabel(reward: Reward): string {
    switch (reward.status) {
      case 'unlocked':
        return 'UNLOCKED ✓';
      case 'available':
        return 'AVAILABLE — claim';
      case 'locked_level':
        return `Need level ${reward.levelReq}`;
      case 'locked_requirements':
        return `Requires: ${(reward.missing ?? []).join(', ') || '—'}`;
      default:
        return 'Locked';
    }
  }

  private load(skillId: number, showLoading = true): void {
    if (showLoading) {
      this.loading.set(true);
    }
    this.skillsService.getSkillGuide(skillId).subscribe({
      next: (guide) => {
        this.guide.set(guide);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load Skill Guide. Is the backend running?');
      },
    });
  }
}
