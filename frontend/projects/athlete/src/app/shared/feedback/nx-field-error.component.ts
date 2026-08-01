import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Erro de validação de UM campo — fica logo abaixo do input (design 12,
 *  "Validação de campo").
 *
 *  Nunca só vermelho: o texto diz o que corrigir ("Esse e-mail parece
 *  incompleto. Confira depois do @."). Marque o input em si com
 *  `.nx-input--invalid` pra fechar o par cor + texto.
 *
 *  `role="alert"` porque a mensagem aparece DEPOIS da interação (validação no
 *  blur) e precisa ser anunciada quando surge. */
@Component({
  selector: 'app-nx-field-error',
  template: `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6v5.1M12 16.4h.01" />
    </svg>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      /* flex-start + nudge: com a mensagem em duas linhas, o ícone tem de
         acompanhar a PRIMEIRA linha, não flutuar no meio do bloco. */
      align-items: flex-start;
      gap: 6px;
      margin-top: 8px;
      color: var(--nx-live);
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 1.35;
    }

    svg {
      flex: none;
      margin-top: 1px;
    }
  `,
  host: { role: 'alert' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxFieldErrorComponent {}
