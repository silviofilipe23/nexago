import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import type { DecisivoView } from './overlay-decisivo';
import { nomeCurtoDe } from './overlay-nome';

type Side = 'A' | 'B';

const TITULO = { sp: 'Set point', mp: 'Match point', tb: 'Tie-break' } as const;
const MINI = { sp: 'Momento decisivo', mp: 'Momento decisivo', tb: 'Set decisivo' } as const;
const ORDINAL_TIPO = { sp: 'set point', mp: 'match point', tb: '' } as const;

/** Momento decisivo (1920×1080, fundo transparente): faixa centralizada embaixo avisando set point,
 *  match point ou tie-break, sobre o placar.
 *
 *  Só apresentação — `decisivoViewOf` traz os dados e a máquina (`decisivoNext`) decide quando
 *  entra, vira "Salvo" e sai. Troca de estado com a faixa na tela re-anima só o centro, o título e as duplas. */
@Component({
  selector: 'og-overlay-decisivo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="dc" [class.dc--salvo]="v.salvo" [class.dc--mp]="v.kind === 'mp'" animate.enter="dc-in" animate.leave="dc-out">
        @if (!v.salvo) {
          <i class="borda-pulso" aria-hidden="true"></i>
        }
        <div class="bloco">
          <div class="info dc-info">
            <span>{{ v.court }}</span>
            @if (v.category) { <i></i><span>{{ v.category }}</span> }
            <i></i>
            @if (v.kind === 'tb') {
              <b>Até {{ v.limite }} pontos</b>
            } @else {
              <b>Set {{ v.setNumber }}</b>
              <span class="bolas">
                @for (b of bolas(); track $index) { <u [class]="'b-' + b"></u> }
              </span>
            }
          </div>

          <div class="faixa dc-abre">
            @if (!v.salvo) { <i class="gira" aria-hidden="true"></i> }
            @for (k of [chave()]; track k) {
              <div class="lado lado--a dc-slide-l" [class.lado--chance]="chance(v, 'A')">
                <div class="nomes">
                  @for (n of jogadores(v, 'A'); track $index) { <span>{{ n }}</span> }
                  <em>{{ situacao(v, 'A') }}</em>
                </div>
                @if (v.a.ponto !== null) {
                  <span class="ponto"><i>Ponto</i><b>{{ v.a.ponto }}</b></span>
                }
                <b class="placar" [class.placar--pulso]="chance(v, 'A') && !v.salvo">{{ placar(v, 'A') }}</b>
              </div>

              <div class="centro">
                <i class="clarao" aria-hidden="true"></i>
                <span class="mini"><i></i>{{ v.salvo ? 'Salvo' : mini(v) }}<i></i></span>
                <h2>
                  @for (l of letras(v); track $index) { <span [style.--i]="$index">{{ l }}</span> }
                </h2>
              </div>

              <div class="lado lado--b dc-slide-r" [class.lado--chance]="chance(v, 'B')">
                <b class="placar" [class.placar--pulso]="chance(v, 'B') && !v.salvo">{{ placar(v, 'B') }}</b>
                @if (v.b.ponto !== null) {
                  <span class="ponto"><i>Ponto</i><b>{{ v.b.ponto }}</b></span>
                }
                <div class="nomes">
                  @for (n of jogadores(v, 'B'); track $index) { <span>{{ n }}</span> }
                  <em>{{ situacao(v, 'B') }}</em>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 34;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    @property --dc-ang {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }
    .dc {
      position: absolute;
      inset: 0;
    }
    /* Entrada: a faixa sobe 40 px; saída: desce 30 px sumindo. */
    .dc-in {
      animation: dc-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .dc-out {
      animation: dc-out 0.38s cubic-bezier(0.55, 0, 1, 0.45) both;
    }
    @keyframes dc-in {
      from {
        opacity: 0;
        transform: translateY(40px);
      }
    }
    @keyframes dc-out {
      to {
        opacity: 0;
        transform: translateY(30px);
      }
    }
    /* Bordas da tela pulsam em laranja; no match point, mais rápido. */
    .borda-pulso {
      position: absolute;
      inset: 0;
      box-shadow: inset 0 0 160px rgba(255, 106, 26, 0.5);
      animation: dc-pulso 1.6s ease-in-out infinite;
    }
    .dc--mp .borda-pulso {
      animation-duration: 0.9s;
    }
    @keyframes dc-pulso {
      0%,
      100% {
        opacity: 0.15;
      }
      50% {
        opacity: 1;
      }
    }

    .bloco {
      position: absolute;
      left: 50%;
      bottom: 64px;
      width: 1380px;
      margin-left: -690px;
    }
    .info {
      width: max-content;
      margin: 0 auto;
      padding: 10px 24px 14px;
      display: flex;
      align-items: center;
      gap: 14px;
      border-radius: 10px 10px 0 0;
      background: rgba(10, 10, 11, 0.94);
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: -4px;
      animation: dc-info 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
    }
    @keyframes dc-info {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
    }
    .info i {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.25);
    }
    .info b {
      color: #fff;
    }
    .bolas {
      display: flex;
      gap: 6px;
    }
    .bolas u {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.18);
    }
    .bolas .b-a {
      background: var(--o5);
    }
    .bolas .b-b {
      background: #fff;
    }

    .faixa {
      position: relative;
      height: 150px;
      display: grid;
      grid-template-columns: 1fr 630px 1fr;
      border-radius: 12px;
      overflow: hidden;
      background: #111113;
      border: 1px solid rgba(255, 106, 26, 0.55);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
    }
    /* Abre do centro para os lados. */
    .dc-abre {
      animation: dc-abre 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes dc-abre {
      from {
        clip-path: inset(0 50% 0 50%);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }
    /* Borda de luz girando. */
    .gira {
      position: absolute;
      inset: 0;
      border-radius: 12px;
      padding: 2px;
      background: conic-gradient(from var(--dc-ang), rgba(255, 106, 26, 0.2), var(--o5), #fff, var(--o5), rgba(255, 106, 26, 0.2));
      -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: dc-gira 3s linear infinite;
      z-index: 4;
    }
    @keyframes dc-gira {
      to {
        --dc-ang: 360deg;
      }
    }

    .lado {
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 0 30px;
      min-width: 0;
      color: rgba(255, 255, 255, 0.45);
    }
    .lado--b {
      justify-content: flex-end;
      text-align: right;
    }
    .dc-slide-l {
      animation: dc-slide-l 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    }
    .dc-slide-r {
      animation: dc-slide-r 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    }
    @keyframes dc-slide-l {
      from {
        opacity: 0;
        transform: translateX(-60px);
      }
    }
    @keyframes dc-slide-r {
      from {
        opacity: 0;
        transform: translateX(60px);
      }
    }
    .nomes {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .nomes span {
      font-size: 30px;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nomes em {
      margin-top: 10px;
      font-style: normal;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
    }
    .placar {
      flex: none;
      font-size: 96px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }
    /* Quem tem a chance: branco, com a situação em laranja; o outro lado fica apagado. */
    .lado--chance {
      color: #fff;
    }
    .lado--chance .nomes em {
      color: var(--o5);
      font-weight: 700;
    }
    /* Tênis/beach tennis: o ponto do game (0/15/30/40/AD) ao lado dos games do set. */
    .ponto {
      flex: none;
      min-width: 74px;
      padding: 8px 12px 6px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .ponto i {
      font-style: normal;
      font-family: var(--mono);
      font-size: 10px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }
    .ponto b {
      font-size: 40px;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .lado--chance .ponto {
      background: rgba(255, 106, 26, 0.16);
      box-shadow: inset 0 0 0 1px rgba(255, 106, 26, 0.5);
    }
    .placar--pulso {
      animation: dc-placar 1.2s ease-in-out infinite;
    }
    @keyframes dc-placar {
      50% {
        color: var(--o5);
        transform: scale(1.06);
      }
    }

    .centro {
      position: relative;
      overflow: hidden;
      background: var(--o5);
      color: #120600;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: background 0.3s ease;
    }
    .dc--salvo .centro {
      background: #fff;
    }
    /* Clarão vindo de baixo no destaque. */
    .clarao {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 120%, rgba(255, 255, 255, 0.85), transparent 65%);
      opacity: 0;
      animation: dc-clarao 0.9s ease-out 0.3s both;
    }
    @keyframes dc-clarao {
      0% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    .mini {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.3em;
      text-transform: uppercase;
    }
    .mini i {
      width: 36px;
      height: 1.5px;
      background: currentColor;
      opacity: 0.6;
    }
    h2 {
      position: relative;
      margin: 0;
      display: flex;
      font-size: 84px;
      font-weight: 800;
      line-height: 0.95;
      letter-spacing: -0.04em;
      text-transform: uppercase;
      white-space: pre;
    }
    /* Letras caem uma a uma, saindo do desfoque. */
    h2 span {
      display: inline-block;
      animation: dc-letra 0.45s cubic-bezier(0.22, 1, 0.36, 1) calc(0.35s + var(--i) * 0.045s) both;
    }
    @keyframes dc-letra {
      from {
        opacity: 0;
        transform: translateY(-34px);
        filter: blur(8px);
      }
    }
  `,
})
export class OverlayDecisivoComponent {
  readonly view = input<DecisivoView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());

  /** Muda a cada estado novo: só o centro, o título e as duplas animam de novo. */
  protected readonly chave = computed(() => {
    const v = this.view();
    return v ? `${v.kind}:${v.salvo}:${v.side}:${v.n}` : '';
  });

  /** Bolinhas dos sets: laranja pra dupla A, branco pra B, escuro pro que falta. */
  protected readonly bolas = computed<('a' | 'b' | 'x')[]>(() => {
    const v = this.view();
    if (!v) return [];
    const total = Math.max(v.bestOf, v.setsA + v.setsB);
    return Array.from({ length: total }, (_, i) => (i < v.setsA ? 'a' : i < v.setsA + v.setsB ? 'b' : 'x'));
  });

  protected chance(v: DecisivoView, side: Side): boolean {
    return v.side === side;
  }

  protected mini(v: DecisivoView): string {
    return MINI[v.kind];
  }

  protected letras(v: DecisivoView): string[] {
    return [...TITULO[v.kind]];
  }

  /** Placar grande: os PONTOS do set em andamento (vôlei) ou os GAMES do set (tênis/beach tennis, que
   *  ainda mostram o ponto do game ao lado); os sets ficam na linha de baixo de cada dupla e nas bolinhas. */
  protected placar(v: DecisivoView, side: Side): number {
    return side === 'A' ? v.a.score : v.b.score;
  }

  /** "Match point" / "2º match point" pra quem tem a chance (com os sets); "Sets 1" pro outro e no tie-break. */
  protected situacao(v: DecisivoView, side: Side): string {
    const sets = side === 'A' ? v.setsA : v.setsB;
    if (v.kind !== 'tb' && v.side === side) return `${v.n > 1 ? `${v.n}º ${ORDINAL_TIPO[v.kind]}` : TITULO[v.kind]} · Sets ${sets}`;
    return `Sets ${sets}`;
  }

  /** Um nome por linha: elenco carregado, senão o rótulo da partida. */
  protected jogadores(v: DecisivoView, side: Side): string[] {
    const t = side === 'A' ? v.a : v.b;
    const fromTeam = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    const p = fromTeam.length > 0 ? fromTeam : t.label.split(/\s*\/\s*/).map(nomeCurtoDe).filter((n) => n !== '');
    return p.length > 0 ? p : ['A definir'];
  }
}
