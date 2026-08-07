import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { SkillsService } from '../skills/skills.service';
import { LevelUpLogPage } from './level-ups.model';

@Component({
  selector: 'app-level-ups-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './level-ups-page.html',
  styleUrl: './level-ups-page.css',
})
export class LevelUpsPage implements OnInit {
  private readonly skillsService = inject(SkillsService);

  protected readonly page = signal(1);
  protected readonly data = signal<LevelUpLogPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load(1);
  }

  protected goPrev(): void {
    const current = this.data();
    if (!current?.hasPrev) {
      return;
    }
    this.load(current.page - 1);
  }

  protected goNext(): void {
    const current = this.data();
    if (!current?.hasNext) {
      return;
    }
    this.load(current.page + 1);
  }

  private load(page: number): void {
    this.loading.set(true);
    this.skillsService.listLevelUps(page, 15).subscribe({
      next: (result) => {
        this.data.set(result);
        this.page.set(result.page);
        this.loading.set(false);
        this.error.set(null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load level-up log.');
      },
    });
  }
}
