import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NxFeedbackIconComponent } from './nx-feedback-icon.component';
import { NxToastService } from './nx-toast.service';

/** Pilha de toasts — canto superior direito, abaixo do header (design 12).
 *  Montado uma única vez no shell do app; ninguém instancia isso na tela.
 *
 *  A11y: a região é `aria-live="polite"` e NUNCA rouba foco (regra
 *  `toast-accessibility`). Erros e avisos, que carregam ação, sobem pra
 *  `assertive` — perder um "pagamento não aprovado" é pior que interromper. */
@Component({
  selector: 'app-nx-toast-host',
  imports: [NxFeedbackIconComponent],
  template: `
    <div
      class="stack"
      role="region"
      aria-label="Avisos"
      (mouseenter)="toasts.pauseAll()"
      (mouseleave)="toasts.resumeAll()"
      (focusin)="toasts.pauseAll()"
      (focusout)="toasts.resumeAll()"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="toast nx-tone-{{ toast.tone }}"
          [attr.role]="toast.tone === 'success' || toast.tone === 'info' ? 'status' : 'alert'"
          [attr.aria-live]="toast.tone === 'success' || toast.tone === 'info' ? 'polite' : 'assertive'"
        >
          <span class="chip">
            <app-nx-feedback-icon [tone]="toast.tone" [size]="17" />
          </span>

          <div class="content">
            <div class="title">{{ toast.title }}</div>
            @if (toast.body) {
              <div class="body">{{ toast.body }}</div>
            }
            @if (toast.action; as action) {
              <div class="actions">
                <button type="button" class="action" (click)="runAction(toast.id, action.run)">
                  {{ action.label }}
                </button>
              </div>
            }
          </div>

          <button
            type="button"
            class="close"
            [attr.aria-label]="'Fechar aviso: ' + toast.title"
            (click)="toasts.dismiss(toast.id)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          <span
            class="progress"
            aria-hidden="true"
            [style.animation-duration.ms]="toast.durationMs"
          ></span>
        </div>
      }
    </div>
  `,
  styles: `
      .stack {
        position: fixed;
        top: 72px;
        right: 24px;
        z-index: 900;
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 380px;
        max-width: calc(100vw - 32px);
        pointer-events: none;
      }

      .toast {
        pointer-events: auto;
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px 16px;
        background: var(--nx-surface-2);
        border: 1px solid var(--tone-line);
        border-radius: var(--nx-r-3);
        box-shadow: var(--nx-elev-2);
        overflow: hidden;
        animation: toast-in var(--nx-d-base) var(--nx-ease-out) both;
      }

      .chip {
        display: grid;
        place-items: center;
        flex: none;
        width: 34px;
        height: 34px;
        border-radius: var(--nx-r-2);
        background: var(--tone-fill);
        color: var(--tone);
      }

      .content {
        flex: 1;
        min-width: 0;
      }

      .title {
        font-family: var(--nx-font-display);
        font-size: 13.5px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--tone);
      }

      .body {
        margin-top: 3px;
        font-family: var(--nx-font-ui);
        font-size: 12px;
        line-height: 17.4px;
        color: var(--nx-text-mute);
      }

      .actions {
        margin-top: 10px;
      }

      .action {
        display: inline-block;
        padding: 6px 11px;
        background: var(--tone-fill);
        border: 1px solid var(--tone-line);
        border-radius: var(--nx-r-1);
        color: var(--tone);
        font-family: var(--nx-font-display);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background var(--nx-d-fast) var(--nx-ease-out);
      }

      .action:hover {
        background: rgb(var(--tone-rgb) / 0.24);
      }

      /* Alvo de toque de 44px sem inflar a caixa visual do X (14px de ícone). */
      .close {
        flex: none;
        display: grid;
        place-items: center;
        padding: 14px;
        margin: -14px -14px -14px 0;
        background: none;
        border: 0;
        color: var(--nx-text-dim);
        cursor: pointer;
        transition: color var(--nx-d-fast) var(--nx-ease-out);
      }

      .close:hover {
        color: var(--nx-text);
      }

      .progress {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        width: 100%;
        border-top-right-radius: 2px;
        background: var(--tone);
        opacity: 0.75;
        transform-origin: left center;
        animation-name: toast-progress;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
      }

      /* A pausa do timer no serviço e a da barra precisam ser o mesmo gesto —
         senão a barra mente sobre quanto tempo resta. */
      .stack:hover .progress,
      .stack:focus-within .progress {
        animation-play-state: paused;
      }

      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateX(12px);
        }
      }

      @keyframes toast-progress {
        to {
          transform: scaleX(0);
        }
      }

      @media (max-width: 640px) {
        .stack {
          top: 12px;
          right: 12px;
          left: 12px;
          width: auto;
          max-width: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .toast {
          animation: none;
        }
      }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxToastHostComponent {
  protected readonly toasts = inject(NxToastService);

  /** Ação do toast resolve o assunto: rodou, o aviso sai de cena. */
  protected runAction(id: number, run: () => void): void {
    this.toasts.dismiss(id);
    run();
  }
}
