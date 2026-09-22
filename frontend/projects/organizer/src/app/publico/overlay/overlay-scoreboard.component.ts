import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OverlayCorner, OverlayDuelView, OverlaySide } from './overlay-selectors';

/** Placar de transmissão: fundo TRANSPARENTE, desenhado sobre a imagem da câmera no OBS.
 *
 *  Componente só de apresentação — recebe a visão já derivada (`overlayViewOf`) e não sabe
 *  nada de Firestore. Nada é desenhado quando não há partida no ar: numa transmissão,
 *  retângulo vazio ou "carregando" por cima do jogo é pior que overlay nenhum. */
@Component({
  selector: 'og-overlay-scoreboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="overlay" [attr.data-pos]="corner()">
        @if (band()) {
          <div class="band">{{ band() }}</div>
        }

        @if (duel(); as d) {
          <div class="rows">
            <div class="row" [class.row--lead]="d.setsA > d.setsB">
              <span class="serve" [class.serve--on]="d.a.serving"></span>
              <span class="name">{{ labelOf(d.a) }}</span>
              @if (d.showSets) {
                <span class="sets">{{ d.setsA }}</span>
              }
              <span class="points">{{ d.pointsA ?? '–' }}</span>
            </div>
            <div class="row" [class.row--lead]="d.setsB > d.setsA">
              <span class="serve" [class.serve--on]="d.b.serving"></span>
              <span class="name">{{ labelOf(d.b) }}</span>
              @if (d.showSets) {
                <span class="sets">{{ d.setsB }}</span>
              }
              <span class="points">{{ d.pointsB ?? '–' }}</span>
            </div>
          </div>
          @if (d.alert; as alert) {
            <div class="alert">{{ alert.kind === 'match' ? 'MATCH POINT' : 'SET POINT' }}</div>
          }
        }

      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: none;
      /* A captura do OBS é 1920x1080 — nada aqui reage a tamanho de janela de propósito. */
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    .overlay {
      position: absolute;
      width: 720px;
      /* Margem de segurança de transmissão: nenhum elemento encosta na borda do quadro. */
      --gap: 56px;
    }
    .overlay[data-pos='tl'] {
      top: var(--gap);
      left: var(--gap);
    }
    .overlay[data-pos='tr'] {
      top: var(--gap);
      right: var(--gap);
    }
    .overlay[data-pos='bl'] {
      bottom: var(--gap);
      left: var(--gap);
    }
    .overlay[data-pos='br'] {
      bottom: var(--gap);
      right: var(--gap);
    }

    .band {
      padding: 8px 18px;
      background: var(--nx-orange-500);
      color: #fff;
      font-size: 18px;
      font-weight: 800;
      /* Apertado de propósito: a faixa do KOTC ("Classificatória · Rodada 3 · Quadra 1") é
         longa e a quadra é o pedaço que some primeiro numa transmissão com várias quadras. */
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-radius: 10px 10px 0 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rows {
      display: flex;
      flex-direction: column;
      border-radius: 0 0 10px 10px;
      overflow: hidden;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-left: 16px;
      /* OPACO, não translúcido: a 0.88 e mesmo a 0.96 a imagem da câmera atravessava o painel
         e disputava com o nome da dupla. Só aparece no navegador, sobre fundo movimentado. */
      background: #0b0b0c;
      color: #fff;
    }
    /* Divisor no lugar do vão entre linhas: o gap deixava passar uma fresta da câmera pelo
       meio do painel. */
    .row + .row {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .row--lead {
      background: #141416;
      box-shadow: inset 4px 0 0 var(--nx-orange-500);
    }

    .serve {
      flex: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
    }
    .serve--on {
      background: var(--nx-orange-500);
      box-shadow: 0 0 14px rgba(255, 106, 26, 0.9);
    }


    .name {
      flex: 1;
      min-width: 0;
      padding: 14px 0;
      font-size: 34px;
      font-weight: 700;
      letter-spacing: 0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sets {
      width: 76px;
      flex: none;
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      /* Sets vencidos são leitura de relance: a 0.72 sobre 0.07 o número sumia. */
      color: #fff;
      background: rgba(255, 255, 255, 0.16);
      align-self: stretch;
      display: grid;
      place-items: center;
    }

    .points {
      width: 112px;
      flex: none;
      font-size: 52px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      background: var(--nx-orange-500);
      align-self: stretch;
      display: grid;
      place-items: center;
    }

    .alert {
      margin-top: 10px;
      display: inline-block;
      padding: 8px 20px;
      border-radius: 999px;
      background: var(--nx-live);
      color: #fff;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.14em;
    }

  `,
})
export class OverlayScoreboardComponent {
  readonly view = input<OverlayDuelView | null>(null);
  readonly band = input('');
  readonly corner = input<OverlayCorner>('tl');
  /** Nome de exibição por id de dupla. Vazio enquanto o join não respondeu — o rótulo que
   *  veio no doc da partida segura o lugar. */
  readonly teamLabels = input<ReadonlyMap<string, string>>(new Map<string, string>());

  /** O estreitamento da união fica no TS: template não precisa saber discriminar. */
  readonly duel = computed(() => {
    const v = this.view();
    return v?.kind === 'duel' ? v : null;
  });
  labelOf(side: OverlaySide): string {
    return this.teamLabels().get(side.teamId) ?? side.label;
  }
}
