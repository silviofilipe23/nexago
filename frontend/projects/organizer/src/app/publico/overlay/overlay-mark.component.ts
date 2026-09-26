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
    '[attr.data-flow]': 'flow() ? "true" : null',
  },
  template: `
    <img src="/brand/logo.png" alt="" width="72" height="72" />
    @if (caption(); as text) {
      <span class="caption">{{ text }}</span>
    }
  `,
  styles: `
    :host {
      position: fixed;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      opacity: 0.52;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.55));
    }
    :host([data-pos='br']) {
      right: 80px;
      bottom: 74px;
    }
    :host([data-pos='tr']) {
      right: 80px;
      top: 74px;
    }
    /* Modo de fluxo: entra no layout do cabeçalho em vez de flutuar. Vem DEPOIS das regras de
       canto de propósito: escrito antes, o position fixed delas continuaria valendo. */
    :host([data-flow='true']) {
      position: static;
    }

    img {
      display: block;
      width: 72px;
      height: 72px;
      object-fit: contain;
    }

    .caption {
      color: #fff;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.16em;
      white-space: nowrap;
    }
  `,
})
export class OverlayMarkComponent {
  /** Sobe pro topo quando o conteúdo da tela ocupa o canto inferior direito. */
  readonly corner = input<'tr' | 'br'>('br');
  /** Para telas cujos cantos direitos já têm dono — nelas a marca senta no cabeçalho. */
  readonly flow = input(false);

  /** Rodapé de marca sob a logo. Vazio na maioria das telas: a marca de transmissão identifica
   *  sem legenda, e só a Grande final pede o carimbo do título. */
  readonly caption = input<string | null>(null);
}
