import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

/** Toasts efêmeros (ex.: "Em breve no Google Play"). Porta de `showToast`/`ToastHost`
 *  (evento DOM custom no site Next.js) como service de signal — mais idiomático em Angular,
 *  mesmo comportamento (uma mensagem por vez, some sozinha em 2.8s). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _message = signal<string | null>(null);
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  readonly message = this._message.asReadonly();

  show(message: string): void {
    clearTimeout(this.timeoutId);
    this._message.set(message);
    this.timeoutId = setTimeout(() => this._message.set(null), 2800);
  }
}

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      @if (message(); as msg) {
        <div
          role="status"
          class="nx-toast rounded-2xl border border-line-strong bg-surface-1 px-5 py-3 text-sm font-600 text-fg shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
        >
          {{ msg }}
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  private readonly toastService = inject(ToastService);
  protected readonly message = this.toastService.message;
}
