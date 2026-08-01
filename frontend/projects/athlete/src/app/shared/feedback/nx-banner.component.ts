import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxFeedbackIconComponent } from './nx-feedback-icon.component';
import type { NxFeedbackTone } from './nx-feedback.types';

/** Faixa de ESTADO DO SISTEMA — largura total, no topo do conteúdo (design 12).
 *
 *  Persiste enquanto a condição durar: offline, manutenção, vaga reservada com
 *  contagem regressiva, sincronização falhando. Por isso só avisos realmente
 *  dispensáveis recebem `dismissible` — fechar um banner que descreve uma
 *  condição ainda ativa esconde a verdade da tela.
 *
 *  A mensagem entra por projeção, então valores numéricos podem ser marcados
 *  pelo chamador com `.nx-feedback-num` (mono, na cor do tom). */
@Component({
  selector: 'app-nx-banner',
  imports: [NxFeedbackIconComponent],
  template: `
    <app-nx-feedback-icon [tone]="tone()" [size]="16" />

    <span class="message"><ng-content /></span>

    @if (actionLabel(); as label) {
      <button type="button" class="action" (click)="action.emit()">{{ label }}</button>
    }

    @if (dismissible()) {
      <button type="button" class="close" aria-label="Fechar aviso" (click)="dismiss.emit()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    }
  `,
  styles: `
      :host {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        /* A lavagem do tom é translúcida de propósito. Quando o banner precisa
           ser opaco (fixo sobre conteúdo que rola por baixo), o chamador define
           --nx-banner-base com a cor de fundo da tela. */
        background:
          linear-gradient(var(--tone-wash), var(--tone-wash)),
          var(--nx-banner-base, transparent);
        border-bottom: 1px solid var(--tone-line);
        color: var(--nx-text);
        font-family: var(--nx-font-ui);
        font-size: 12.5px;
        line-height: 1.45;
      }

      app-nx-feedback-icon {
        color: var(--tone);
        margin-top: 1px;
        align-self: flex-start;
      }

      .message {
        flex: 1;
        min-width: 0;
      }

      .action {
        flex: none;
        padding: 11px 4px;
        margin: -11px 0;
        background: none;
        border: 0;
        color: var(--tone);
        font-family: var(--nx-font-display);
        font-size: 12px;
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
      }

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

      @media (max-width: 640px) {
        :host {
          flex-wrap: wrap;
          row-gap: 6px;
        }

        .message {
          flex-basis: calc(100% - 26px);
        }

        .action {
          margin-left: 26px;
        }
      }
  `,
  host: {
    role: 'status',
    'aria-live': 'polite',
    '[class.nx-tone-info]': 'tone() === "info"',
    '[class.nx-tone-success]': 'tone() === "success"',
    '[class.nx-tone-error]': 'tone() === "error"',
    '[class.nx-tone-warning]': 'tone() === "warning"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxBannerComponent {
  readonly tone = input<NxFeedbackTone>('info');
  /** Rótulo do atalho à direita ("Recarregar", "Concluir pagamento"). */
  readonly actionLabel = input<string | null>(null);
  /** Só marque como dispensável se a condição sumir de vista sem prejuízo. */
  readonly dismissible = input(false);

  readonly action = output<void>();
  readonly dismiss = output<void>();
}
