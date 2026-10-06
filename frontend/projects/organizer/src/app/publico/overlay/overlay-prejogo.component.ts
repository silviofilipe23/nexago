import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PrejogoCard, PrejogoSide, PrejogoTeam } from '../../painel/data/broadcast-prejogo';
import type { OverlayPatroItem } from './overlay-nx';

/** Do 1º ao 3º lugar a etiqueta e as fotos ficam ouro/prata/bronze. */
export function prejogoMedalOf(pos: number | null): 'gold' | 'silver' | 'bronze' | null {
  return pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : null;
}

/** Nomes longos diminuem sozinhos: o painel de 1600 px divide o hero em três colunas e o nome
 *  não pode empurrar o "VS". */
export function prejogoNameSize(names: readonly string[]): number {
  const longest = Math.max(0, ...names.map((n) => n.length));
  if (longest <= 12) return 50;
  if (longest <= 16) return 42;
  if (longest <= 20) return 36;
  return 30;
}

/** Tela de Pré-jogo (1920×1080, fundo transparente): painel de 1600 px centralizado.
 *
 *  Só apresentação — o card vem pronto do painel (`broadcast/control.prejogo`). A entrada
 *  (~2 s) é por CSS; trocar `card.key` remonta tudo e anima de novo (botão "Reanimar"). */
@Component({
  selector: 'og-overlay-prejogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as c) {
      <div class="scrim" animate.enter="pj-fade-in" animate.leave="pj-fade-out"></div>
      @for (k of [c.key]; track k) {
        <section class="panel" animate.enter="pj-panel-in" animate.leave="pj-panel-out" aria-label="Pré-jogo">
          <i class="luz" aria-hidden="true"></i>

          <header class="head pj-b" style="--d: 0.35s">
            <span class="selo"><b class="shine" aria-hidden="true"></b>Pré-jogo</span>
            <span class="ctx">
              @for (p of contexto(c); track $index) {
                @if ($index > 0) {
                  <i class="sep" aria-hidden="true"></i>
                }
                <span [class.ctx--forte]="$index === 0">{{ p }}</span>
              }
            </span>
            <span class="regra">
              @if (c.rule) {
                <span>{{ c.rule }}</span>
              }
              @if (c.startTime) {
                <span>Início <b>{{ c.startTime }}</b></span>
              }
            </span>
          </header>

          <div class="hero">
            @for (side of sides; track side) {
              <div class="dupla" [class.dupla--b]="side === 'B'" [style.--d]="0.5 + (side === 'B' ? 0.1 : 0) + 's'">
                <div class="fotos" [class.fotos--b]="side === 'B'">
                  @for (i of [0, 1]; track i) {
                    <div class="foto" [class]="'foto medal-' + (medal(team(c, side)) ?? 'none')" [class.foto--vazia]="!team(c, side).photos[i]">
                      @if (team(c, side).photos[i]; as src) {
                        <img [src]="src" [alt]="team(c, side).names[i] ?? ''" />
                      } @else {
                        <span>Foto<br />atleta {{ i + 1 }}</span>
                      }
                    </div>
                  }
                </div>
                <div class="info" [class.info--b]="side === 'B'">
                  <div class="faixa">
                    <i class="traco" [class.traco--b]="side === 'B'"></i>
                    @if (team(c, side).rankPos; as pos) {
                      <span class="rank" [class]="'rank medal-' + (medal(team(c, side)) ?? 'none')">Ranking <b>#{{ pos }}</b></span>
                    }
                  </div>
                  <div class="nomes" [style.font-size.px]="nameSize(team(c, side))">
                    @for (n of team(c, side).names; track $index) {
                      <span>{{ n }}</span>
                    }
                  </div>
                  @if (team(c, side).club; as club) {
                    <span class="club">{{ club }}</span>
                  }
                </div>
              </div>
              @if (side === 'A') {
                <div class="centro">
                  <span class="vs">VS</span>
                  @if (c.h2h; as h) {
                    <div class="retro">
                      <span class="retro-t">Retrospecto</span>
                      <span class="retro-n"><b>{{ h.a }}</b><i>×</i><b>{{ h.b }}</b></span>
                    </div>
                  }
                </div>
              }
            }
          </div>

          @if (c.rows.length > 0) {
            <div class="comp">
              @for (r of c.rows; track r.label; let i = $index) {
                <div class="linha" [style.--d]="1 + i * 0.12 + 's'">
                  <b class="val" [class.val--lead]="r.lead === 'A'">{{ r.a }}</b>
                  <span class="bar bar--l"><i [style.width.%]="r.pctA" [class.bar-lead]="r.lead === 'A'"></i></span>
                  <span class="rot">{{ r.label }}</span>
                  <span class="bar"><i class="bar-b" [style.width.%]="r.pctB" [class.bar-lead]="r.lead === 'B'"></i></span>
                  <b class="val val--r" [class.val--lead]="r.lead === 'B'">{{ r.b }}</b>
                </div>
              }
            </div>
          }

          <footer class="rodape pj-b" style="--d: 1.6s">
            <div class="conf">
              <span class="tit">Últimos confrontos</span>
              @if (c.last.length > 0) {
                @for (l of c.last; track $index) {
                  <span class="pill"><i class="dot" [class.dot--b]="l.winner === 'B'"></i>{{ l.text }}</span>
                }
              } @else {
                <span class="pill pill--vazia">Primeiro confronto</span>
              }
            </div>
            @if (logos().length > 0) {
              <div class="patro">
                <span class="tit">Oferecimento</span>
                <div class="grade" [style.grid-template-columns]="'repeat(' + logos().length + ', 1fr)'">
                  @for (s of logos(); track $index) {
                    <div class="logo" [class.logo--img]="!!s.logo" [style.animation-delay]="1.8 + $index * 0.08 + 's'">
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
          </footer>
        </section>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      --gold: #f2c14e;
      --silver: #c9d3de;
      --bronze: #cd7f32;
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
      background: rgba(5, 5, 6, 0.72);
    }
    .pj-fade-in {
      animation: pj-fade 0.6s ease both;
    }
    .pj-fade-out {
      animation: pj-fade 0.4s ease reverse both;
    }
    @keyframes pj-fade {
      from {
        opacity: 0;
      }
    }

    .panel {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 1600px;
      margin-left: -800px;
      transform: translateY(-50%);
      box-sizing: border-box;
      padding: 34px 44px 30px;
      display: flex;
      flex-direction: column;
      gap: 26px;
      overflow: hidden;
      background: rgba(11, 11, 12, 0.96);
      border: 1px solid rgba(255, 138, 74, 0.35);
      border-radius: 18px;
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.65);
    }
    .pj-panel-in {
      animation: pj-panel-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .pj-panel-out {
      animation: pj-panel-out 0.45s ease-in both;
    }
    @keyframes pj-panel-in {
      from {
        opacity: 0;
        transform: translateY(calc(-50% + 40px));
        filter: blur(10px);
      }
    }
    @keyframes pj-panel-out {
      to {
        opacity: 0;
        transform: translateY(calc(-50% - 50px));
      }
    }
    .luz {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--o5), #ffd2b3, var(--o5), transparent);
      transform-origin: 50% 50%;
      animation: pj-luz 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    }
    @keyframes pj-luz {
      from {
        transform: scaleX(0);
      }
    }
    .panel > :not(.luz) {
      position: relative;
    }
    .pj-b {
      animation: pj-up 0.65s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes pj-up {
      from {
        opacity: 0;
        transform: translateY(18px);
        filter: blur(6px);
      }
    }

    .head {
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: var(--mono);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
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
    .shine {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      transform: translateX(-150%) skewX(-18deg);
      animation: pj-shine 2.8s ease-in-out infinite;
    }
    @keyframes pj-shine {
      0%,
      60% {
        transform: translateX(-150%) skewX(-18deg);
      }
      100% {
        transform: translateX(400%) skewX(-18deg);
      }
    }
    .ctx {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .ctx--forte {
      color: #fff;
      font-weight: 700;
    }
    .sep {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.25);
    }
    .regra {
      margin-left: auto;
      display: flex;
      gap: 24px;
    }
    .regra b {
      color: #fff;
    }

    .hero {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      column-gap: 24px;
      align-items: center;
    }
    .dupla {
      display: flex;
      align-items: center;
      gap: 18px;
      min-width: 0;
      animation: pj-slide-l 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0.5s) both;
    }
    .dupla--b {
      flex-direction: row-reverse;
      animation-name: pj-slide-r;
    }
    @keyframes pj-slide-l {
      from {
        opacity: 0;
        transform: translateX(-90px);
      }
    }
    @keyframes pj-slide-r {
      from {
        opacity: 0;
        transform: translateX(90px);
      }
    }
    .fotos {
      display: flex;
      flex: none;
    }
    .fotos--b {
      flex-direction: row-reverse;
    }
    .foto {
      width: 124px;
      height: 124px;
      box-sizing: border-box;
      border-radius: 50%;
      overflow: hidden;
      display: grid;
      place-items: center;
      border: 3px solid rgba(255, 255, 255, 0.85);
      background: #1a1a1d;
      box-shadow: 0 0 18px rgba(255, 255, 255, 0.18);
    }
    .foto + .foto {
      margin-left: -26px;
    }
    .fotos--b .foto + .foto {
      margin-left: 0;
      margin-right: -26px;
    }
    .foto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .foto--vazia {
      border: 1.5px dashed rgba(255, 255, 255, 0.28);
      box-shadow: none;
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 9px, transparent 9px 18px), #151517;
    }
    .foto--vazia span {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      text-align: center;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.55);
    }
    .foto.medal-gold {
      border-color: var(--gold);
      box-shadow: 0 0 20px rgba(242, 193, 78, 0.5);
    }
    .foto.medal-silver {
      border-color: var(--silver);
      box-shadow: 0 0 20px rgba(201, 211, 222, 0.4);
    }
    .foto.medal-bronze {
      border-color: var(--bronze);
      box-shadow: 0 0 20px rgba(205, 127, 50, 0.45);
    }

    .info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
    }
    .info--b {
      align-items: flex-end;
      text-align: right;
    }
    .faixa {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .info--b .faixa {
      flex-direction: row-reverse;
    }
    .traco {
      width: 38px;
      height: 6px;
      border-radius: 3px;
      background: var(--o5);
    }
    .traco--b {
      background: #e9e9ec;
    }
    .rank {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      padding: 5px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: rgba(255, 255, 255, 0.7);
    }
    .rank b {
      color: #fff;
    }
    .rank.medal-gold {
      background: var(--gold);
      border-color: var(--gold);
      color: #2a1c00;
    }
    .rank.medal-silver {
      background: var(--silver);
      border-color: var(--silver);
      color: #1b232c;
    }
    .rank.medal-bronze {
      background: var(--bronze);
      border-color: var(--bronze);
      color: #2a1300;
    }
    .rank.medal-gold b,
    .rank.medal-silver b,
    .rank.medal-bronze b {
      color: inherit;
    }
    .nomes {
      display: flex;
      flex-direction: column;
      font-weight: 800;
      line-height: 1.04;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .club {
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }

    .centro {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .vs {
      font-size: 120px;
      font-weight: 800;
      line-height: 1;
      color: var(--o5);
      text-shadow: 0 0 40px rgba(255, 106, 26, 0.6);
      animation: pj-vs 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both;
    }
    @keyframes pj-vs {
      from {
        opacity: 0;
        transform: scale(2.2);
        filter: blur(8px);
      }
    }
    .retro {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 8px 20px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #0e0e10;
      animation: pj-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 1.1s both;
    }
    .retro-t {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .retro-n {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-family: var(--mono);
    }
    .retro-n b {
      font-size: 34px;
    }
    .retro-n i {
      font-style: normal;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.4);
    }

    .comp {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 18px 22px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.015);
    }
    .linha {
      display: grid;
      grid-template-columns: 110px 1fr 280px 1fr 110px;
      column-gap: 20px;
      align-items: center;
      animation: pj-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 1s) both;
    }
    .val {
      font-family: var(--mono);
      font-size: 30px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.5);
      font-variant-numeric: tabular-nums;
    }
    .val--r {
      text-align: right;
    }
    .val--lead {
      color: #fff;
    }
    .rot {
      text-align: center;
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .bar {
      display: flex;
      height: 9px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.08);
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
      animation: pj-grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 1s) both;
    }
    .bar i.bar-b {
      background: rgba(233, 233, 236, 0.55);
      transform-origin: 0 50%;
    }
    .bar i.bar-b.bar-lead {
      background: #fff;
    }
    @keyframes pj-grow {
      from {
        transform: scaleX(0);
      }
    }

    .rodape {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 40px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .conf,
    .patro {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .patro {
      align-items: stretch;
    }
    .tit {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--o4);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: #141416;
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }
    .pill--vazia {
      color: rgba(255, 255, 255, 0.5);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--o5);
    }
    .dot--b {
      background: #e9e9ec;
    }
    .grade {
      display: grid;
      gap: 12px;
    }
    .logo {
      height: 100px;
      display: grid;
      place-items: center;
      overflow: hidden;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1.5px dashed rgba(255, 255, 255, 0.22);
      // background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 10px, transparent 10px 20px);
      animation: pj-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .logo--img {
      border: 0;
      // background: #fff;
      padding: 6px;
    }
    .logo img {
      width: 100%;
      height: 80px;
      object-fit: contain;
      object-position: center;
    }
    .logo span {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
  `,
})
export class OverlayPrejogoComponent {
  readonly card = input<PrejogoCard | null>(null);
  readonly sponsors = input<OverlayPatroItem[]>([]);

  protected readonly sides: readonly PrejogoSide[] = ['A', 'B'];
  protected readonly logos = computed(() => this.sponsors().slice(0, 4));

  protected team(c: PrejogoCard, side: PrejogoSide): PrejogoTeam {
    return side === 'A' ? c.a : c.b;
  }

  protected medal(t: PrejogoTeam): 'gold' | 'silver' | 'bronze' | null {
    return prejogoMedalOf(t.rankPos);
  }

  protected nameSize(t: PrejogoTeam): number {
    return prejogoNameSize(t.names);
  }

  protected contexto(c: PrejogoCard): string[] {
    return [c.category, c.phase, c.court].filter((p): p is string => !!p);
  }
}
