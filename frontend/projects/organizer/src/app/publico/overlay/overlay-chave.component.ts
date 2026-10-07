import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import { CHAVE_CARD_H, CHAVE_CARD_W, CHAVE_CHAMP_W, type ChaveNode, type ChaveSlot, type ChaveView } from './overlay-chave';
import { nomeCurtoDe } from './overlay-nome';

const AREA = { left: 60, top: 196, width: 1800, height: 850 };
/** Entrada: títulos em 0,4 s; cartões coluna por coluna (0,2 s entre colunas, 0,44 s cada) e, na coluna, de cima pra baixo. */
const COL_STEP_S = 0.2;
const ROW_STEP_S = 0.06;
const CARD_START_S = 0.35;
const CARD_S = 0.44;
const EDGE_S = 0.42;
/** O campeão entra por último, perto de 1,3 s. */
const CHAMP_AT_S = 1.3;
/** Efeitos de jogo (placar, vaga, fim, início, campeão) ficam marcados por este tempo. */
const FX_MS = 1600;

interface Fx {
  inicio: ReadonlySet<string>;
  terminou: ReadonlySet<string>;
  placar: ReadonlySet<string>;
  vaga: ReadonlySet<string>;
  campeao: boolean;
}
const NO_FX: Fx = { inicio: new Set(), terminou: new Set(), placar: new Set(), vaga: new Set(), campeao: false };

interface Snap {
  live: boolean;
  done: boolean;
  team: [string, string];
  score: [number | null, number | null];
}

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
        <i class="escurece" aria-hidden="true"></i>
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
              <path class="base" [attr.d]="e.d" pathLength="1" [style.animation-delay]="edgeDelay(e.col)" />
              @if (e.done) {
                <path class="acesa" [attr.d]="e.d" pathLength="1" [style.animation-delay]="entered() ? '0s' : edgeDelay(e.col)" />
              }
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
              [style.--d]="cardDelay(n.col, n.row)"
            >
              <div class="jogo-in" [class.jogo-in--inicio]="fx().inicio.has(n.matchId)">
              <header class="jh">
                <span>{{ n.code }}@if (n.court) { · {{ n.court }} }</span>
                @if (n.tag.kind !== 'nada') {
                  <b class="tag" [class]="'tag tag--' + n.tag.kind">@if (n.tag.kind === 'live') { <i class="dot"></i> }{{ n.tag.text }}</b>
                }
              </header>
              @for (s of slots(n); track $index) {
                <div class="lin" [class.lin--win]="s.winner" [class.lin--flash]="s.winner && fx().terminou.has(n.matchId)" [class.lin--lose]="s.loser" [class.lin--risca]="s.loser && n.eliminates">
                  <span class="nome" [class.nome--ph]="s.placeholder" [class.nome--entra]="fx().vaga.has(n.matchId + $index)">{{ nome(s) }}</span>
                  @if (s.score !== null) {
                    <b class="sc" [class.sc--pulso]="fx().placar.has(n.matchId + $index)">{{ s.score }}</b>
                  }
                </div>
              }
              </div>
            </article>
          }

          <aside
            class="camp ch-up"
            [class.camp--done]="v.champion.done"
            [style.left.px]="v.champion.left"
            [style.top.px]="v.champion.top"
            [style.width.px]="champW"
            [style.height.px]="cardH"
            style="--d: ${CHAMP_AT_S}s"
          >
            <div class="camp-in" [class.camp-in--entra]="fx().campeao">
              <span class="camp-k">{{ v.champion.done ? 'Campeões' : 'Campeão' }}</span>
              <b class="camp-n">{{ v.champion.done ? campeao(v) : 'A definir' }}</b>
            </div>
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
    /* Saída: a tela toda some em 0,36 s, acelerando. */
    .ch-out {
      animation: ch-saida 0.36s cubic-bezier(0.55, 0, 1, 0.45) both;
    }
    @keyframes ch-saida {
      to {
        opacity: 0;
      }
    }
    /* Escurecimento de fundo: a imagem da transmissão perde brilho pra chave aparecer. */
    .escurece {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 55%, rgba(8, 8, 10, 0.34), rgba(8, 8, 10, 0.62));
    }
    @keyframes ch-fade {
      from {
        opacity: 0;
      }
    }
    .ch-up {
      animation: ch-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    /* Cartões sobem 20 px enquanto aparecem (0,44 s, desacelerando). */
    .jogo.ch-up {
      animation: ch-up ${CARD_S}s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes ch-up {
      from {
        opacity: 0;
        transform: translateY(20px);
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
      stroke-width: 2.5;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: ch-draw ${EDGE_S}s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .liga path.base {
      stroke: rgba(255, 255, 255, 0.28);
    }
    /* Ligação acesa: redesenhada em laranja, da origem ao próximo jogo. */
    .liga path.acesa {
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
    /* Jogo começou: o cartão cresce 3% e volta (com mola). */
    .jogo-in {
      height: 100%;
    }
    /* No elemento de DENTRO: o cartão já tem a animação de entrada, e trocá-la a faria repetir. */
    .jogo-in--inicio {
      animation: ch-inicio 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes ch-inicio {
      40% {
        transform: scale(1.03);
      }
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 59, 59, 0.18);
      color: #ff7a7a;
    }
    /* "Ao vivo": bolinha vermelha piscando sem parar (ciclo de 1,6 s). */
    .tag--live .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #ff3b3b;
      animation: ch-pisca 1.6s ease-in-out infinite;
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
    }
    /* Jogo terminou: a linha da vencedora clareia forte e volta ao normal (0,7 s). */
    .lin--flash {
      animation: ch-venceu 0.7s ease-out 1;
    }
    @keyframes ch-venceu {
      0% {
        filter: brightness(2.4);
      }
    }
    /* Vaga preenchida: o nome entra deslizando da esquerda, depois que a ligação chega. */
    .nome--entra {
      animation: ch-nome 0.42s cubic-bezier(0.22, 1, 0.36, 1) 0.42s both;
    }
    @keyframes ch-nome {
      from {
        opacity: 0;
        transform: translateX(-24px);
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
    }
    .lin--win .sc {
      color: var(--o5);
    }
    /* Placar mudou: o número cresce a 140% e volta, com mola (0,42 s). */
    .sc--pulso {
      animation: ch-pulso 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes ch-pulso {
      0% {
        transform: scale(1.4);
      }
    }

    .camp {
      position: absolute;
      box-sizing: border-box;
      border-radius: 12px;
      border: 1.5px dashed rgba(255, 255, 255, 0.3);
      background: rgba(10, 10, 11, 0.5);
      text-align: center;
    }
    .camp-in {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
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
    .camp {
      animation: ch-camp-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 1.3s) both;
    }
    /* Entrada do campeão (a "A definir" aparece por último): cresce de 94% a 100%. */
    @keyframes ch-camp-in {
      from {
        opacity: 0;
        transform: scale(0.94);
      }
    }
    /* Campeão definido: parte de 90% e muito claro, passa do tamanho (103%) e assenta (0,9 s, mola). */
    .camp-in--entra {
      animation: ch-camp-def 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    @keyframes ch-camp-def {
      0% {
        transform: scale(0.9);
        filter: brightness(2.6);
      }
      60% {
        transform: scale(1.03);
      }
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

  protected readonly entered = signal(false);
  /** Efeitos de jogo em curso (só nas MUDANÇAS: a 1ª leitura é linha de base, não anima). */
  protected readonly fx = signal<Fx>(NO_FX);
  private prev: Map<string, Snap> | null = null;
  private prevChampion = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const v = this.view();
      untracked(() => this.diff(v));
    });
    destroyRef.onDestroy(() => this.timers.forEach(clearTimeout));
  }

  protected cardDelay(col: number, row: number): string {
    return `${CARD_START_S + col * COL_STEP_S + row * ROW_STEP_S}s`;
  }

  /** A ligação se desenha logo depois do cartão da coluna de origem. */
  protected edgeDelay(col: number): string {
    return `${CARD_START_S + col * COL_STEP_S + CARD_S}s`;
  }

  private snapOf(n: ChaveNode): Snap {
    return { live: n.live, done: n.tag.kind === 'fim', team: [n.a.teamId, n.b.teamId], score: [n.a.score, n.b.score] };
  }

  /** Compara com a leitura anterior e marca o que mudou, por `FX_MS`. */
  private diff(v: ChaveView | null): void {
    if (!v) {
      this.prev = null;
      this.prevChampion = false;
      this.entered.set(false);
      return;
    }
    const cur = new Map(v.nodes.map((n) => [n.matchId, this.snapOf(n)] as const));
    if (this.prev) {
      const add = (kind: 'inicio' | 'terminou' | 'placar' | 'vaga', key: string) => {
        this.fx.update((f) => ({ ...f, [kind]: new Set([...f[kind], key]) }));
        const t = setTimeout(() => {
          this.timers.delete(t);
          this.fx.update((f) => ({ ...f, [kind]: new Set([...f[kind]].filter((k) => k !== key)) }));
        }, FX_MS);
        this.timers.add(t);
      };
      for (const n of v.nodes) {
        const p = this.prev.get(n.matchId);
        const c = cur.get(n.matchId)!;
        if (!p) continue;
        if (!p.live && c.live) add('inicio', n.matchId);
        if (!p.done && c.done) add('terminou', n.matchId);
        ([0, 1] as const).forEach((i) => {
          if (c.score[i] !== null && p.score[i] !== c.score[i]) add('placar', n.matchId + i);
          if (p.team[i] === '' && c.team[i] !== '') add('vaga', n.matchId + i);
        });
      }
      if (!this.prevChampion && v.champion.done) {
        this.fx.update((f) => ({ ...f, campeao: true }));
        const t = setTimeout(() => {
          this.timers.delete(t);
          this.fx.update((f) => ({ ...f, campeao: false }));
        }, FX_MS);
        this.timers.add(t);
      }
    } else {
      // A entrada leva ~2 s; depois dela, ligações que acendem se redesenham sem atraso.
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.entered.set(true);
      }, 2200);
      this.timers.add(t);
    }
    this.prev = cur;
    this.prevChampion = v.champion.done;
  }

  protected slots(n: ChaveNode): ChaveSlot[] {
    return [n.a, n.b];
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
