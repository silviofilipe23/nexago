import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import type { MultiMode } from '../../painel/data/broadcast-multi';
import type { OverlayTeam } from './overlay-live.gateway';
import { multiColumnsOf, type MultiCard, type MultiStatus, type MultiTeam } from './overlay-multi';
import { nomeCurtoDe, nomesCurtosDe } from './overlay-nome';
import type { OverlayPatroItem } from './overlay-nx';

type Side = 'A' | 'B';

const STATUS_TEXT: Record<MultiStatus, string> = {
  live: 'Ao vivo',
  setpoint: 'Set point',
  matchpoint: 'Match point',
  final: 'Final',
  scheduled: '',
  free: 'Livre',
};

const FLASH_MS = 700;

/** Multi-quadras (1920×1080): um cartão por quadra, em dois modos — tela cheia opaca (cabeçalho,
 *  grade e patrocinadores) ou faixa compacta sobre o vídeo (fundo transparente).
 *
 *  Só apresentação: `multiCardsOf` já escolhe a partida de cada quadra e calcula o status. */
@Component({
  selector: 'og-overlay-multi',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cards().length > 0) {
      @if (mode() === 'full') {
        <div class="tela" animate.enter="mq-fade-in" animate.leave="mq-fade-out">
          <i class="luz" aria-hidden="true"></i>
          @for (k of ['full']; track k) {
            <header class="head">
              <div class="mq-up" style="--d: 0.1s">
                <div class="linha1">
                  <span class="selo"><b class="shine" aria-hidden="true"></b>Ao vivo</span>
                  @if (eventName()) {
                    <span class="evento">{{ eventName() }}</span>
                  }
                </div>
                <h1>Todas as <em>quadras</em></h1>
              </div>
              <span class="marca mq-up" style="--d: 0.2s">NEXA<b>GO</b></span>
            </header>

            <div class="grade" [style.grid-template-columns]="'repeat(' + colunas() + ', 1fr)'" [style.grid-template-rows]="'repeat(' + linhas() + ', 1fr)'">
              @for (c of cards(); track c.courtId; let i = $index) {
                <article
                  class="card"
                  [class.card--hot]="c.status === 'setpoint' || c.status === 'matchpoint'"
                  [class.card--foco]="focusCourtId() === c.courtId"
                  [style.--d]="0.3 + i * 0.1 + 's'"
                >
                  <header class="c-top">
                    <span class="q">Quadra <b>{{ c.number }}</b></span>
                    <span class="ctx">{{ c.context }}</span>
                    <span class="tag" [class]="'tag tag--' + c.status">
                      @if (c.status === 'live') { <i class="dot"></i> }
                      {{ c.status === 'scheduled' ? c.time : statusText(c.status) }}
                    </span>
                  </header>

                  @switch (c.status) {
                    @case ('scheduled') {
                      <div class="prox">
                        <span class="prox-k">Próximo jogo</span>
                        <b>{{ nome(c.a) }}</b>
                        <span class="prox-vs">vs</span>
                        <b>{{ nome(c.b) }}</b>
                        @if (c.time) { <span class="prox-h">{{ c.time }}</span> }
                      </div>
                    }
                    @case ('free') {
                      <div class="prox"><span class="prox-k">Quadra livre</span></div>
                    }
                    @default {
                      <div class="corpo">
                        @for (side of sides; track side) {
                          <div class="lado" [class.lado--lose]="c.winner !== null && c.winner !== side">
                            <i class="saque" [class.saque--on]="teamOf(c, side).serving"></i>
                            <div class="nome-box">
                              <span class="nome">{{ nome(teamOf(c, side)) }}</span>
                            </div>
                            <div class="sets">
                              @for (s of c.sets; track $index) {
                                <span class="set" [class.set--win]="side === 'A' ? s.a > s.b : s.b > s.a">{{ side === 'A' ? s.a : s.b }}</span>
                              }
                            </div>
                            @if (c.live) {
                              <b class="pts" [class.pts--flash]="flashing().has(c.courtId + side)">{{ side === 'A' ? c.live.a : c.live.b }}</b>
                            } @else if (c.winner === side) {
                              <span class="venceu">Venceu</span>
                            } @else {
                              <span class="venceu"></span>
                            }
                          </div>
                        }
                      </div>
                      <footer class="c-pe">
                        @if (c.status === 'final') {
                          <span>Partida encerrada</span>
                        } @else {
                          <span>{{ c.setNumber }}º set
                            @if (c.pointSide) {
                              · <b class="hot">{{ nome(teamOf(c, c.pointSide)) }} · {{ c.status === 'matchpoint' ? 'match point' : 'set point' }}</b>
                            }
                          </span>
                        }
                        <span>Sets <b>{{ c.setsA }}–{{ c.setsB }}</b></span>
                      </footer>
                    }
                  }
                </article>
              }
            </div>

            @if (logos().length > 0) {
              <footer class="patro mq-up" style="--d: 0.9s">
                <span class="patro-t">Oferecimento</span>
                <div class="patro-grade" [style.grid-template-columns]="'repeat(' + logos().length + ', 1fr)'">
                  @for (s of logos(); track $index) {
                    <div class="logo" [class.logo--img]="!!s.logo">
                      @if (s.logo) { <img [src]="s.logo" [alt]="s.nome" /> } @else { <span>{{ s.nome }}</span> }
                    </div>
                  }
                </div>
              </footer>
            }
          }
        </div>
      } @else {
        <div class="faixa" animate.enter="mq-strip-in" animate.leave="mq-strip-out">
          @for (c of cards(); track c.courtId; let i = $index) {
            <article class="sc" [class.card--hot]="c.status === 'setpoint' || c.status === 'matchpoint'" [class.card--foco]="focusCourtId() === c.courtId" [style.--d]="i * 0.08 + 's'">
              <header class="sc-top">
                <span class="q">Q<b>{{ c.number }}</b></span>
                <span class="tag" [class]="'tag tag--' + c.status">
                  @if (c.status === 'live') { <i class="dot"></i> }
                  {{ c.status === 'scheduled' ? c.time : statusText(c.status) }}
                </span>
              </header>
              @if (c.status === 'scheduled') {
                <div class="sc-prox"><b>{{ nome(c.a) }}</b><span>vs</span><b>{{ nome(c.b) }}</b></div>
              } @else if (c.status === 'free') {
                <div class="sc-prox"><span>Quadra livre</span></div>
              } @else {
                @for (side of sides; track side) {
                  <div class="sc-lado" [class.lado--lose]="c.winner !== null && c.winner !== side">
                    <i class="saque" [class.saque--on]="teamOf(c, side).serving"></i>
                    <span class="nome">{{ nome(teamOf(c, side)) }}</span>
                    <span class="sets">
                      @for (s of c.sets; track $index) {
                        <span class="set" [class.set--win]="side === 'A' ? s.a > s.b : s.b > s.a">{{ side === 'A' ? s.a : s.b }}</span>
                      }
                    </span>
                    @if (c.live) {
                      <b class="pts pts--s" [class.pts--flash]="flashing().has(c.courtId + side)">{{ side === 'A' ? c.live.a : c.live.b }}</b>
                    }
                  </div>
                }
              }
            </article>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      --o5: var(--nx-orange-500, #ff6a1a);
      --o4: var(--nx-orange-400, #ff8a4a);
      --mono: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      --live: #ff3b3b;
      position: absolute;
      inset: 0;
      z-index: 58;
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
    .mq-fade-in {
      animation: mq-fade 0.5s ease both;
    }
    .mq-fade-out {
      animation: mq-fade 0.35s ease reverse both;
    }
    @keyframes mq-fade {
      from {
        opacity: 0;
      }
    }
    .luz {
      position: absolute;
      left: -120px;
      top: -200px;
      width: 900px;
      height: 700px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.22), transparent 65%);
    }
    .mq-up,
    .card,
    .sc {
      animation: mq-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
    }
    @keyframes mq-up {
      from {
        opacity: 0;
        transform: translateY(24px);
      }
    }

    .head {
      position: absolute;
      left: 64px;
      right: 64px;
      top: 22px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .linha1 {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .selo {
      position: relative;
      overflow: hidden;
      padding: 8px 14px;
      border-radius: 6px;
      background: var(--o5);
      color: #120600;
      font-family: var(--mono);
      font-size: 14px;
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
      animation: mq-shine 2.8s ease-in-out infinite;
    }
    @keyframes mq-shine {
      0%,
      60% {
        transform: translateX(-150%) skewX(-18deg);
      }
      100% {
        transform: translateX(400%) skewX(-18deg);
      }
    }
    .evento {
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.7);
    }
    h1 {
      margin: 12px 0 0;
      font-size: 76px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.02em;
      text-transform: uppercase;
    }
    h1 em {
      font-style: normal;
      color: var(--o5);
    }
    .marca {
      margin-top: 52px;
      font-size: 30px;
      font-weight: 800;
    }
    .marca b {
      color: var(--o5);
    }

    .grade {
      position: absolute;
      left: 64px;
      right: 64px;
      top: 160px;
      bottom: 150px;
      display: grid;
      gap: 18px;
    }
    .card {
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.07);
      background: #111113;
      overflow: hidden;
    }
    .card--hot {
      border-color: var(--o5);
      box-shadow: 0 0 28px rgba(255, 106, 26, 0.45);
    }
    .card--foco {
      border-color: #fff;
      box-shadow: 0 0 0 2px #fff;
    }
    .card--hot.card--foco {
      box-shadow:
        0 0 0 2px #fff,
        0 0 28px rgba(255, 106, 26, 0.45);
    }
    .c-top {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .q {
      color: #fff;
      font-weight: 700;
    }
    .q b {
      margin-left: 6px;
      padding: 3px 8px;
      border-radius: 5px;
      background: #1c1c1f;
    }
    .ctx {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 999px;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.55);
    }
    .tag--live {
      background: rgba(255, 59, 59, 0.16);
      color: #ff7a7a;
    }
    .tag--setpoint,
    .tag--matchpoint {
      background: rgba(255, 106, 26, 0.2);
      color: var(--o4);
    }
    .tag--scheduled {
      background: transparent;
      border: 1px dashed rgba(255, 255, 255, 0.3);
      color: rgba(255, 255, 255, 0.7);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--live);
      animation: mq-pulse 1.1s ease-in-out infinite;
    }
    @keyframes mq-pulse {
      50% {
        opacity: 0.3;
      }
    }

    .corpo {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 8px 16px;
    }
    .lado {
      display: grid;
      grid-template-columns: 16px 1fr auto 84px;
      align-items: center;
      column-gap: 14px;
      padding: 12px 4px;
    }
    .lado + .lado {
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }
    .lado--lose {
      opacity: 0.45;
    }
    .saque {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: transparent;
    }
    .saque--on {
      background: var(--o5);
      box-shadow: 0 0 10px var(--o5);
    }
    .nome-box {
      min-width: 0;
    }
    .nome {
      display: block;
      font-size: 30px;
      font-weight: 800;
      line-height: 1.05;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sets {
      display: flex;
      gap: 6px;
    }
    .set {
      min-width: 34px;
      padding: 6px 4px;
      border-radius: 6px;
      text-align: center;
      font-family: var(--mono);
      font-size: 22px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.04);
    }
    .set--win {
      color: #fff;
      background: #1f1f23;
    }
    .pts {
      display: grid;
      place-items: center;
      height: 62px;
      border-radius: 8px;
      background: #1b1b1e;
      font-family: var(--mono);
      font-size: 42px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .pts--flash {
      animation: mq-flash 0.7s ease-out;
    }
    @keyframes mq-flash {
      0% {
        background: var(--o5);
        color: #120600;
        transform: scale(1.08);
      }
      100% {
        background: #1b1b1e;
      }
    }
    .venceu {
      font-size: 22px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.55);
    }
    .c-pe {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px 14px;
      font-family: var(--mono);
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.5);
    }
    .c-pe b {
      color: #fff;
    }
    .c-pe .hot {
      color: var(--o4);
    }
    .prox {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .prox b {
      font-size: 30px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .prox-k,
    .prox-vs {
      font-family: var(--mono);
      font-size: 14px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .prox-h {
      margin-top: 6px;
      font-family: var(--mono);
      font-size: 46px;
      font-weight: 700;
      color: var(--o5);
    }

    .patro {
      position: absolute;
      left: 64px;
      right: 64px;
      bottom: 28px;
      display: flex;
      align-items: center;
      gap: 24px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .patro-t {
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--o5);
    }
    .patro-grade {
      flex: 1;
      display: grid;
      gap: 14px;
    }
    .logo {
      height: 60px;
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

    /* Faixa sobre o vídeo (fundo transparente). */
    .faixa {
      position: absolute;
      left: 40px;
      right: 40px;
      bottom: 40px;
      display: flex;
      gap: 12px;
    }
    .mq-strip-in {
      animation: mq-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .mq-strip-out {
      animation: mq-fade 0.35s ease reverse both;
    }
    .sc {
      flex: 1;
      min-width: 0;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(11, 11, 12, 0.94);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    }
    .sc-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .sc .tag {
      padding: 2px 9px;
      font-size: 10px;
    }
    .sc-lado {
      display: grid;
      grid-template-columns: 10px 1fr auto auto;
      align-items: center;
      column-gap: 8px;
      padding: 3px 0;
    }
    .sc .nome {
      font-size: 17px;
    }
    .sc .set {
      min-width: 22px;
      padding: 2px 3px;
      font-size: 14px;
    }
    .pts--s {
      width: 38px;
      height: 34px;
      font-size: 22px;
    }
    .sc-prox {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 0;
      font-size: 15px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }
    .sc-prox b {
      color: #fff;
    }
  `,
})
export class OverlayMultiComponent {
  readonly cards = input<MultiCard[]>([]);
  readonly mode = input<MultiMode>('full');
  readonly focusCourtId = input<string | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());
  readonly eventName = input('');
  readonly sponsors = input<OverlayPatroItem[]>([]);

  protected readonly sides: readonly Side[] = ['A', 'B'];
  protected readonly colunas = computed(() => multiColumnsOf(this.cards().length));
  protected readonly linhas = computed(() => Math.max(1, Math.ceil(this.cards().length / this.colunas())));
  protected readonly logos = computed(() => this.sponsors().slice(0, 5));

  /** `idQuadra + lado` dos placares que acabaram de mudar — o quadro pisca laranja por `FLASH_MS`. */
  protected readonly flashing = signal<ReadonlySet<string>>(new Set());
  private last = new Map<string, number>();

  constructor() {
    effect((onCleanup) => {
      const cards = this.cards();
      const changed: string[] = [];
      untracked(() => {
        const next = new Map<string, number>();
        for (const c of cards) {
          for (const side of this.sides) {
            const key = c.courtId + side;
            const v = c.live ? (side === 'A' ? c.live.a : c.live.b) : -1;
            next.set(key, v);
            const before = this.last.get(key);
            // Pisca só em ponto novo na MESMA partida ao vivo (não na 1ª leitura nem na troca de jogo).
            if (before !== undefined && before >= 0 && v > before) changed.push(key);
          }
        }
        this.last = next;
      });
      if (changed.length === 0) return;
      this.flashing.update((s) => new Set([...s, ...changed]));
      const t = setTimeout(() => this.flashing.update((s) => new Set([...s].filter((k) => !changed.includes(k)))), FLASH_MS);
      onCleanup(() => clearTimeout(t));
    });
  }

  protected teamOf(c: MultiCard, side: Side): MultiTeam {
    return side === 'A' ? c.a : c.b;
  }

  protected statusText(s: MultiStatus): string {
    return STATUS_TEXT[s];
  }

  /** Sobrenomes da dupla como no resto do overlay: elenco carregado, senão o rótulo da partida. */
  protected nome(t: MultiTeam): string {
    const players = (this.teams().get(t.teamId)?.players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
    return players.length > 0 ? players.join(' / ') : nomesCurtosDe(t.label);
  }
}
