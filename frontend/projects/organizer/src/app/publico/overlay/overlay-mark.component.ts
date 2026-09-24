import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Marca d'água da nexaGO nas telas de transmissão.
 *
 *  Componente próprio, e não o mesmo bloco copiado em cada tela: marca repetida em cinco lugares
 *  é marca que diverge no primeiro ajuste. Translúcida de propósito — identifica sem disputar com
 *  a imagem da câmera, que é o conteúdo. */
@Component({
  selector: 'og-overlay-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-pos]': 'corner()',
  },
  template: `<img src="/brand/logo.png" alt="" width="72" height="72" />`,
  styles: `
    :host {
      position: fixed;
      display: block;
      pointer-events: none;
      /* Mesma margem de segurança de transmissão das demais telas. */
      --gap: 48px;
      opacity: 0.52;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.55));
    }
    :host([data-pos='br']) {
      right: var(--gap);
      bottom: var(--gap);
    }
    :host([data-pos='tr']) {
      right: var(--gap);
      top: var(--gap);
    }

    img {
      display: block;
      width: 72px;
      height: 72px;
      object-fit: contain;
    }
  `,
})
export class OverlayMarkComponent {
  /** Sobe pro topo quando o conteúdo da tela ocupa o canto inferior direito. */
  readonly corner = input<'tr' | 'br'>('br');
}
