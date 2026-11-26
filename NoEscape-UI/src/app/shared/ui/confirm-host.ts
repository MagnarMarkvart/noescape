import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  inject,
  signal,
} from '@angular/core';
import { UiConfirm } from './ui-confirm';

export type ConfirmRequest = {
  title: string;
  body: string;
  kicker?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'accent';
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

/**
 * App-wide RPG confirm (replaces window.confirm). `await confirm.ask({...})`
 * resolves true on confirm, false on cancel / backdrop / Esc.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<Pending | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    this.pending()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.pending.set({ ...request, resolve });
    });
  }

  settle(ok: boolean): void {
    const current = this.pending();
    this.pending.set(null);
    current?.resolve(ok);
  }
}

@Component({
  selector: 'app-confirm-host',
  imports: [UiConfirm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.pending(); as p) {
      <app-ui-confirm
        [kicker]="p.kicker ?? 'Confirm'"
        [title]="p.title"
        [body]="p.body"
        [confirmLabel]="p.confirmLabel ?? 'Confirm'"
        [cancelLabel]="p.cancelLabel ?? 'Cancel'"
        [tone]="p.tone ?? 'danger'"
        titleId="confirm-host-title"
        bodyId="confirm-host-body"
        (dismiss)="confirm.settle(false)"
        (secondary)="confirm.settle(false)"
        (confirm)="confirm.settle(true)"
      />
    }
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);
}
