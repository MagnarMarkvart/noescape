import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { XpFeedbackService } from '../xp-feedback/xp-feedback.service';

@Component({
  selector: 'app-preview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './preview-page.html',
  styleUrl: './preview-page.css',
})
export class PreviewPage {
  private readonly xpFeedback = inject(XpFeedbackService);

  protected mockXpGain(): void {
    this.xpFeedback.mockXpGain();
  }

  protected mockLevelUp(): void {
    this.xpFeedback.mockLevelUp();
  }

  protected mockLevelUpUnlock(): void {
    this.xpFeedback.mockLevelUpUnlock();
  }

  protected mockXpLoss(): void {
    this.xpFeedback.mockXpLoss();
  }

  protected mockLevelDown(): void {
    this.xpFeedback.mockLevelDown();
  }
}
