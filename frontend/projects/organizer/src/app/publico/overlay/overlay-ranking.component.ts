import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { RankingCard, RankingMode } from '../../painel/data/broadcast-ranking';
import { ledIniciaisDe } from '../led/led-iniciais';
import type { OverlayPatroItem } from './overlay-nx';
import {
  RANKING_COUNT_MS,
  RANKING_ROW_PITCH,
  RANKING_ROW_STAGGER_MS,
  RANKING_SWITCH_MS,
  rankingMoveOf,
  rankingPointsText,
  rankingRowsOf,
  type RankingMove,
  type RankingRow,
} from './overlay-ranking';

type Medal = 'gold' | 'silver' | 'bronze' | null;

const easeOutCubic = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const medalOf = (idx: number | null): Medal => (idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : null);

/** Ranking Geral Top 10 — 1920×1080, tela cheia com fundo OPACO (não é transparente).
 *
 *  Só apresentação: o card vem pronto do painel com os dois estados. Entra no "antes"; ~2,6 s
 *  depois (modo `auto`) as linhas deslizam até a posição nova em sequência, os pontos contam até
 *  o total novo, quem sai desaparece, quem entra aparece e os destaques entram pela direita. */
@Component({
  selector: 'og-overlay-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as c) {
      <div class="tela" [class.dupla]="c.kind === 'dupla'" animate.enter="rk-fade-in" animate.leave="rk-fade-out">
        <i class="luz" aria-hidden="true"></i>

        @for (k of [c.key]; track k) {
          <header class="head">
            <div class="head-l rk-up" style="--d: 0.1s">
              <div class="linha1">
                <span class="selo"><b class="shine" aria-hidden="true"></b>Ranking nexaGO</span>
                <span class="top">Top 10{{ c.kind === 'dupla' ? ' · Duplas' : '' }}</span>
              </div>
              <h1>Ranking <em>{{ c.categoryLabel }}</em></h1>
            </div>
            <div class="head-r rk-up" style="--d: 0.2s">
              <span class="marca">NEXA<b>GO</b></span>
              <span class="status"><i class="ponto" [class.ponto--on]="depois() && c.updated"></i>{{ statusText(c) }}</span>
            </div>
          </header>

          <div class="tabela">
            <div class="cols rk-up" style="--d: 0.3s">
              <span class="c-pos">Posição</span>
              <span class="c-atl">{{ c.kind === 'dupla' ? 'Dupla' : 'Atleta' }}</span>
              <span class="c-et">Na etapa</span>
              <span class="c-pts">Pontos</span>
            </div>
            <div class="corpo">
              @for (r of rows(); track r.athlete.id; let i = $index) {
                <div
                  class="row"
                  [class.row--out]="idx(r) === null"
                  [class.row--gold]="medal(r) === 'gold'"
                  [class.row--silver]="medal(r) === 'silver'"
                  [class.row--bronze]="medal(r) === 'bronze'"
                  [style.transform]="'translateY(' + y(r) + 'px)'"
                  [style.transition-delay]="delay(r) + 'ms'"
                  [style.--enter]="0.45 + i * 0.07 + 's'"
                >
                  <div class="r-pos">
                    <b class="quad">{{ idx(r) === null ? '' : idx(r)! + 1 }}</b>
                    <span class="move" [class]="'move move--' + moveKind(r)">{{ moveText(r) }}</span>
                  </div>
                  <div class="fotos">
                    @for (p of fotosDe(r.athlete.photos, r.athlete.photo, c.kind); track $index) {
                      <div class="foto" [class.foto--vazia]="!p">
                        @if (p) { <img [src]="p" [alt]="r.athlete.name" /> } @else { <span>{{ iniciais(r.athlete.name, $index, c.kind) }}</span> }
                      </div>
                    }
                  </div>
                  <div class="quem">
                    <span class="nome">{{ r.athlete.name }}</span>
                    @if (r.athlete.sub) {
                      <span class="sub">{{ r.athlete.sub }}</span>
                    }
                  </div>
                  <div class="et">
                    @if (depois()) {
                      @if (r.athlete.gain === null) {
                        <span class="pil pil--nao">{{ c.kind === 'dupla' ? 'Não jogaram' : 'Não jogou' }}</span>
                      } @else {
                        <span class="pil pil--gain">+{{ r.athlete.gain }}</span>
                      }
                    }
                  </div>
                  <b class="pts">{{ pointsText(r) }}</b>
                </div>
              }
            </div>
          </div>

          <aside class="lado">
            <span class="lado-t rk-up" style="--d: 0.3s">Destaques da etapa</span>
            <div class="cards" [class.cards--on]="depois()">
              @if (c.leader; as l) {
                <div class="card card--lider" style="--s: 0s">
                  <div class="fotos fotos--g">
                    @for (p of fotosDe(l.photos, l.photo, c.kind); track $index) {
                      <div class="foto foto--g" [class.foto--vazia]="!p">
                        @if (p) { <img [src]="p" [alt]="l.name" /> } @else { <span>{{ iniciais(l.name, $index, c.kind) }}</span> }
                      </div>
                    }
                  </div>
                  <div class="card-t">
                    <span class="k">{{ c.kind === 'dupla' ? 'Dupla líder' : 'Líder do ranking' }}</span>
                    <b class="n">{{ l.name }}</b>
                    <span class="d">{{ l.keeps ? 'Mantém a liderança' : 'Assume a liderança' }}</span>
                  </div>
                  <b class="big big--gold">{{ pointsFmt(l.points) }}</b>
                </div>
              }
              @if (c.climber; as m) {
                <div class="card" style="--s: 0.12s">
                  <div class="fotos">
                    @for (p of fotosDe(m.photos, m.photo, c.kind); track $index) {
                      <div class="foto foto--m" [class.foto--vazia]="!p">
                        @if (p) { <img [src]="p" [alt]="m.name" /> } @else { <span>{{ iniciais(m.name, $index, c.kind) }}</span> }
                      </div>
                    }
                  </div>
                  <div class="card-t">
                    <span class="k">Maior subida</span>
                    <b class="n n--m">{{ m.name }}</b>
                    <span class="d">Do {{ m.from }}º para o {{ m.to }}º</span>
                  </div>
                  <b class="big big--up">▲{{ m.from - m.to }}</b>
                </div>
              }
              @if (c.topGain; as g) {
                <div class="card" style="--s: 0.24s">
                  <div class="fotos">
                    @for (p of fotosDe(g.photos, g.photo, c.kind); track $index) {
                      <div class="foto foto--m" [class.foto--vazia]="!p">
                        @if (p) { <img [src]="p" [alt]="g.name" /> } @else { <span>{{ iniciais(g.name, $index, c.kind) }}</span> }
                      </div>
                    }
                  </div>
                  <div class="card-t">
                    <span class="k">Mais pontos na etapa</span>
                    <b class="n n--m">{{ g.name }}</b>
                    @if (g.sub) { <span class="d">{{ g.sub }}</span> }
                  </div>
                  <b class="big big--up">+{{ g.gain }}</b>
                </div>
              }
            </div>
            @if (logos().length > 0) {
              <div class="patro rk-up" style="--d: 1.2s">
                <span class="lado-t">Oferecimento</span>
                <div class="grade" [style.grid-template-columns]="'repeat(' + logos().length + ', 1fr)'">
                  @for (s of logos(); track $index) {
                    <div class="logo" [class.logo--img]="!!s.logo">
                      @if (s.logo) { <img [src]="s.logo" [alt]="s.nome" /> } @else { <span>{{ s.nome }}</span> }
                    </div>
                  }
                </div>
              </div>
            }
          </aside>
        }
      </div>
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
      --up: #3ddc84;
      --down: #ff5c5c;
      position: absolute;
      inset: 0;
      z-index: 60;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      color: #fff;
    }
    .tela {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: #0b0b0c;
    }
    .rk-fade-in {
      animation: rk-fade 0.6s ease both;
    }
    .rk-fade-out {
      animation: rk-fade 0.4s ease reverse both;
    }
    @keyframes rk-fade {
      from {
        opacity: 0;
      }
    }
    /* Luz laranja suave flutuando no canto superior. */
    .luz {
      position: absolute;
      left: -120px;
      top: -200px;
      width: 900px;
      height: 700px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.28), transparent 65%);
      animation: rk-luz 9s ease-in-out infinite alternate;
    }
    @keyframes rk-luz {
      to {
        transform: translate(160px, 40px);
      }
    }
    .rk-up {
      animation: rk-up 0.65s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes rk-up {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
    }

    .head {
      position: absolute;
      left: 88px;
      right: 88px;
      top: 22px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .linha1 {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .selo {
      position: relative;
      overflow: hidden;
      padding: 9px 16px;
      border-radius: 6px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    .shine {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      transform: translateX(-150%) skewX(-18deg);
      animation: rk-shine 2.8s ease-in-out infinite;
    }
    @keyframes rk-shine {
      0%,
      60% {
        transform: translateX(-150%) skewX(-18deg);
      }
      100% {
        transform: translateX(400%) skewX(-18deg);
      }
    }
    .top {
      font-family: var(--mono);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    h1 {
      margin: 14px 0 0;
      font-size: 82px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    h1 em {
      font-style: normal;
      color: var(--o5);
    }
    .head-r {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 18px;
      padding-top: 6px;
    }
    .marca {
      font-size: 34px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .marca b {
      color: var(--o5);
    }
    .status {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--mono);
      font-size: 13px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }
    .ponto {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #6b6b72;
      transition: background 0.4s ease;
    }
    .ponto--on {
      background: var(--up);
      box-shadow: 0 0 10px var(--up);
    }

    .tabela {
      position: absolute;
      left: 88px;
      top: 190px;
      width: 1140px;
    }
    .cols {
      display: grid;
      grid-template-columns: 150px 1fr 200px 170px;
      padding: 0 20px;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
    }
    .c-pts {
      text-align: right;
    }
    .c-et {
      text-align: center;
    }
    .c-atl {
      padding-left: calc(var(--fw, 52px) + 16px);
    }
    .corpo {
      position: relative;
      margin-top: 14px;
      height: ${RANKING_ROW_PITCH * 10}px;
    }
    .row {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 68px;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 150px var(--fw, 52px) 1fr 200px 170px;
      column-gap: 16px;
      align-items: center;
      padding: 0 20px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      background: #111113;
      transition:
        transform 0.8s cubic-bezier(0.22, 1, 0.36, 1),
        opacity 0.5s ease,
        background 0.5s ease,
        border-color 0.5s ease;
      animation: rk-row 0.6s cubic-bezier(0.22, 1, 0.36, 1) var(--enter, 0.4s) both;
    }
    @keyframes rk-row {
      from {
        opacity: 0;
        margin-top: 24px;
      }
    }
    .row--out {
      opacity: 0;
    }
    .row--gold {
      background: linear-gradient(90deg, rgba(242, 193, 78, 0.16), #111113 70%);
      border-color: rgba(242, 193, 78, 0.7);
    }
    .row--silver {
      background: linear-gradient(90deg, rgba(201, 211, 222, 0.14), #111113 70%);
      border-color: rgba(201, 211, 222, 0.6);
    }
    .row--bronze {
      background: linear-gradient(90deg, rgba(205, 127, 50, 0.16), #111113 70%);
      border-color: rgba(205, 127, 50, 0.65);
    }
    .r-pos {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .quad {
      width: 38px;
      height: 38px;
      border-radius: 7px;
      display: grid;
      place-items: center;
      background: #1b1b1e;
      font-size: 22px;
      font-weight: 800;
    }
    .row--gold .quad {
      background: var(--gold);
      color: #2a1c00;
    }
    .row--silver .quad {
      background: var(--silver);
      color: #1b232c;
    }
    .row--bronze .quad {
      background: var(--bronze);
      color: #2a1300;
    }
    .move {
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.4);
    }
    .move--up {
      color: var(--up);
    }
    .move--down {
      color: var(--down);
    }
    .move--new {
      color: var(--o4);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .foto {
      width: 46px;
      height: 46px;
      box-sizing: border-box;
      border-radius: 50%;
      overflow: hidden;
      display: grid;
      place-items: center;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: #1a1a1d;
    }
    .foto img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .foto--vazia {
      border: 1.5px dashed rgba(255, 255, 255, 0.25);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0 6px, transparent 6px 12px), #151517;
    }
    /* Sem foto: iniciais do nome no avatar. */
    .foto span {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.78);
    }
    .foto--g span {
      font-size: 26px;
    }
    .foto--m span {
      font-size: 20px;
    }
    .row--gold .foto {
      border-color: var(--gold);
    }
    .row--silver .foto {
      border-color: var(--silver);
    }
    .row--bronze .foto {
      border-color: var(--bronze);
    }
    .quem {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .nome {
      font-size: 26px;
      font-weight: 800;
      line-height: 1.05;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .et {
      display: flex;
      justify-content: center;
    }
    .pil {
      padding: 4px 14px;
      border-radius: 999px;
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      animation: rk-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes rk-pop {
      from {
        opacity: 0;
        transform: scale(0.7);
      }
    }
    .pil--gain {
      color: var(--up);
      background: rgba(61, 220, 132, 0.12);
    }
    .pil--nao {
      color: rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.06);
    }
    .pts {
      text-align: right;
      font-family: var(--mono);
      font-size: 34px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .lado {
      position: absolute;
      left: 1330px;
      top: 190px;
      width: 508px;
      height: 800px;
      display: flex;
      flex-direction: column;
    }
    .lado-t {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--o5);
    }
    .cards {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .card {
      display: grid;
      grid-template-columns: var(--cw, 62px) 1fr auto;
      column-gap: 16px;
      align-items: center;
      padding: 14px 20px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: #111113;
      opacity: 0;
      transform: translateX(80px);
      transition:
        opacity 0.6s ease var(--s, 0s),
        transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) var(--s, 0s);
    }
    .cards--on .card {
      opacity: 1;
      transform: none;
    }
    .card--lider {
      grid-template-columns: var(--lw, 96px) 1fr auto;
      padding: 18px 22px;
      border-color: rgba(242, 193, 78, 0.6);
    }
    .tela.dupla {
      --fw: 90px;
      --cw: 104px;
      --lw: 128px;
    }
    .dupla .foto--g {
      width: 70px;
      height: 70px;
    }
    .fotos {
      display: flex;
    }
    .fotos .foto + .foto {
      margin-left: -14px;
    }
    .dupla .nome {
      font-size: 24px;
    }
    .dupla .n {
      font-size: 24px;
      white-space: normal;
    }
    .dupla .n--m {
      font-size: 22px;
    }
    .dupla .card--lider .n {
      font-size: 24px;
    }
    .foto--g {
      width: 90px;
      height: 90px;
      border-color: var(--gold);
    }
    .foto--m {
      width: 58px;
      height: 58px;
    }
    .card-t {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .k {
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--o5);
    }
    .n {
      font-size: 32px;
      font-weight: 800;
      text-transform: uppercase;
      line-height: 1.05;
    }
    .n--m {
      font-size: 26px;
    }
    .d {
      font-size: 15px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
    }
    .big {
      font-family: var(--mono);
      font-size: 40px;
      font-weight: 700;
    }
    .big--gold {
      font-size: 48px;
      color: var(--gold);
      text-shadow: 0 0 24px rgba(242, 193, 78, 0.35);
    }
    .big--up {
      color: var(--up);
    }
    .patro {
      margin-top: auto;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .grade {
      display: grid;
      gap: 12px;
    }
    .logo {
      height: 56px;
      display: grid;
      place-items: center;
      overflow: hidden;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1.5px dashed rgba(255, 255, 255, 0.22);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 10px, transparent 10px 20px);
    }
    .logo--img {
      border: 0;
      background: #fff;
      padding: 6px;
    }
    .logo img {
      width: 100%;
      height: 100%;
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
export class OverlayRankingComponent {
  readonly card = input<RankingCard | null>(null);
  readonly mode = input<RankingMode>('auto');
  readonly sponsors = input<OverlayPatroItem[]>([]);

  protected readonly logos = computed(() => this.sponsors().slice(0, 3));
  protected readonly rows = computed<RankingRow[]>(() => {
    const c = this.card();
    return c ? rankingRowsOf(c) : [];
  });

  /** `false` = estado ANTES da etapa; `true` = DEPOIS (linhas já deslizaram). */
  protected readonly depois = signal(false);
  /** Instante (ms desde a troca) usado na contagem dos pontos; `Infinity` = sem animação. */
  private readonly sinceSwitch = signal(Number.POSITIVE_INFINITY);

  constructor() {
    // Reinicia no "antes" a cada card novo (Atualizar, trocar de categoria) ou troca de modo; no
    // modo `auto` troca pro "depois" depois de RANKING_SWITCH_MS e conta os pontos por ~1 s.
    effect((onCleanup) => {
      const key = this.card()?.key;
      const mode = this.mode();
      this.depois.set(false);
      this.sinceSwitch.set(Number.POSITIVE_INFINITY);
      if (!key || mode === 'before') return;
      let tick: ReturnType<typeof setInterval> | undefined;
      const t = setTimeout(() => {
        this.depois.set(true);
        const t0 = Date.now();
        this.sinceSwitch.set(0);
        tick = setInterval(() => {
          const dt = Date.now() - t0;
          this.sinceSwitch.set(dt);
          if (dt > 10 * RANKING_ROW_STAGGER_MS + RANKING_COUNT_MS + 200) {
            this.sinceSwitch.set(Number.POSITIVE_INFINITY);
            if (tick) clearInterval(tick);
          }
        }, 40);
      }, RANKING_SWITCH_MS);
      onCleanup(() => {
        clearTimeout(t);
        if (tick) clearInterval(tick);
      });
    });
  }

  /** Posição 0-based na tela no estado atual; `null` = fora do top 10 neste estado. */
  protected idx(r: RankingRow): number | null {
    return this.depois() ? r.idxAfter : r.idxBefore;
  }

  protected y(r: RankingRow): number {
    // Fora do top 10 fica parado onde estava (ou logo abaixo da tabela) e some por opacidade.
    const i = this.idx(r) ?? r.idxAfter ?? r.idxBefore ?? 10;
    return i * RANKING_ROW_PITCH;
  }

  protected medal(r: RankingRow): Medal {
    return medalOf(this.idx(r));
  }

  /** Linhas deslizam em sequência: o atraso acompanha a posição de destino. */
  protected delay(r: RankingRow): number {
    return this.depois() ? (r.idxAfter ?? r.idxBefore ?? 0) * RANKING_ROW_STAGGER_MS : 0;
  }

  protected moveOf(r: RankingRow): RankingMove | null {
    return this.depois() ? rankingMoveOf(r.athlete) : null;
  }
  protected moveKind(r: RankingRow): string {
    return this.moveOf(r)?.kind ?? 'same';
  }
  protected moveText(r: RankingRow): string {
    const m = this.moveOf(r);
    if (!m || m.kind === 'same') return '—';
    if (m.kind === 'new') return 'Novo';
    return `${m.kind === 'up' ? '▲' : '▼'} ${m.n}`;
  }

  /** Pontos: no "antes" o total antigo; depois da troca contam até o novo, cada linha no seu
   *  atraso (ease-out cúbico). */
  protected pointsText(r: RankingRow): string {
    const a = r.athlete;
    if (!this.depois()) return rankingPointsText(a.ptsBefore);
    const t = (this.sinceSwitch() - this.delay(r)) / RANKING_COUNT_MS;
    const p = Number.isFinite(t) ? easeOutCubic(t) : 1;
    return rankingPointsText(a.ptsBefore + (a.ptsAfter - a.ptsBefore) * p);
  }

  protected pointsFmt(n: number): string {
    return rankingPointsText(n);
  }

  /** Uma foto por atleta; dupla = as duas (completa com placeholder). */
  protected fotosDe(photos: readonly (string | null)[], single: string | null, kind: 'atleta' | 'dupla'): (string | null)[] {
    if (kind !== 'dupla') return [single];
    return [photos[0] ?? null, photos[1] ?? null];
  }

  /** Iniciais pro avatar sem foto: ranking de dupla traz os dois nomes juntos ("A / B"), e o
   *  avatar `i` mostra as do atleta `i`. */
  protected iniciais(fullName: string, i: number, kind: 'atleta' | 'dupla'): string {
    const nome = kind === 'dupla' ? (fullName.split(/\s*\/\s*/)[i] ?? fullName) : fullName;
    return ledIniciaisDe(nome) || '?';
  }

  protected statusText(c: RankingCard): string {
    if (!this.depois()) return `Antes da etapa ${c.stageName}`;
    return c.updated ? `Atualizado após etapa ${c.stageName}` : `Parcial · etapa ${c.stageName}`;
  }
}
