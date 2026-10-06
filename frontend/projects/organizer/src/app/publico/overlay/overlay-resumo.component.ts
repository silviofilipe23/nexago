import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import { nomeCurtoDe } from './overlay-nome';
import type { OverlayPatroItem } from './overlay-nx';
import type { ResumoView } from './overlay-resumo';

const FLOW_W = 1000;
const FLOW_H = 126;
const MID = FLOW_H / 2;
/** Tempo total da cascata de entrada + folga; depois disso o relógio de animação para. */
const ANIM_TOTAL_MS = 4200;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);

interface Spark {
  x: number;
  s: number;
  t: number;
  dl: number;
  dx: number;
}

/** mulberry32: mesma semente, mesma sequência — as faíscas são idênticas em toda tela e a cada abertura. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tela de Resumo (1920×1080): card de 1440 px a 64 px do topo, sobre um escurecimento radial.
 *
 *  Só apresentação — `resumoOf` já entrega tudo calculado. Os números contam de 0 ao valor em 1 s
 *  (ease-out cúbico) a partir do atraso do próprio bloco; a cascata de entrada é por CSS. */
@Component({
  selector: 'og-overlay-resumo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <div class="scrim" animate.enter="rs-fade-in" animate.leave="rs-fade-out"></div>
      <div class="flash" aria-hidden="true"></div>
      <section class="card" animate.enter="rs-card-in" animate.leave="rs-card-out" aria-label="Resumo da partida">
        <i class="filete" aria-hidden="true"></i>
        @if (winnerSide() !== null) {
          <div class="rs-fx" aria-hidden="true">
            @for (k of sparks(); track $index) {
              <span class="spk" [style.--x]="k.x + '%'" [style.--s]="k.s + 'px'" [style.--t]="k.t + 's'" [style.--dl]="k.dl + 's'" [style.--dx]="k.dx + 'px'"></span>
            }
          </div>
        }

        <header class="head rs-b" style="--d: 0.35s">
          <span class="selo"><b class="selo-shine" aria-hidden="true"></b>{{ v.selo }}</span>
          <span class="ctx">{{ v.contexto }}</span>
          @if (v.duracao) {
            <span class="dur">Duração <b>{{ v.duracao }}</b></span>
          }
        </header>

        <div class="hero">
          @for (side of sides; track side; let i = $index) {
            <div class="dupla" [class.dupla--b]="side === 'B'" [class.dupla--win]="isWin(v, side)" [class.dupla--lose]="v.a.winner || v.b.winner ? !isWin(v, side) : false" [class.rs-b]="true" [style.--d]="0.55 + i * 0.1 + 's'">
              <i class="traco" [class.traco--b]="side === 'B'"></i>
              @if (isWin(v, side)) {
                <span class="pilula">Vencedores</span>
              }
              <div class="nomes">
                @for (n of namesOf(v, side); track $index) {
                  <span class="nome">{{ n }}</span>
                }
              </div>
            </div>
            @if (i === 0) {
              <div class="placar rs-b" style="--d: 0.8s">
                <span class="pl" [class.pl--win]="v.a.winner">{{ count(v.setsA, 0.8) }}</span>
                <span class="x">×</span>
                <span class="pl" [class.pl--win]="v.b.winner">{{ count(v.setsB, 0.8) }}</span>
              </div>
            }
          }
        </div>

        <div class="meio">
          <div class="sets">
            @for (s of v.sets; track $index) {
              <div class="setcard rs-b" [style.--d]="1 + $index * 0.12 + 's'">
                <span class="setlbl">{{ s.label }}</span>
                <div class="setrow" [class.setrow--win]="s.winner === 'A'">
                  <i class="stroke"></i><b>{{ count(s.a, 1 + $index * 0.12) }}</b>
                </div>
                <div class="setrow setrow--b" [class.setrow--win]="s.winner === 'B'">
                  <i class="stroke stroke--b"></i><b>{{ count(s.b, 1 + $index * 0.12) }}</b>
                </div>
              </div>
            }
          </div>

          @if (flow(); as f) {
            <div class="fluxo rs-b" style="--d: 1.2s">
              <div class="fluxo-head">
                <span>Fluxo do jogo</span>
                <span class="leg"><i class="sw"></i>{{ sobrenomes(v, 'A') }}<i class="sw sw--b"></i>{{ sobrenomes(v, 'B') }}</span>
              </div>
              <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" class="chart" aria-hidden="true">
                <defs>
                  <clipPath [attr.id]="'up' + uid"><rect x="0" y="0" [attr.width]="W" [attr.height]="mid" /></clipPath>
                  <clipPath [attr.id]="'dn' + uid"><rect x="0" [attr.y]="mid" [attr.width]="W" [attr.height]="mid" /></clipPath>
                </defs>
                @for (b of f.breaks; track b.x) {
                  <line class="div" [attr.x1]="b.x" [attr.x2]="b.x" y1="0" [attr.y2]="H" vector-effect="non-scaling-stroke" />
                }
                <line class="axis" x1="0" [attr.x2]="W" [attr.y1]="mid" [attr.y2]="mid" vector-effect="non-scaling-stroke" />
                <g [attr.clip-path]="'url(#up' + uid + ')'">
                  <path class="area area--a" [attr.d]="f.area" />
                  <path class="line line--a" [attr.d]="f.line" pathLength="1" vector-effect="non-scaling-stroke" />
                </g>
                <g [attr.clip-path]="'url(#dn' + uid + ')'">
                  <path class="area area--b" [attr.d]="f.area" />
                  <path class="line line--b" [attr.d]="f.line" pathLength="1" vector-effect="non-scaling-stroke" />
                </g>
              </svg>
              <div class="rotulos">
                @for (b of f.breaks; track b.x) {
                  <span [style.left.%]="b.x / W * 100">{{ b.label }}</span>
                }
              </div>
            </div>
          }
        </div>

        @if (v.stats.length > 0) {
          <div class="stats">
            @for (r of v.stats; track r.label; let i = $index) {
              <div class="stat rs-b" [style.--d]="1.8 + i * 0.12 + 's'">
                <b class="val" [class.val--max]="r.a > r.b">{{ count(r.a, 1.8 + i * 0.12) }}</b>
                <span class="bar bar--l"><i [style.width.%]="pct(r.a, r)" [style.animation-delay]="1.8 + i * 0.12 + 's'"></i></span>
                <span class="rot">{{ r.label }}</span>
                <span class="bar"><i class="bar-b" [style.width.%]="pct(r.b, r)" [style.animation-delay]="1.8 + i * 0.12 + 's'"></i></span>
                <b class="val val--r" [class.val--max]="r.b > r.a">{{ count(r.b, 1.8 + i * 0.12) }}</b>
              </div>
            }
          </div>
        }

        @if (sponsors().length > 0) {
          <div class="patro rs-b" style="--d: 2.6s">
            <span class="patro-t">Oferecimento</span>
            <div class="patro-grid" [style.grid-template-columns]="'repeat(' + sponsors().length + ', 1fr)'">
              @for (s of sponsors(); track $index) {
                <div class="plogo" [class.plogo--img]="!!s.logo" [style.animation-delay]="2.7 + $index * 0.09 + 's'">
                  @if (s.logo) {
                    <img [src]="s.logo" [alt]="s.nome" />
                  } @else {
                    <span>{{ s.nome }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      position: absolute;
      inset: 0;
      z-index: 40;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(11, 11, 12, 0.5), rgba(5, 5, 6, 0.9));
    }
    .rs-fade-in {
      animation: rs-fade 0.7s ease both;
    }
    .rs-fade-out {
      animation: rs-fade 0.45s ease reverse both;
    }
    @keyframes rs-fade {
      from {
        opacity: 0;
      }
    }
    .flash {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 30%, rgba(255, 106, 26, 0.35), transparent 60%);
      opacity: 0;
      animation: rs-flash 1.2s ease-out both;
    }
    @keyframes rs-flash {
      0% {
        opacity: 0;
      }
      25% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }

    .card {
      position: absolute;
      top: 64px;
      left: 50%;
      width: 1440px;
      margin-left: -720px;
      box-sizing: border-box;
      padding: 34px 52px 32px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      overflow: hidden;
      background: rgba(11, 11, 12, 0.95);
      border: 1px solid rgba(255, 138, 74, 0.4);
      border-radius: var(--nx-r-2, 10px);
      box-shadow:
        0 30px 90px rgba(0, 0, 0, 0.65),
        0 0 60px rgba(255, 106, 26, 0.12);
    }
    .rs-card-in {
      animation: rs-card-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .rs-card-out {
      animation: rs-card-out 0.45s ease-in both;
    }
    @keyframes rs-card-in {
      from {
        opacity: 0;
        transform: translateY(40px) scale(0.96);
        filter: blur(10px);
      }
    }
    @keyframes rs-card-out {
      to {
        opacity: 0;
        transform: translateY(-30px);
      }
    }
    .rs-b {
      animation: rs-up 0.65s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes rs-up {
      from {
        opacity: 0;
        transform: translateY(20px);
        filter: blur(6px);
      }
    }

    .filete {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--o5), #ffd2b3, var(--o5), transparent);
      transform-origin: 50% 50%;
      animation: rs-filete 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
    }
    @keyframes rs-filete {
      from {
        transform: scaleX(0);
      }
    }
    /* Camada das faíscas: atrás de todo o conteúdo (z-index 1); o overflow do card corta na borda. */
    .rs-fx {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 0;
    }
    .card > :not(.rs-fx):not(.filete) {
      position: relative;
      z-index: 1;
    }
    .spk {
      position: absolute;
      bottom: -8px;
      left: var(--x);
      width: var(--s);
      height: var(--s);
      border-radius: 50%;
      background: var(--o4);
      box-shadow: 0 0 10px rgba(255, 138, 74, 0.9);
      opacity: 0;
      animation: spk var(--t) linear var(--dl) infinite;
    }
    @keyframes spk {
      0% {
        opacity: 0;
        transform: translate(0, 0);
      }
      12% {
        opacity: 0.9;
      }
      100% {
        opacity: 0;
        transform: translate(var(--dx), -820px);
      }
    }

    .head {
      display: flex;
      align-items: center;
      gap: 18px;
      font-family: var(--mono);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(255, 255, 255, 0.55);
    }
    .selo {
      position: relative;
      overflow: hidden;
      padding: 8px 14px;
      border-radius: 6px;
      background: var(--o5);
      color: #120600;
      font-weight: 700;
      letter-spacing: 0.22em;
    }
    .selo-shine {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      transform: translateX(-150%) skewX(-18deg);
      animation: rs-shine 2.8s ease-in-out infinite;
    }
    @keyframes rs-shine {
      0%,
      60% {
        transform: translateX(-150%) skewX(-18deg);
      }
      100% {
        transform: translateX(400%) skewX(-18deg);
      }
    }
    .dur {
      margin-left: auto;
    }
    .dur b {
      color: #fff;
    }

    .hero {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      column-gap: 40px;
      align-items: center;
    }
    .dupla {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
    }
    .dupla--b {
      align-items: flex-end;
      text-align: right;
    }
    .traco {
      width: 44px;
      height: 6px;
      border-radius: 3px;
      background: var(--o5);
    }
    .traco--b {
      background: #e9e9ec;
    }
    .pilula {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      padding: 5px 12px;
      border-radius: 999px;
      color: var(--o4);
      border: 1px solid var(--o5);
      animation: rs-glow 1.6s ease-in-out infinite alternate;
    }
    @keyframes rs-glow {
      from {
        box-shadow: 0 0 0 rgba(255, 106, 26, 0);
      }
      to {
        box-shadow: 0 0 18px rgba(255, 106, 26, 0.6);
      }
    }
    .nomes {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .nome {
      font-size: 50px;
      font-weight: 800;
      line-height: 1.05;
      text-transform: uppercase;
      color: rgba(244, 244, 245, 0.55);
    }
    .dupla--win .nome {
      color: #fff;
      background: linear-gradient(100deg, #fff 40%, #ffd2b3 50%, #fff 60%) 0 0 / 250% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: rs-text-shine 3.2s linear infinite;
    }
    @keyframes rs-text-shine {
      from {
        background-position: 120% 0;
      }
      to {
        background-position: -120% 0;
      }
    }
    .placar {
      display: flex;
      align-items: center;
      gap: 24px;
      font-family: var(--mono);
      font-weight: 700;
    }
    .pl {
      font-size: 150px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .pl--win {
      color: var(--o5);
      text-shadow: 0 0 40px rgba(255, 106, 26, 0.55);
    }
    .x {
      font-size: 56px;
      color: rgba(255, 255, 255, 0.35);
    }

    .meio {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 24px;
    }
    .sets {
      display: flex;
      gap: 12px;
    }
    .setcard {
      width: 148px;
      box-sizing: border-box;
      padding: 14px 16px;
      border-radius: 8px;
      background: #141416;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .setlbl {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .setrow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-family: var(--mono);
      font-size: 42px;
      font-weight: 700;
      line-height: 1.1;
      color: rgba(255, 255, 255, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .setrow b {
      font-weight: 700;
    }
    .setrow--win {
      color: #fff;
    }
    .stroke {
      width: 6px;
      height: 28px;
      border-radius: 2px;
      background: var(--o5);
      opacity: 0.45;
    }
    .stroke--b {
      background: #e9e9ec;
    }
    .setrow--win .stroke {
      opacity: 1;
    }

    .fluxo {
      min-width: 0;
      box-sizing: border-box;
      padding: 14px 20px 10px;
      border-radius: 8px;
      background: #0e0e10;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .fluxo-head {
      display: flex;
      justify-content: space-between;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .leg {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sw {
      width: 14px;
      height: 6px;
      border-radius: 3px;
      background: var(--o5);
    }
    .sw--b {
      background: #e9e9ec;
      margin-left: 12px;
    }
    .chart {
      width: 100%;
      height: 126px;
      display: block;
    }
    .axis {
      stroke: rgba(255, 255, 255, 0.25);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }
    .div {
      stroke: rgba(255, 255, 255, 0.12);
      stroke-width: 1;
    }
    .line {
      fill: none;
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: rs-draw 1.7s ease-in-out 1.3s forwards;
    }
    .line--a {
      stroke: var(--o5);
    }
    .line--b {
      stroke: #e9e9ec;
    }
    @keyframes rs-draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    .area {
      opacity: 0;
      animation: rs-area 0.8s ease 2.6s forwards;
    }
    .area--a {
      fill: rgba(255, 106, 26, 0.22);
    }
    .area--b {
      fill: rgba(233, 233, 236, 0.16);
    }
    @keyframes rs-area {
      to {
        opacity: 1;
      }
    }
    .rotulos {
      position: relative;
      height: 14px;
    }
    .rotulos span {
      position: absolute;
      top: 0;
      padding-left: 6px;
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.14em;
      color: rgba(255, 255, 255, 0.45);
    }

    .stats {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .stat {
      display: grid;
      grid-template-columns: 90px 1fr 250px 1fr 90px;
      align-items: center;
      column-gap: 12px;
    }
    .val {
      font-family: var(--mono);
      font-size: 30px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.55);
      font-variant-numeric: tabular-nums;
    }
    .val--r {
      text-align: right;
    }
    .val--max {
      color: #fff;
    }
    .rot {
      text-align: center;
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .bar {
      display: flex;
      height: 10px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.06);
    }
    .bar--l {
      justify-content: flex-end;
    }
    .bar i {
      display: block;
      height: 100%;
      border-radius: 5px;
      background: var(--o5);
      transform-origin: 100% 50%;
      animation: rs-grow 1s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .bar i.bar-b {
      background: #e9e9ec;
      transform-origin: 0 50%;
    }
    @keyframes rs-grow {
      from {
        transform: scaleX(0);
      }
    }

    .patro {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .patro-t {
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--o4);
    }
    .patro-grid {
      display: grid;
      gap: 12px;
    }
    .plogo {
      height: 200px;
      display: grid;
      place-items: center;
      overflow: hidden;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1.5px dashed rgba(255, 255, 255, 0.22);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 10px, transparent 10px 20px);
      animation: rs-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .plogo--img {
      border: 0;
      background: #fff;
      padding: 6px;
    }
    .plogo img {
      /* 100% nos dois eixos + contain: o logo ESCALA pra caber (pequeno cresce, grande encolhe).
         max-* em % não resolve numa célula de altura intrínseca e o overflow cortava o logo. */
      width: auto;
      height: 180px;
      object-fit: contain;
      object-position: center;
    }
    .plogo span {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
  `,
})
export class OverlayResumoComponent {
  readonly view = input<ResumoView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());
  readonly sponsors = input<OverlayPatroItem[]>([]);

  protected readonly sides = ['A', 'B'] as const;
  protected readonly W = FLOW_W;
  protected readonly H = FLOW_H;
  protected readonly mid = MID;
  protected readonly uid = Math.random().toString(36).slice(2, 8);

  /** Milissegundos desde que ESTE resumo entrou — alimenta a contagem dos números. */
  private readonly t = signal(ANIM_TOTAL_MS);

  protected readonly winnerSide = computed<'A' | 'B' | null>(() => {
    const v = this.view();
    return v?.a.winner ? 'A' : v?.b.winner ? 'B' : null;
  });

  /** 26 faíscas, só no lado do vencedor (A: 2–48 % do card; B: 52–98 %). Semente fixa. */
  protected readonly sparks = computed<Spark[]>(() => {
    const r = rng(3);
    const base = this.winnerSide() === 'B' ? 52 : 2;
    return Array.from({ length: 26 }, () => ({
      x: base + r() * 46,
      s: 2 + r() * 4,
      t: 4 + r() * 4,
      dl: 1 + r() * 5,
      dx: (r() - 0.5) * 120,
    }));
  });

  protected readonly flow = computed(() => {
    const v = this.view();
    if (!v || v.flow.length === 0) return null;
    const total = v.flow.reduce((n, s) => n + s.diffs.length, 0);
    const maxAbs = Math.max(2, ...v.flow.flatMap((s) => s.diffs.map(Math.abs)));
    const step = FLOW_W / total;
    const pts: string[] = [`0,${MID}`];
    const breaks: { x: number; label: string }[] = [];
    let k = 0;
    for (const s of v.flow) {
      breaks.push({ x: k * step, label: s.label });
      pts.push(`${(k * step).toFixed(1)},${MID}`);
      for (const d of s.diffs) {
        k++;
        pts.push(`${(k * step).toFixed(1)},${(MID - (d / maxAbs) * (MID - 8)).toFixed(1)}`);
      }
      pts.push(`${(k * step).toFixed(1)},${MID}`);
    }
    const line = 'M' + pts.join(' L');
    return { line, area: `${line} L${FLOW_W},${MID} Z`, breaks };
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.view()?.key) return;
      const t0 = Date.now();
      this.t.set(0);
      const h = setInterval(() => {
        const dt = Date.now() - t0;
        this.t.set(Math.min(dt, ANIM_TOTAL_MS));
        if (dt >= ANIM_TOTAL_MS) clearInterval(h);
      }, 40);
      onCleanup(() => clearInterval(h));
    });
  }

  /** Número contando de 0 até `value` em 1 s, a partir de `delaySec` (ease-out cúbico). */
  protected count(value: number, delaySec: number): number {
    return Math.round(value * easeOutCubic((this.t() - delaySec * 1000) / 1000));
  }

  protected isWin(v: ResumoView, side: 'A' | 'B'): boolean {
    return side === 'A' ? v.a.winner : v.b.winner;
  }

  protected pct(value: number, row: { a: number; b: number }): number {
    const max = Math.max(row.a, row.b, 1);
    return (value / max) * 100;
  }

  protected namesOf(v: ResumoView, side: 'A' | 'B'): string[] {
    const s = side === 'A' ? v.a : v.b;
    const players = (this.teams().get(s.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    if (players.length > 0) return players;
    const parts = s.label.split(/\s*\/\s*/).filter((p) => p !== '');
    return parts.length > 0 ? parts : [s.label];
  }

  /** Sobrenomes na legenda do fluxo: último termo de cada nome. */
  protected sobrenomes(v: ResumoView, side: 'A' | 'B'): string {
    return this.namesOf(v, side)
      .map((n) => n.split(/\s+/).at(-1) ?? n)
      .join(' / ');
  }
}
