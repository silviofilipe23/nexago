import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OverlayKocBlock } from './overlay-koc-bar';
import type { OverlayKocView } from './overlay-selectors';

export interface OverlayKocTeam {
  players: [string, string];
}

/** Faixa de transmissão da rodada King of the Court.
 *
 *  Componente PRÓPRIO, e não um ramo do placar de duelo: a rodada KOTC não é um confronto de
 *  dois lados, é a fila inteira lida da esquerda (fundo da fila) para a direita (trono, colado
 *  no cronômetro). A cor aqui codifica PAPEL — fila neutra, desafiante em âmbar, rei em laranja
 *  cheia — e não identidade de dupla. */
@Component({
  selector: 'og-overlay-koc-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="wrap" [attr.data-pos]="position()">
        <div class="status">
          @if (v.phase === 'live') {
            <span class="status-live"><i class="dot"></i>AO VIVO</span>
          }
          @if (categoryName()) {
            <span class="status-seg status-seg--strong">{{ categoryName() }}</span>
          }
          <span class="status-seg">{{ v.roundTitle }}</span>
          @if (courtName()) {
            <span class="status-seg">{{ courtName() }}</span>
          }
        </div>

        <div class="bar">
          @if (queue().length > 0) {
            <section class="group" data-group="queue">
              <div class="label">NA FILA</div>
              <div class="row">
                @for (b of queue(); track b.teamId) {
                  <div class="block" data-role="queue" [class.block--next]="b.nextUp">
                    <div class="players">
                      <span>{{ playersOf(b.teamId)[0] }}</span>
                      <span>{{ playersOf(b.teamId)[1] }}</span>
                    </div>
                    <span class="points">{{ b.points }}</span>
                  </div>
                }
              </div>
            </section>
          }

          @if (challenger(); as c) {
            <section class="group" data-group="challenger">
              <div class="label">DESAFIANTE</div>
              <div class="row">
                <div class="block" data-role="challenger">
                  <div class="players">
                    <span>{{ playersOf(c.teamId)[0] }}</span>
                    <span>{{ playersOf(c.teamId)[1] }}</span>
                  </div>
                  <span class="points">{{ c.points }}</span>
                </div>
              </div>
            </section>
          }

          @if (king(); as k) {
            <section class="group" data-group="king">
              <div class="label">
                NO TRONO
                @if (v.bar.streak; as streak) {
                  <span class="streak">{{ streak }} SEGUIDAS</span>
                }
              </div>
              <div class="row">
                <div class="block" data-role="king">
                  <div class="players">
                    <span>{{ playersOf(k.teamId)[0] }}</span>
                    <span>{{ playersOf(k.teamId)[1] }}</span>
                  </div>
                  <span class="points">{{ k.points }}</span>
                </div>
              </div>
            </section>
          }

          @if (v.bar.clock; as clock) {
            <section class="group" data-group="time">
              <div class="label">TEMPO</div>
              <div class="row">
                <div class="clock" [class.clock--paused]="clock.paused">{{ clock.label }}</div>
              </div>
            </section>
          }
        </div>
      </div>

      <div class="mark" [attr.data-pos]="position()">
        <span>NEXA</span><span class="mark-go">GO</span><span class="mark-tag">· KOTC</span>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    .wrap,
    .mark {
      position: absolute;
      /* Margem de segurança de transmissão. */
      --gap: 48px;
    }
    .wrap[data-pos='bottom'] {
      bottom: var(--gap);
      left: var(--gap);
    }
    .wrap[data-pos='top'] {
      top: var(--gap);
      left: var(--gap);
    }
    .mark[data-pos='bottom'] {
      bottom: var(--gap);
      right: var(--gap);
    }
    .mark[data-pos='top'] {
      top: var(--gap);
      right: var(--gap);
    }

    .status {
      display: inline-flex;
      align-items: stretch;
      margin-bottom: 10px;
      border-radius: 8px;
      overflow: hidden;
      background: #121214;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .status-live,
    .status-seg {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 16px;
      color: #8c8c94;
    }
    .status-live {
      color: var(--nx-live, #ff3b30);
    }
    .status-seg {
      border-left: 1px solid rgba(255, 255, 255, 0.12);
    }
    .status-seg--strong {
      color: #fff;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: currentColor;
    }

    /* SEM overflow:hidden — ele recortava o selo de sequência, que flutua acima da tarja.
       O arredondamento vai nas pontas, uma regra por canto. */
    .bar {
      display: flex;
      align-items: stretch;
    }
    .group:first-of-type .label {
      border-top-left-radius: 10px;
    }
    .group:first-of-type .block:first-child {
      border-bottom-left-radius: 10px;
    }
    .group:last-of-type .label {
      border-top-right-radius: 10px;
    }
    .group:last-of-type .clock,
    .group:last-of-type .block:last-child {
      border-bottom-right-radius: 10px;
    }

    .group {
      display: flex;
      flex-direction: column;
    }

    .label {
      position: relative;
      padding: 7px 16px;
      background: #121214;
      color: #8c8c94;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-align: center;
      text-transform: uppercase;
      white-space: nowrap;
    }
    [data-group='challenger'] .label {
      color: var(--nx-orange-500, #ff6a1a);
      background: #1d1108;
    }
    [data-group='king'] .label {
      background: var(--nx-orange-500, #ff6a1a);
      color: #1a0d03;
      /* Alinhado à esquerda porque o selo de sequência ocupa a direita da tarja — centralizado,
         "NO TRONO" ficava POR BAIXO do selo. */
      text-align: left;
    }

    /* Selo de sequência: flutua sobre a tarja do trono, como um adesivo. */
    .streak {
      position: absolute;
      top: -13px;
      right: 10px;
      padding: 5px 12px;
      border-radius: 999px;
      background: #0b0b0c;
      color: #fff;
      font-size: 12px;
      letter-spacing: 0.14em;
    }

    .row {
      display: flex;
      flex: 1;
      align-items: stretch;
    }

    .block {
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 12px 18px;
      /* Opaco: a imagem da câmera não pode disputar com o nome da dupla. */
      background: #1a1a1c;
      color: #e7e7ea;
    }
    .block + .block {
      border-left: 1px solid rgba(255, 255, 255, 0.08);
    }
    .block--next {
      background: #202024;
    }
    .block[data-role='challenger'] {
      background: #2a1708;
      color: #fff;
    }
    .block[data-role='king'] {
      background: var(--nx-orange-500, #ff6a1a);
      color: #1a0d03;
    }

    .players {
      display: grid;
      font-weight: 800;
      line-height: 1.12;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .players span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Escada de tamanho: quem está em quadra é o que a narração usa. */
    [data-role='queue'] .players {
      font-size: 20px;
      /* Nome de exibição do nexaGO é mais longo que o sobrenome de transmissão ("Bernardo 213",
         não "BRO") — a 150px a fila inteira aparecia reticenciada. */
      max-width: 200px;
    }
    [data-role='challenger'] .players {
      font-size: 25px;
      max-width: 260px;
    }
    [data-role='king'] .players {
      font-size: 28px;
      max-width: 320px;
    }

    .points {
      margin-left: auto;
      font-size: 27px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    .clock {
      display: grid;
      place-items: center;
      flex: 1;
      padding: 12px 22px;
      background: #0b0b0c;
      color: #fff;
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.06em;
    }
    .clock--paused {
      color: var(--nx-pending, #f4c543);
    }

    .mark {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 11px 18px;
      border-radius: 10px;
      background: #121214;
      color: #fff;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.1em;
    }
    .mark-go {
      color: var(--nx-orange-500, #ff6a1a);
    }
    .mark-tag {
      color: #8c8c94;
      letter-spacing: 0.14em;
    }
  `,
})
export class OverlayKocBarComponent {
  readonly view = input<OverlayKocView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  /** A faixa ocupa a largura toda: só sobe ou desce, não vai pros cantos como o duelo. */
  readonly position = input<'top' | 'bottom'>('bottom');

  private readonly blocks = computed<OverlayKocBlock[]>(() => this.view()?.bar.blocks ?? []);

  readonly queue = computed(() => this.blocks().filter((b) => b.role === 'queue'));
  readonly challenger = computed(() => this.blocks().find((b) => b.role === 'challenger') ?? null);
  readonly king = computed(() => this.blocks().find((b) => b.role === 'king') ?? null);

  playersOf(teamId: string): [string, string] {
    return this.teams().get(teamId)?.players ?? ['', ''];
  }
}
