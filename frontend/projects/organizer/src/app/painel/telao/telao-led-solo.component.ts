import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, signal, untracked } from '@angular/core';
import { elapsedSecondsFromStart, formatElapsedMmSs } from '@nexago/live-scoring';
import { closedSetColumns, livePointsOf, matchLiveCurrentSet, matchSetWins } from '../data/live-set-display';
import type { BroadcastLances } from '../data/broadcast-lances';
import type { TournamentMatch } from '../data/matches-repository';
import { nomeCurtoDe } from '../../publico/overlay/overlay-nome';
import { LedFitTextDirective } from '../../publico/led/led-fit-text.directive';
import { OgPulseDirective } from './og-pulse.directive';
import type { TelaoTeamDisplay } from './telao-data.service';
import { ledChipOf, ledLeftSideOf, ledNameLines, ledPausaOf, type LedSide } from './telao-led-solo';
import { TELAO_LANCE_MS, telaoLanceDisparoOf, type TelaoLanceDisparo } from './telao-lances';
import { servingPlayerFirstName } from './telao-selectors';

/** Lances da Transmissão + as quadras de cada lado, pra o placar decidir se o disparo é dele. */
export interface TelaoLancesInput {
  lances: BroadcastLances;
  transmissaoCourtId: string | null;
  telaoCourtId: string;
}

interface LedCard {
  pos: 'left' | 'right';
  side: LedSide;
  names: string[];
  big: string | number;
  serving: boolean;
  server: string | null;
}

const other = (s: LedSide): LedSide => (s === 'A' ? 'B' : 'A');

/** Placar de uma quadra em tela cheia (protótipos 35/36 do dono): as duas duplas em cards
 *  laterais com o ponto gigante, sets no meio e, com a partida parada (pedido de tempo ou
 *  atendimento médico), a tela inteira vira a contagem. Desenhado em 1920×1080 pro painel de
 *  LED — letra grande, contraste alto, nada miúdo. Os lados trocam sozinhos (ver
 *  `telao-led-solo.ts`). */
/** As patas da Cachorra: duas trilhas laranja (perto) e uma cinza no meio (longe), cada uma com
 *  12 passos alternados que acendem em sequência, como cachorros correndo. */
const PATAS = [
  { y: 70, sz: 110, d: 0, longe: false },
  { y: 870, sz: 110, d: 0.35, longe: false },
  { y: 470, sz: 70, d: 0.7, longe: true },
].flatMap((ln) =>
  Array.from({ length: 12 }, (_, i) => ({
    top: ln.y + (i % 2 ? ln.sz * 0.55 : 0),
    left: 40 + i * 160,
    sz: ln.sz,
    delay: ln.d + i * 0.13,
    longe: ln.longe,
  })),
);
const VELOCIDADE = [180, 330, 690, 760, 960].map((top, i) => ({ top, h: i % 2 ? 6 : 12, dur: 0.5 + i * 0.12 }));

@Component({
  selector: 'og-telao-led-solo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LedFitTextDirective, OgPulseDirective],
  host: { class: 'og-tls', '[class.gold]': 'gold()' },
  template: `
    <div class="og-tls-main">
      <header class="og-tls-head">
        <div class="og-tls-title">
          @if (subtitle()) {
            <div class="og-tls-sub" [ledFitText]="subtitle()">{{ subtitle() }}</div>
          }
        </div>
        @if (elapsed(); as clock) {
          <div class="og-tls-clock">{{ clock }}</div>
        }
      </header>

      <div class="og-tls-board">
        @for (card of cards(); track card.pos) {
          <div
            class="og-tls-card"
            [class.left]="card.pos === 'left'"
            [class.right]="card.pos === 'right'"
            [class.serving]="card.serving"
            [class.beaten]="winnerSide() !== null && winnerSide() !== card.side"
            [class.winner]="winnerSide() === card.side"
            [ogPulse]="leftSide()"
          >
            <!-- Final: clarão dourado a cada ponto da dupla (só aparece no dourado). -->
            <span class="og-tls-flash" aria-hidden="true" [ogPulse]="card.big"></span>
            <div class="og-tls-serve-row">
              @if (card.serving) {
                <span class="og-tls-serve">Saque{{ card.server ? ' · ' + card.server : '' }}</span>
              } @else if (gold() && winnerSide() === card.side) {
                <span class="og-tls-serve">Campeões</span>
              }
            </div>
            <div class="og-tls-names">
              @for (name of card.names; track $index) {
                <div class="og-tls-name" [ledFitText]="name">{{ name }}</div>
              }
            </div>
            <div class="og-tls-big" [ogPulse]="card.big">{{ card.big }}</div>
          </div>
          @if (card.pos === 'left') {
            <div class="og-tls-center">
              <div class="og-tls-sets">
                <span class="og-tls-sets-label">Sets</span>
                <span class="og-tls-sets-score" [ogPulse]="setsWon()[0] + setsWon()[1]">{{ setsWon()[0] }}<span class="og-tls-dash">-</span>{{ setsWon()[1] }}</span>
              </div>
              <div class="og-tls-rows">
                @for (row of setRows(); track $index) {
                  <div class="og-tls-row">
                    <span class="og-tls-row-n">{{ $index + 1 }}º</span>
                    <span class="og-tls-row-pts" [class.dim]="row.l < row.r">{{ row.l }}</span>
                    <span class="og-tls-row-pts" [class.dim]="row.r < row.l">{{ row.r }}</span>
                  </div>
                }
              </div>
              @if (chip(); as c) {
                <div class="og-tls-chip" [class.hot]="c.kind === 'troca' || c.kind === 'fim'" [class.troca]="c.kind === 'troca'">
                  {{ c.label }}@if (c.value) {&ngsp;<strong>{{ c.value }}</strong>}
                </div>
              }
            </div>
          }
        }
      </div>
    </div>

    <div class="og-tls-brand">NEXA<span>GO</span></div>

    @if (pausa(); as p) {
      <div class="og-tls-pausa" role="status">
        <div class="og-tls-pausa-title">{{ p.title }}</div>
        <div class="og-tls-pausa-who" [ledFitText]="p.who">{{ p.who }}</div>
        <div class="og-tls-pausa-clock">{{ p.clock }}</div>
        <div class="og-tls-brand on-light">NEXA<span>GO</span></div>
      </div>
    }

    <!-- Lance disparado no painel de Transmissão (o mesmo do overlay): 4,5 s de tela cheia. O
         @for re-cria o bloco a cada disparo, então dois aces seguidos animam duas vezes. -->
    @for (l of lanceAtivo(); track l.seq) {
      @if (l.tipo === 'ace') {
        <div class="og-tls-lance ace" role="status">
          <div class="og-tls-lance-sweep" aria-hidden="true"></div>
          <div class="og-tls-lance-ace">ACE<span>!</span></div>
          <div class="og-tls-lance-who">
            <div class="og-tls-lance-nome" [ledFitText]="l.nome">{{ l.nome }}</div>
            <div class="og-tls-lance-sub">{{ l.sub }}</div>
          </div>
        </div>
      } @else if (l.tipo === 'fire') {
        <div class="og-tls-lance fire" role="status">
          <div class="og-tls-lance-calor" aria-hidden="true"></div>
          <div class="og-tls-lance-bola" aria-hidden="true"><i class="rastro"></i><i class="bola"></i></div>
          <div class="og-tls-lance-shake">
            <div class="og-tls-lance-fogo">Fireball</div>
            <div class="og-tls-lance-who">
              <div class="og-tls-lance-nome" [ledFitText]="l.nome">{{ l.nome }}</div>
              <div class="og-tls-lance-sub">{{ l.sub }}</div>
            </div>
          </div>
        </div>
      } @else if (l.tipo === 'cachorra') {
        <div class="og-tls-lance cachorra" role="status">
          <div class="og-tls-lance-vel" aria-hidden="true">
            @for (v of velocidade; track $index) {
              <i [style.top.px]="v.top" [style.height.px]="v.h" [style.animation-duration.s]="v.dur"></i>
            }
          </div>
          @for (p of patas; track $index) {
            <div class="og-tls-pata" aria-hidden="true" [class.longe]="p.longe" [style.top.px]="p.top" [style.left.px]="p.left" [style.--sz.px]="p.sz">
              <div [style.animation-delay.s]="p.delay"><i></i><i></i><i></i><i></i><i></i></div>
            </div>
          }
          <div class="og-tls-lance-corre">
            <div class="og-tls-lance-galope"><div class="og-tls-lance-cachorra">Cachorra!</div></div>
            <div class="og-tls-lance-who">
              <div class="og-tls-lance-nome levou" [ledFitText]="l.nome + ' levou'">{{ l.nome }} <span>levou</span></div>
              <div class="og-tls-lance-sub">{{ l.sub }}</div>
            </div>
          </div>
        </div>
      } @else {
        <div class="og-tls-lance block" role="status">
          <div class="og-tls-lance-shake">
            <div class="og-tls-lance-words">
              <div class="og-tls-lance-bar" aria-hidden="true"></div>
              <div class="og-tls-lance-word l">Monster</div>
              <div class="og-tls-lance-word r">Block</div>
              <div class="og-tls-lance-bar" aria-hidden="true"></div>
            </div>
            <div class="og-tls-lance-who">
              <div class="og-tls-lance-nome" [ledFitText]="l.nome">{{ l.nome }}</div>
              <div class="og-tls-lance-sub">{{ l.sub }}</div>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      background: #000;
      color: #fff;
      font-family: var(--nx-font-display);
      --tls-card: #232328;
      --tls-box: #16161a;
      --tls-label: #b8b8c0;
      --tls-dim: #6e6e78;
      --tls-dash: #55555e;
      /* Cor de destaque (saque, selos, nome no tempo, lances): laranja; dourado na final. */
      --tls-accent: var(--nx-orange-500);
    }
    :host(.gold) {
      --tls-accent: #f4c543;
    }
    /* Na tela branca do tempo o dourado claro some: lá vai o dourado escuro. */
    :host(.gold) .og-tls-pausa {
      --tls-accent: #a87900;
    }
    .og-tls-main {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 32px;
      padding: 56px 64px 104px;
    }
    .og-tls-head {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
    }
    .og-tls-title {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .og-tls-sub {
      font-weight: 800;
      font-size: 44px;
      line-height: 1.15;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--tls-label);
      white-space: nowrap;
      overflow: hidden;
    }
    .og-tls-clock {
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 150px;
      line-height: 0.85;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }
    .og-tls-board {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px minmax(0, 1fr);
      gap: 32px;
    }
    .og-tls-card {
      position: relative;
      overflow: hidden;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      padding: 36px 44px;
      border-radius: 28px;
      background: var(--tls-card);
      color: #fff;
      transition:
        background-color 300ms var(--nx-ease-out),
        color 300ms var(--nx-ease-out),
        opacity 300ms var(--nx-ease-out);
    }
    .og-tls-card.right {
      align-items: flex-end;
      text-align: right;
    }
    /* Quem saca acende: card laranja (dourado na final), letra preta. */
    .og-tls-card.serving {
      background: var(--tls-accent);
      color: #000;
    }
    .og-tls-card.beaten {
      opacity: 0.45;
    }
    .og-tls-serve-row {
      display: flex;
      align-items: center;
      height: 64px;
      max-width: 100%;
    }
    .og-tls-serve {
      padding: 12px 22px;
      border-radius: 16px;
      background: #000;
      color: var(--tls-accent);
      font-weight: 800;
      font-size: 40px;
      line-height: 1;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .og-tls-names {
      width: 100%;
      font-weight: 800;
      font-size: 96px;
      line-height: 1.02;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    .og-tls-name {
      white-space: nowrap;
      overflow: hidden;
    }
    .og-tls-big {
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 330px;
      line-height: 0.8;
      letter-spacing: -0.05em;
      font-variant-numeric: tabular-nums;
      padding: 10px 6px 0;
    }
    /* Ponto novo: o número dá um pulo. */
    .og-tls-big.og-pulse-run {
      animation: og-tls-pop 360ms var(--nx-ease-spring);
    }
    /* Troca de lado: cada card atravessa a quadra até o lado novo. */
    .og-tls-card.left.og-pulse-run {
      animation: og-tls-sw-l 700ms var(--nx-ease-out);
    }
    .og-tls-card.right.og-pulse-run {
      animation: og-tls-sw-r 700ms var(--nx-ease-out);
    }
    .og-tls-center {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .og-tls-sets {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 26px 20px;
      border-radius: 28px;
      background: var(--tls-box);
    }
    .og-tls-sets-label {
      font-weight: 800;
      font-size: 40px;
      line-height: 1;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--tls-label);
    }
    .og-tls-sets-score {
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 150px;
      line-height: 0.9;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }
    .og-tls-dash {
      color: var(--tls-dash);
    }
    .og-tls-rows {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .og-tls-row {
      display: grid;
      grid-template-columns: 48px 1fr 1fr;
      align-items: center;
      gap: 12px;
      padding: 10px 24px;
      border-radius: 20px;
      background: var(--tls-box);
      font-family: var(--nx-font-mono);
      font-weight: 800;
    }
    .og-tls-row-n {
      font-size: 40px;
      color: var(--tls-label);
    }
    .og-tls-row-pts {
      font-size: 72px;
      line-height: 1;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .og-tls-row-pts.dim {
      color: var(--tls-dim);
    }
    .og-tls-chip {
      padding: 20px 16px;
      border-radius: 20px;
      background: var(--tls-box);
      font-weight: 800;
      font-size: 40px;
      line-height: 1.1;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
      color: var(--tls-label);
    }
    .og-tls-chip strong {
      color: #fff;
    }
    .og-tls-chip.hot {
      color: var(--tls-accent);
    }
    .og-tls-chip.troca {
      animation: og-tls-troca 900ms ease-in-out infinite alternate;
    }
    .og-tls-brand {
      position: absolute;
      right: 64px;
      bottom: 34px;
      font-weight: 800;
      font-size: 34px;
      letter-spacing: 0.02em;
      color: var(--tls-dim);
    }
    .og-tls-brand span {
      color: var(--tls-accent);
    }
    .og-tls-brand.on-light,
    .og-tls-brand.on-light span {
      color: #000;
    }
    /* Partida parada: a tela inteira vira o aviso — de longe, branco no meio do jogo é
       impossível de não ver. */
    .og-tls-pausa {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 40px;
      padding: 56px 64px 104px;
      background: #fff;
      color: #000;
      text-align: center;
      animation: og-tls-pausa-in 420ms var(--nx-ease-out);
    }
    .og-tls-pausa-title {
      font-weight: 800;
      font-size: 130px;
      line-height: 0.95;
      letter-spacing: -0.03em;
      text-transform: uppercase;
    }
    .og-tls-pausa-who {
      max-width: 100%;
      font-weight: 800;
      font-size: 80px;
      line-height: 0.95;
      letter-spacing: -0.03em;
      text-transform: uppercase;
      color: var(--tls-accent);
      white-space: nowrap;
      overflow: hidden;
    }
    .og-tls-pausa-clock {
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 320px;
      line-height: 0.85;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
    }
    @keyframes og-tls-pop {
      from {
        transform: scale(1.12);
      }
      to {
        transform: scale(1);
      }
    }
    @keyframes og-tls-sw-l {
      from {
        transform: translateX(calc(100% + 444px));
        opacity: 0.2;
      }
    }
    @keyframes og-tls-sw-r {
      from {
        transform: translateX(calc(-100% - 444px));
        opacity: 0.2;
      }
    }
    @keyframes og-tls-troca {
      to {
        box-shadow:
          0 0 0 8px rgba(255, 212, 0, 0.22),
          0 0 90px rgba(255, 212, 0, 0.35);
      }
    }
    @keyframes og-tls-pausa-in {
      from {
        opacity: 0;
        transform: scale(1.04);
      }
    }
    /* ── Efeitos da final (só no dourado) ──────────────────────────────────────────────── */
    .og-tls-flash {
      display: none;
    }
    :host(.gold) .og-tls-flash {
      display: block;
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0;
    }
    :host(.gold) .og-tls-flash.og-pulse-run {
      animation: og-tls-gold-flash 700ms ease-out;
    }
    /* Brilho atravessando o card dourado de quem saca, a cada poucos segundos. */
    :host(.gold) .og-tls-card.serving::after,
    :host(.gold) .og-tls-card.winner::after {
      content: '';
      position: absolute;
      top: -10%;
      bottom: -10%;
      left: 0;
      width: 38%;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0));
      transform: translateX(-160%) skewX(-18deg);
      animation: og-tls-shimmer 4200ms ease-in-out infinite;
      pointer-events: none;
    }
    /* Campeãs: o card inteiro dourado. */
    :host(.gold) .og-tls-card.winner {
      background: var(--tls-accent);
      color: #000;
    }
    :host(.gold) .og-tls-sets {
      animation: og-tls-gold-breathe 2600ms ease-in-out infinite alternate;
    }
    :host(.gold) .og-tls-sets-score.og-pulse-run {
      animation: og-tls-set-burst 1100ms cubic-bezier(0.2, 0.9, 0.3, 1);
    }
    :host(.gold) .og-tls-big.og-pulse-run {
      animation: og-tls-gold-pop 600ms var(--nx-ease-spring);
    }
    @keyframes og-tls-gold-flash {
      0% {
        opacity: 0.6;
        background: radial-gradient(circle at 50% 70%, rgba(255, 232, 154, 0.95), rgba(244, 197, 67, 0.35) 55%, rgba(244, 197, 67, 0) 80%);
      }
      100% {
        opacity: 0;
        background: radial-gradient(circle at 50% 70%, rgba(255, 232, 154, 0.95), rgba(244, 197, 67, 0.35) 55%, rgba(244, 197, 67, 0) 80%);
      }
    }
    @keyframes og-tls-shimmer {
      0%,
      55% {
        transform: translateX(-160%) skewX(-18deg);
      }
      100% {
        transform: translateX(420%) skewX(-18deg);
      }
    }
    @keyframes og-tls-gold-breathe {
      from {
        box-shadow: 0 0 0 2px rgba(244, 197, 67, 0.35);
      }
      to {
        box-shadow:
          0 0 0 4px rgba(244, 197, 67, 0.8),
          0 0 60px rgba(244, 197, 67, 0.35);
      }
    }
    @keyframes og-tls-set-burst {
      0% {
        transform: scale(1.5);
        color: var(--tls-accent);
        text-shadow: 0 0 60px rgba(244, 197, 67, 0.9);
      }
      60% {
        color: var(--tls-accent);
      }
      100% {
        transform: none;
        text-shadow: none;
      }
    }
    @keyframes og-tls-gold-pop {
      0% {
        transform: scale(1.18);
        text-shadow: 0 0 50px rgba(255, 232, 154, 0.9);
      }
      100% {
        transform: scale(1);
        text-shadow: none;
      }
    }

    /* ── Lances (protótipos 37/38): tudo em frações dos 4,5 s ─────────────────────────── */
    .og-tls-lance {
      position: absolute;
      inset: 0;
      z-index: 3;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      text-transform: uppercase;
      font-weight: 800;
      animation: og-ld-life 4500ms linear both;
    }
    .og-tls-lance.ace {
      gap: 40px;
      background: var(--tls-accent);
      color: #000;
      animation:
        og-ld-life 4500ms linear both,
        og-ld-boom 4500ms ease-out both;
    }
    .og-tls-lance.block {
      padding: 0 64px;
      background: #000;
      color: #fff;
    }
    .og-tls-lance-sweep {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 420px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0));
      animation: og-ld-sweep 4500ms ease-in-out both;
    }
    .og-tls-lance-ace {
      position: relative;
      font-size: 560px;
      line-height: 0.82;
      letter-spacing: -0.04em;
      animation: og-ld-slam 4500ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    .og-tls-lance-ace span {
      color: #fff;
    }
    .og-tls-lance-shake {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 34px;
      width: 100%;
      animation: og-ld-shake 4500ms linear both;
    }
    .og-tls-lance-words {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 34px;
      width: 100%;
    }
    .og-tls-lance-bar {
      width: 100%;
      height: 44px;
      background: var(--tls-accent);
      animation: og-ld-bar 4500ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    .og-tls-lance-word {
      font-size: 300px;
      line-height: 0.82;
      letter-spacing: -0.04em;
    }
    .og-tls-lance-word.l {
      color: var(--tls-accent);
      animation: og-ld-drop-l 4500ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    .og-tls-lance-word.r {
      animation: og-ld-drop-r 4500ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    .og-tls-lance-who {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      max-width: 100%;
      animation: og-ld-rise 4500ms ease-out both;
    }
    .og-tls-lance-nome {
      max-width: 1792px;
      font-size: 130px;
      line-height: 0.82;
      letter-spacing: -0.02em;
      white-space: nowrap;
      overflow: hidden;
    }
    .og-tls-lance-sub {
      font-size: 52px;
      letter-spacing: 0.06em;
    }
    .og-tls-lance.block .og-tls-lance-sub {
      color: var(--tls-label);
    }
    @keyframes og-ld-life {
      0% {
        opacity: 0;
      }
      4%,
      88% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }
    @keyframes og-ld-boom {
      0% {
        filter: brightness(3.2);
      }
      18% {
        filter: none;
      }
    }
    @keyframes og-ld-slam {
      0% {
        transform: scale(3.4);
        opacity: 0;
        filter: blur(10px);
      }
      22% {
        transform: scale(0.9);
        opacity: 1;
        filter: none;
      }
      32% {
        transform: scale(1.05);
      }
      42%,
      100% {
        transform: none;
      }
    }
    @keyframes og-ld-shake {
      0%,
      18%,
      60%,
      100% {
        transform: none;
      }
      22% {
        transform: translate(-26px, 12px);
      }
      28% {
        transform: translate(22px, -14px);
      }
      34% {
        transform: translate(-16px, 8px);
      }
      42% {
        transform: translate(10px, -6px);
      }
      50% {
        transform: translate(-4px, 2px);
      }
    }
    @keyframes og-ld-drop-l {
      0%,
      10% {
        transform: translateX(-110%);
      }
      26%,
      100% {
        transform: none;
      }
    }
    @keyframes og-ld-drop-r {
      0%,
      10% {
        transform: translateX(110%);
      }
      26%,
      100% {
        transform: none;
      }
    }
    @keyframes og-ld-rise {
      0%,
      30% {
        transform: translateY(70px);
        opacity: 0;
      }
      44%,
      100% {
        transform: none;
        opacity: 1;
      }
    }
    @keyframes og-ld-sweep {
      0%,
      30% {
        transform: translateX(-500px) skewX(-18deg);
      }
      70%,
      100% {
        transform: translateX(2400px) skewX(-18deg);
      }
    }
    @keyframes og-ld-bar {
      0%,
      14% {
        transform: scaleX(0);
      }
      30%,
      100% {
        transform: scaleX(1);
      }
    }

    /* FIREBALL (protótipo 39): a bola entra na diagonal com rastro, explode no meio, a tela
       treme e o chão pega fogo (vermelho → laranja → amarelo, tremulando). */
    .og-tls-lance.fire {
      gap: 30px;
      background: #000;
      color: #fff;
      animation:
        og-ld-life 4500ms linear both,
        og-ld-boom 4500ms ease-out both;
    }
    .og-tls-lance-calor {
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse 70% 60% at 50% 115%, #ffd400 0%, #ff6a1a 35%, #c41e00 62%, #000 90%);
      animation:
        og-ld-heat 4500ms linear both,
        og-ld-flicker 0.45s steps(2) infinite;
    }
    .og-tls-lance-bola {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 0;
      height: 0;
    }
    .og-tls-lance-bola i {
      position: absolute;
      display: block;
    }
    .og-tls-lance-bola .rastro {
      right: 0;
      top: -40px;
      width: 880px;
      height: 80px;
      border-radius: 40px;
      transform-origin: right center;
      background: linear-gradient(90deg, transparent, #ff6a1a 60%, #ffd400);
      animation: og-ld-trail 4500ms cubic-bezier(0.5, 0, 0.9, 0.4) both;
    }
    .og-tls-lance-bola .bola {
      left: -90px;
      top: -90px;
      width: 180px;
      height: 180px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 40%, #fff 0%, #ffd400 35%, #ff6a1a 70%, #c41e00 100%);
      animation: og-ld-fireball 4500ms cubic-bezier(0.5, 0, 0.9, 0.4) both;
    }
    .og-tls-lance.fire .og-tls-lance-shake {
      position: relative;
      gap: 30px;
    }
    .og-tls-lance-fogo {
      font-size: 380px;
      line-height: 0.82;
      letter-spacing: -0.04em;
      color: #ffd400;
      text-shadow: 0 0 60px rgba(255, 106, 26, 0.9);
      animation: og-ld-burn 4500ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
    }
    .og-tls-lance.fire .og-tls-lance-sub {
      color: #ffe7b0;
    }
    @keyframes og-ld-fireball {
      0% {
        transform: translate(-700px, -520px) scale(0.5);
        opacity: 0;
      }
      6% {
        opacity: 1;
      }
      20% {
        transform: translate(0, 0) scale(1.15);
      }
      24% {
        transform: scale(2.6);
        opacity: 0.9;
      }
      30%,
      100% {
        transform: scale(5);
        opacity: 0;
      }
    }
    @keyframes og-ld-trail {
      0%,
      4% {
        transform: translate(-700px, -520px) rotate(36.6deg) scaleX(0.2);
        opacity: 0;
      }
      10% {
        opacity: 1;
      }
      20% {
        transform: translate(0, 0) rotate(36.6deg) scaleX(1);
        opacity: 1;
      }
      30%,
      100% {
        transform: translate(0, 0) rotate(36.6deg) scaleX(1);
        opacity: 0;
      }
    }
    @keyframes og-ld-heat {
      0%,
      18% {
        opacity: 0;
      }
      24%,
      100% {
        opacity: 1;
      }
    }
    /* Tremula no brilho, não na opacidade: a opacidade é do og-ld-heat (o fogo só acende na explosão). */
    @keyframes og-ld-flicker {
      0%,
      100% {
        filter: brightness(1);
      }
      20% {
        filter: brightness(0.82);
      }
      40% {
        filter: brightness(0.96);
      }
      60% {
        filter: brightness(0.78);
      }
      80% {
        filter: brightness(0.92);
      }
    }
    @keyframes og-ld-burn {
      0%,
      20% {
        transform: scale(0.4) translateY(60px);
        opacity: 0;
        filter: blur(12px);
      }
      30% {
        transform: scale(1.08);
        opacity: 1;
        filter: none;
      }
      38%,
      100% {
        transform: none;
      }
    }

    /* CACHORRA (protótipo 40): três trilhas de patas atravessam a tela, passo a passo, sobre
       linhas de velocidade; "CACHORRA!" entra correndo e galopa. O nome é de quem LEVOU. */
    .og-tls-lance.cachorra {
      background: #000;
      color: #fff;
      animation:
        og-ld-life 4500ms linear both,
        og-ld-boom 4500ms ease-out both;
    }
    .og-tls-lance-vel {
      position: absolute;
      inset: 0;
      opacity: 0.5;
    }
    .og-tls-lance-vel i {
      position: absolute;
      left: 0;
      display: block;
      width: 200%;
      background: repeating-linear-gradient(90deg, #232328 0 220px, transparent 220px 420px);
      animation: og-ld-speed linear infinite;
    }
    .og-tls-pata {
      position: absolute;
      width: var(--sz);
      height: var(--sz);
      transform: rotate(90deg);
      --pata: var(--tls-accent);
    }
    .og-tls-pata.longe {
      --pata: #3a3a42;
    }
    .og-tls-pata > div {
      position: relative;
      width: 100%;
      height: 100%;
      animation: og-ld-paw 4500ms ease-out both;
    }
    .og-tls-pata i {
      position: absolute;
      display: block;
      border-radius: 50%;
      background: var(--pata);
    }
    /* Almofada + quatro dedos (as proporções do protótipo). */
    .og-tls-pata i:nth-child(1) { left: 22%; top: 42%; width: 56%; height: 50%; border-radius: 48% 48% 44% 44%; }
    .og-tls-pata i:nth-child(2) { left: 2%; top: 30%; width: 18%; height: 23.4%; }
    .og-tls-pata i:nth-child(3) { left: 20%; top: 6%; width: 20%; height: 26%; }
    .og-tls-pata i:nth-child(4) { left: 50%; top: 6%; width: 20%; height: 26%; }
    .og-tls-pata i:nth-child(5) { left: 68%; top: 30%; width: 18%; height: 23.4%; }
    .og-tls-lance-corre {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 26px;
      max-width: 100%;
      animation: og-ld-run-in 4500ms cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
    }
    .og-tls-lance-galope {
      animation: og-ld-gallop 0.42s linear infinite;
    }
    .og-tls-lance-cachorra {
      font-size: 290px;
      line-height: 0.82;
      letter-spacing: -0.04em;
      color: #ffd400;
    }
    .og-tls-lance-nome.levou {
      font-size: 110px;
    }
    .og-tls-lance-nome.levou span {
      color: var(--tls-accent);
    }
    .og-tls-lance.cachorra .og-tls-lance-sub {
      color: var(--tls-label);
    }
    @keyframes og-ld-paw {
      0% {
        opacity: 0;
        transform: scale(0.3);
      }
      8% {
        opacity: 1;
        transform: scale(1.1);
      }
      14% {
        transform: none;
      }
      55% {
        opacity: 1;
      }
      80%,
      100% {
        opacity: 0;
      }
    }
    @keyframes og-ld-gallop {
      0%,
      100% {
        transform: translateY(0) rotate(-2deg);
      }
      25% {
        transform: translateY(-34px) rotate(2deg);
      }
      50% {
        transform: translateY(0) rotate(-2deg);
      }
      75% {
        transform: translateY(-18px) rotate(1deg);
      }
    }
    @keyframes og-ld-run-in {
      0%,
      6% {
        transform: translateX(-2200px);
      }
      22% {
        transform: translateX(60px);
      }
      28%,
      100% {
        transform: none;
      }
    }
    @keyframes og-ld-speed {
      from {
        transform: translateX(0);
      }
      to {
        transform: translateX(-50%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host(.gold) .og-tls-flash.og-pulse-run,
      :host(.gold) .og-tls-card::after,
      :host(.gold) .og-tls-sets,
      :host(.gold) .og-tls-sets-score.og-pulse-run,
      :host(.gold) .og-tls-big.og-pulse-run,
      .og-tls-lance,
      .og-tls-lance *,
      .og-tls-big.og-pulse-run,
      .og-tls-card.og-pulse-run,
      .og-tls-chip.troca,
      .og-tls-pausa {
        animation: none;
      }
    }
  `,
})
export class TelaoLedSoloComponent {
  /** Categoria (e fase) — a sublinha do cabeçalho. */
  readonly categoryName = input<string | null>(null);
  readonly match = input.required<TournamentMatch>();
  readonly teamA = input.required<TelaoTeamDisplay>();
  readonly teamB = input.required<TelaoTeamDisplay>();
  /** Relógio do host: o placar não cria timer próprio. */
  readonly nowMs = input(0);
  /** Final: o mesmo placar, com o dourado no lugar do laranja. */
  readonly gold = input(false);
  /** Lances do painel de Transmissão — `null` onde não há (painel /led da quadra). */
  readonly lances = input<TelaoLancesInput | null>(null);

  /** O lance no ar (no máximo um), em lista pro `@for` re-animar a cada disparo. */
  protected readonly lanceAtivo = signal<Array<TelaoLanceDisparo & { nome: string; sub: string }>>([]);
  /** Cachorra: três trilhas de 12 patas (passo alternado) e as linhas de velocidade do protótipo 40. */
  protected readonly patas = PATAS;
  protected readonly velocidade = VELOCIDADE;
  private lanceVisto: number | null = null;
  private lanceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly lanceSeq = computed(() => this.lances()?.lances.seq ?? null);

  constructor() {
    this.finalConfetti();

    // Reage só ao `seq` (o doc da Transmissão muda por qualquer ajuste do painel). O timer é
    // próprio e não do `onCleanup`: um disparo que não é deste telão não pode cortar o que está
    // no ar.
    effect(() => {
      const seq = this.lanceSeq();
      if (seq == null) return;
      untracked(() => {
        const src = this.lances();
        if (!src) return;
        const disparo = telaoLanceDisparoOf(this.lanceVisto, src.lances, src.transmissaoCourtId, src.telaoCourtId, Date.now());
        this.lanceVisto = seq;
        if (!disparo) return;
        clearTimeout(this.lanceTimer);
        this.lanceAtivo.set([{ ...disparo, ...this.lanceTextoOf(disparo) }]);
        this.lanceTimer = setTimeout(() => this.lanceAtivo.set([]), TELAO_LANCE_MS);
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.lanceTimer));
  }

  /** Final encerrada: confete dourado nos 30 s de fim de jogo (como a celebração da grade do
   *  telão). Canvas próprio com estilo inline — o CSS com escopo não alcança elemento criado
   *  fora do template — abaixo das telas de tempo e de lance. */
  private finalConfetti(): void {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const campeoes = computed(() => this.gold() && this.match().status === 'completed');
    effect((onCleanup) => {
      if (!campeoes()) return;
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      let cancelled = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      let canvas: HTMLCanvasElement | null = null;
      void import('canvas-confetti').then(({ default: confetti }) => {
        if (cancelled) return;
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
        host.appendChild(canvas);
        const shoot = confetti.create(canvas, { resize: true });
        const colors = ['#F4C543', '#FFE89A', '#FFFFFF', '#A87900'];
        const burst = (strength: number) => {
          void shoot({ particleCount: Math.round(120 * strength), spread: 80, startVelocity: 45, angle: 60, origin: { x: 0.05, y: 0.95 }, colors, scalar: 1.6, disableForReducedMotion: true });
          void shoot({ particleCount: Math.round(120 * strength), spread: 80, startVelocity: 45, angle: 120, origin: { x: 0.95, y: 0.95 }, colors, scalar: 1.6, disableForReducedMotion: true });
        };
        burst(1);
        timers.push(setTimeout(() => burst(0.7), 800));
        for (let t = 5000; t < 27_000; t += 5000) timers.push(setTimeout(() => burst(0.45), t));
      });
      onCleanup(() => {
        cancelled = true;
        for (const t of timers) clearTimeout(t);
        canvas?.remove();
      });
    });
  }

  /** Quem fez (o atleta, como o overlay o chama) e "Felipe / Thiago · 14-12" no placar da tela. */
  private lanceTextoOf(d: TelaoLanceDisparo): { nome: string; sub: string } {
    const team = d.lado === 'A' ? this.teamA() : this.teamB();
    const atleta = team.playerNames[d.atleta]?.trim() ?? '';
    const [left, right] = this.cards();
    const placar = `${left.big}-${right.big}`;
    return {
      nome: atleta ? nomeCurtoDe(atleta) : team.short,
      // Na Cachorra o nome é de quem levou: a linha de baixo diz o lance, não a dupla.
      sub: d.tipo === 'cachorra' ? `Bola de cobertura · ${placar}` : `${team.short} · ${placar}`,
    };
  }

  private readonly live = computed(() => this.match().status === 'in_progress');
  private readonly current = computed(() => matchLiveCurrentSet(this.match()));

  protected readonly leftSide = computed(() => ledLeftSideOf(this.match()));

  /** Ao vivo, o set corrente ("Open Masculino · 2º set"); encerrada, a fase do jogo. */
  protected readonly subtitle = computed(() => {
    const m = this.match();
    const c = this.current();
    const extra = this.live() ? (c ? `${c.setNumber}º set` : null) : m.round;
    return [this.categoryName(), extra].filter(Boolean).join(' · ');
  });

  protected readonly elapsed = computed(() => {
    const m = this.match();
    if (!this.live() || !m.matchStartedAt) return null;
    return formatElapsedMmSs(elapsedSecondsFromStart(m.matchStartedAt, new Date(this.nowMs() || Date.now())));
  });

  protected readonly winnerSide = computed<LedSide | null>(() => {
    const m = this.match();
    if (m.status !== 'completed') return null;
    return m.winnerSide === 1 ? 'A' : m.winnerSide === 2 ? 'B' : null;
  });

  private readonly servingSide = computed<LedSide | null>(() => {
    const m = this.match();
    if (!this.live() || !m.servingTeamId) return null;
    if (m.servingTeamId === m.teamAId) return 'A';
    if (m.servingTeamId === m.teamBId) return 'B';
    return null;
  });

  /** Sets ganhos na ordem da tela (esquerda-direita). */
  protected readonly setsWon = computed<[number, number]>(() => {
    const [a, b] = matchSetWins(this.match());
    return this.leftSide() === 'A' ? [a, b] : [b, a];
  });

  protected readonly setRows = computed(() =>
    closedSetColumns(this.match()).map((s) => (this.leftSide() === 'A' ? { l: s.a, r: s.b } : { l: s.b, r: s.a })),
  );

  protected readonly chip = computed(() => ledChipOf(this.match(), this.leftSide()));

  protected readonly cards = computed<LedCard[]>(() => {
    const left = this.leftSide();
    return [this.cardOf(left, 'left'), this.cardOf(other(left), 'right')];
  });

  protected readonly pausa = computed(() => {
    const a = this.teamA();
    const b = this.teamB();
    return ledPausaOf(this.match(), this.nowMs() || Date.now(), { A: a.short, B: b.short }, { A: a.playerNames, B: b.playerNames });
  });

  private cardOf(side: LedSide, pos: LedCard['pos']): LedCard {
    const team = side === 'A' ? this.teamA() : this.teamB();
    const c = this.current();
    const [wonA, wonB] = matchSetWins(this.match());
    const big = this.live() ? (c ? livePointsOf(c, side) : 0) : side === 'A' ? wonA : wonB;
    const serving = this.servingSide() === side;
    return {
      pos,
      side,
      names: ledNameLines(team.short),
      big,
      serving,
      server: serving ? servingPlayerFirstName(team.playerNames, this.match().servingPlayerSlot) : null,
    };
  }
}
