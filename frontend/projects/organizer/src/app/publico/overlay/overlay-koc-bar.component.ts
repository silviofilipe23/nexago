import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import type { OverlayKocBlock } from './overlay-koc-bar';
import type { OverlayKocView } from './overlay-selectors';

export interface OverlayKocTeam {
  players: [string, string];
  /** Alinhado aos slots de `players` — null cai nas iniciais do `og-avatar`. */
  photos?: [string | null, string | null];
}

const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const EASE_ELASTIC = 'cubic-bezier(.34, 1.56, .64, 1)';
const FLIP_MS = 520;
const ENTER_MS = 420;
const THRONE_FLASH_MS = 640;
const THRONE_JUMP_MS = 520;
const PTS_BUMP_MS = 420;

/** Cronômetro "M:SS" abaixo de 1 minuto — dispara o pisca vermelho. */
function clockUnderOneMin(label: string): boolean {
  const m = /^(\d+):(\d{2})$/.exec(label.trim());
  if (!m) return false;
  return Number(m[1]) * 60 + Number(m[2]) < 60;
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
                  <div
                    class="block"
                    data-role="queue"
                    [attr.data-team-id]="b.teamId"
                    [attr.data-pts]="b.points"
                    [class.block--next]="b.nextUp"
                  >
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
                <div
                  class="block"
                  data-role="challenger"
                  [attr.data-team-id]="c.teamId"
                  [attr.data-pts]="c.points"
                >
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
                <div
                  class="block"
                  data-role="king"
                  [attr.data-team-id]="k.teamId"
                  [attr.data-pts]="k.points"
                  [class.block--on-fire]="v.bar.streak != null"
                >
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
                <div
                  class="clock"
                  [class.clock--paused]="clock.paused"
                  [class.clock--urgent]="clockUrgent(clock.label)"
                >
                  {{ clock.label }}
                </div>
              </div>
            </section>
          }
        </div>
      </div>

      <!-- Bug de emissora: logo translúcida no canto, sem caixa opaca disputando com a câmera. -->
      <div class="mark" [attr.data-pos]="position()" aria-hidden="true">
        <img class="mark-logo" src="/brand/logo.png" alt="" width="72" height="72" />
        <!-- <span class="mark-tag">KOTC</span> -->
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
      display: inline-block;
      flex-shrink: 0;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: currentColor;
      animation: koc-live-blink 1.6s ease-in-out infinite;
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
    .block--on-fire {
      /* Só box-shadow — filter disputaria com o flash WAAPI do novo trono. */
      z-index: 1;
      animation: koc-throne-fire 1.5s ease-in-out infinite;
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
      display: inline-block;
      margin-left: auto;
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      transform-origin: 50% 50%;
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
    .clock--urgent {
      color: var(--nx-live, #ff3b30);
      animation: koc-clock-urgent 1s ease-in-out infinite;
    }

    .mark {
      display: flex;
      align-items: center;
      gap: 10px;
      /* Watermark de TV: legível sem tapar a imagem da câmera. */
      opacity: 0.52;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.55));
    }
    .mark-logo {
      display: block;
      width: 72px;
      height: 72px;
      object-fit: contain;
    }
    .mark-tag {
      color: #fff;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.16em;
    }

    @keyframes koc-live-blink {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.15;
      }
    }
    @keyframes koc-throne-fire {
      0%,
      100% {
        box-shadow:
          0 0 14px 2px rgba(255, 106, 26, 0.55),
          inset 0 0 0 rgba(255, 180, 80, 0);
      }
      50% {
        box-shadow:
          0 0 40px 10px rgba(255, 120, 30, 0.95),
          inset 0 0 28px rgba(255, 220, 140, 0.45);
      }
    }
    @keyframes koc-clock-urgent {
      0%,
      100% {
        opacity: 1;
        color: var(--nx-live, #ff3b30);
      }
      50% {
        opacity: 0.28;
        color: #ff6b63;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dot,
      .block--on-fire,
      .clock--urgent {
        animation: none;
      }
    }
  `,
})
export class OverlayKocBarComponent {
  private readonly host = inject(ElementRef);

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

  /**
   * Só papéis/pontos/ordem — o `view()` inteiro muda a cada tick do cronômetro e re-disparava
   * o FLIP no meio do translate (getBoundingClientRect com transform = left errado).
   */
  private readonly motionKey = computed(() => {
    const v = this.view();
    if (!v) return '';
    const body = this.blocks()
      .map((b) => `${b.teamId}:${b.role}:${b.points}:${b.nextUp ? 1 : 0}`)
      .join('|');
    return `${body}|s:${v.bar.streak ?? ''}`;
  });

  /** Primeiro frame só grava posições — senão todo mundo “entra” no mount. */
  private primed = false;
  private lastMotionKey = '';
  /** left de layout (sem transform) — DOMRect mid-FLIP corrompia o próximo dx. */
  private prevLeft = new Map<string, number>();
  private prevPts = new Map<string, number>();
  private prevKingId: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const v = this.view();
      const key = this.motionKey();
      if (!v) {
        this.resetMotionState();
        return;
      }
      if (key === this.lastMotionKey) return;
      this.lastMotionKey = key;
      this.runMotion();
    });
  }

  playersOf(teamId: string): [string, string] {
    return this.teams().get(teamId)?.players ?? ['', ''];
  }

  clockUrgent(label: string): boolean {
    return clockUnderOneMin(label);
  }

  private resetMotionState(): void {
    this.primed = false;
    this.lastMotionKey = '';
    this.prevLeft = new Map();
    this.prevPts = new Map();
    this.prevKingId = null;
  }

  private prefersReducedMotion(): boolean {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Só WAAPI (FLIP/enter/bump). `getAnimations()` também devolve CSS — cancelar matava o pulse on-fire. */
  private cancelMotion(el: HTMLElement): void {
    for (const a of el.getAnimations()) {
      if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
      a.cancel();
    }
    const ptsEl = el.querySelector('.points') as HTMLElement | null;
    if (!ptsEl) return;
    for (const a of ptsEl.getAnimations()) {
      if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
      a.cancel();
    }
  }

  /** FLIP + enter + novo trono + bump de pontos — tudo em WAAPI depois do layout. */
  private runMotion(): void {
    const root = this.host.nativeElement as HTMLElement;
    const nodes = Array.from(root.querySelectorAll('.block[data-team-id]')) as HTMLElement[];
    const motionOk = this.primed && !this.prefersReducedMotion();

    // Zera transforms em voo ANTES de medir — senão o Last do FLIP é a posição animada.
    for (const el of nodes) this.cancelMotion(el);
    void root.offsetWidth;

    const nextLeft = new Map<string, number>();
    const nextPts = new Map<string, number>();
    let kingId: string | null = null;
    let kingEl: HTMLElement | null = null;

    for (const el of nodes) {
      const id = el.dataset['teamId'];
      if (!id) continue;
      const left = el.getBoundingClientRect().left;
      nextLeft.set(id, left);
      const pts = Number(el.dataset['pts'] ?? '0');
      nextPts.set(id, pts);
      if (el.dataset['role'] === 'king') {
        kingId = id;
        kingEl = el;
      }

      if (!motionOk) continue;

      const prev = this.prevLeft.get(id);
      if (prev === undefined) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(24px) scale(.94)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: ENTER_MS, easing: EASE_OUT },
        );
      } else {
        const dx = prev - left;
        if (Math.abs(dx) > 0.5) {
          el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
            duration: FLIP_MS,
            easing: EASE_OUT,
          });
        }
      }

      const prevPt = this.prevPts.get(id);
      if (prevPt !== undefined && prevPt !== pts) {
        const ptsEl = el.querySelector('.points') as HTMLElement | null;
        ptsEl?.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.42)', offset: 0.4 },
            { transform: 'scale(1)' },
          ],
          { duration: PTS_BUMP_MS, easing: EASE_ELASTIC },
        );
      }
    }

    if (motionOk && kingEl && kingId && kingId !== this.prevKingId) {
      // Flash e salto em paralelo — filter não disputa com o FLIP; jump usa composite add.
      kingEl.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], {
        duration: THRONE_FLASH_MS,
        easing: EASE_OUT,
      });
      kingEl.animate([{ transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], {
        duration: THRONE_JUMP_MS,
        easing: EASE_ELASTIC,
        composite: 'add',
      });
    }

    this.prevLeft = nextLeft;
    this.prevPts = nextPts;
    this.prevKingId = kingId;
    this.primed = true;
  }
}
