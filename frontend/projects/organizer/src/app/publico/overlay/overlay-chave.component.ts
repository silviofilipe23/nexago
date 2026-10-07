import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import { CHAVE_CARD_H, CHAVE_CARD_W, CHAVE_CHAMP_W, type ChaveNode, type ChaveSlot, type ChaveView } from './overlay-chave';
import { nomeCurtoDe } from './overlay-nome';

const AREA = { left: 60, top: 196, width: 1800, height: 850 };
/** Colunas entram em sequência: cada uma .18 s depois da anterior. */
const COL_STEP_S = 0.18;

/** Chaves (1920×1080, fundo transparente): a chave eliminatória da categoria sobre a transmissão.
 *
 *  Só apresentação — `chaveViewOf` já traz geometria, cartões, ligações e campeão. O "palco" é
 *  escalado pra caber na área útil (a chave de 16 duplas é bem maior que a de 8). */
@Component({
  selector: 'og-overlay-chave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="tela" animate.enter="ch-in" animate.leave="ch-out">
        <header class="head">
          <div class="ch-up" style="--d: 0.05s">
            <div class="ctx">{{ eventName() }} @if (eventName()) { <i></i> } {{ v.formatLabel }}</div>
            <h1>{{ categoryName() }} <b>·</b> <em>Chave</em></h1>
          </div>
          <span class="marca ch-up" style="--d: 0.1s">NEXA<b>GO</b></span>
        </header>

        <div class="palco" [style.width.px]="v.width" [style.height.px]="v.height" [style.transform]="transform()">
          <svg class="liga" [attr.width]="v.width" [attr.height]="v.height" aria-hidden="true">
            @for (e of v.edges; track $index) {
              <path [attr.d]="e.d" pathLength="1" [class.feita]="e.done" [style.animation-delay]="e.col * ${COL_STEP_S} + 0.3 + 's'" />
            }
          </svg>

          @for (l of v.labels; track l.left) {
            <span class="col-t ch-up" [style.left.px]="l.left" [style.top.px]="l.top" style="--d: 0.15s">{{ l.label }}</span>
          }

          @for (n of v.nodes; track n.matchId) {
            <article
              class="jogo ch-up"
              [class.jogo--live]="n.live"
              [style.left.px]="n.left"
              [style.top.px]="n.top + slotGap"
              [style.width.px]="cardW"
              [style.height.px]="cardH"
              [style.--d]="0.2 + n.col * ${COL_STEP_S} + 's'"
            >
              <header class="jh">
                <span>{{ n.code }}@if (n.court) { · {{ n.court }} }</span>
                @if (n.tag.kind !== 'nada') {
                  <b class="tag" [class]="'tag tag--' + n.tag.kind">{{ n.tag.text }}</b>
                }
              </header>
              @for (s of slots(n); track $index) {
                <div class="lin" [class.lin--win]="s.winner" [class.lin--lose]="s.loser" [class.lin--risca]="s.loser && n.eliminates">
                  <span class="nome" [class.nome--ph]="s.placeholder">{{ nome(s) }}</span>
                  @if (s.score !== null) {
                    @for (k of [s.score]; track k) { <b class="sc">{{ k }}</b> }
                  }
                </div>
              }
            </article>
          }

          <aside
            class="camp ch-up"
            [class.camp--done]="v.champion.done"
            [style.left.px]="v.champion.left"
            [style.top.px]="v.champion.top"
            [style.width.px]="champW"
            [style.height.px]="cardH"
            [style.--d]="0.5 + lastCol(v) * ${COL_STEP_S} + 's'"
          >
            <span class="camp-k">{{ v.champion.done ? 'Campeões' : 'Campeão' }}</span>
            <b class="camp-n">{{ v.champion.done ? campeao(v) : 'A definir' }}</b>
          </aside>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 36;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .tela {
      position: absolute;
      inset: 0;
    }
    .ch-in {
      animation: ch-fade 0.5s ease both;
    }
    .ch-out {
      animation: ch-fade 0.4s ease reverse both;
    }
    @keyframes ch-fade {
      from {
        opacity: 0;
      }
    }
    .ch-up {
      animation: ch-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes ch-up {
      from {
        opacity: 0;
        transform: translateY(24px);
      }
    }

    .head {
      position: absolute;
      left: 60px;
      right: 60px;
      top: 36px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .ctx {
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .ctx i {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.28);
    }
    h1 {
      margin: 8px 0 0;
      font-size: 72px;
      font-weight: 800;
      letter-spacing: -0.02em;
      text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
    }
    h1 b {
      color: rgba(255, 255, 255, 0.7);
    }
    h1 em {
      font-style: normal;
      color: var(--o5);
    }
    .marca {
      margin-top: 28px;
      padding: 10px 18px;
      border-radius: 8px;
      background: rgba(10, 10, 11, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 26px;
      font-weight: 800;
    }
    .marca b {
      color: var(--o5);
    }

    .palco {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
    }
    .liga {
      position: absolute;
      left: 0;
      top: 0;
      overflow: visible;
    }
    .liga path {
      fill: none;
      stroke: rgba(255, 255, 255, 0.28);
      stroke-width: 2.5;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: ch-draw 0.7s ease-out both;
      transition:
        stroke 0.6s ease,
        filter 0.6s ease;
    }
    .liga path.feita {
      stroke: var(--o5);
      filter: drop-shadow(0 0 6px rgba(255, 106, 26, 0.9));
    }
    @keyframes ch-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    .col-t {
      position: absolute;
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.26em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
    }

    .jogo {
      position: absolute;
      box-sizing: border-box;
      overflow: hidden;
      border-radius: 9px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(14, 14, 16, 0.94);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    }
    .jogo--live {
      border-color: var(--o5);
      box-shadow:
        0 10px 28px rgba(0, 0, 0, 0.5),
        0 0 18px rgba(255, 106, 26, 0.45);
    }
    .jh {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 34px;
      padding: 0 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .tag {
      padding: 3px 9px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.8);
      font-size: 11px;
    }
    .tag--live {
      background: rgba(255, 59, 59, 0.18);
      color: #ff7a7a;
      animation: ch-pisca 1.2s ease-in-out infinite;
    }
    .tag--fim {
      color: rgba(255, 255, 255, 0.6);
    }
    @keyframes ch-pisca {
      50% {
        opacity: 0.45;
      }
    }
    .lin {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      height: 44px;
      padding: 0 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
    }
    .lin--win {
      background: linear-gradient(90deg, rgba(255, 106, 26, 0.34), rgba(255, 106, 26, 0.05));
      animation: ch-venceu 1.4s ease-out 1;
    }
    @keyframes ch-venceu {
      0% {
        filter: brightness(1.9);
      }
    }
    .lin--lose {
      opacity: 0.5;
    }
    .lin--risca .nome {
      text-decoration: line-through;
    }
    .nome {
      min-width: 0;
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nome--ph {
      font-style: italic;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.55);
    }
    .sc {
      font-family: var(--mono);
      font-size: 24px;
      font-weight: 700;
      animation: ch-pulso 0.6s ease-out;
    }
    .lin--win .sc {
      color: var(--o5);
    }
    @keyframes ch-pulso {
      0% {
        transform: scale(1.5);
      }
    }

    .camp {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 12px;
      border: 1.5px dashed rgba(255, 255, 255, 0.3);
      background: rgba(10, 10, 11, 0.5);
      text-align: center;
    }
    .camp-k {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .camp-n {
      padding: 0 14px;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: rgba(255, 255, 255, 0.55);
    }
    .camp--done {
      border: 1.5px solid var(--o5);
      background: linear-gradient(180deg, rgba(255, 106, 26, 0.3), rgba(10, 10, 11, 0.92));
      box-shadow: 0 0 40px rgba(255, 106, 26, 0.55);
    }
    .camp--done .camp-k {
      color: var(--o4);
    }
    .camp--done .camp-n {
      font-size: 26px;
      color: #fff;
    }
  `,
})
export class OverlayChaveComponent {
  readonly view = input<ChaveView | null>(null);
  readonly categoryName = input('');
  readonly eventName = input('');
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());

  protected readonly cardW = CHAVE_CARD_W;
  protected readonly cardH = CHAVE_CARD_H;
  protected readonly champW = CHAVE_CHAMP_W;
  /** O nó do motor tem a altura do cartão do painel (154); o do overlay é mais baixo e fica centrado. */
  protected readonly slotGap = (154 - CHAVE_CARD_H) / 2;

  /** O palco cabe na área útil: a chave de 16 duplas é bem maior que a de 8. */
  protected readonly transform = computed(() => {
    const v = this.view();
    if (!v) return '';
    const s = Math.min(AREA.width / v.width, AREA.height / v.height, 1.35);
    const x = AREA.left + (AREA.width - v.width * s) / 2;
    const y = AREA.top + (AREA.height - v.height * s) / 2;
    return `translate(${x}px, ${y}px) scale(${s})`;
  });

  protected slots(n: ChaveNode): ChaveSlot[] {
    return [n.a, n.b];
  }

  protected lastCol(v: ChaveView): number {
    return Math.max(0, ...v.nodes.map((n) => n.col)) + 1;
  }

  private players(teamId: string, label: string): string[] {
    const fromTeam = (this.teams().get(teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    return fromTeam.length > 0 ? fromTeam : label.split(/\s*[/·]\s*/).map(nomeCurtoDe).filter((p) => p !== '');
  }

  /** "Alison · Bruno"; vaga sem dupla mostra a origem em itálico ("Vencedor Semi 1"). */
  protected nome(s: ChaveSlot): string {
    if (s.placeholder) return s.label;
    const p = this.players(s.teamId, s.label);
    return p.length > 0 ? p.join(' · ') : s.label;
  }

  protected campeao(v: ChaveView): string {
    const c = v.champion;
    if (!c.teamId) return '';
    const p = this.players(c.teamId, c.label ?? '');
    return p.length > 0 ? p.join(' · ') : (c.label ?? '');
  }
}
