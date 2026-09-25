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
import { OverlayMarkComponent } from './overlay-mark.component';
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
  imports: [OverlayMarkComponent],
  template: `
    @if (view(); as v) {
      <div class="wrap" [class.wrap--final]="isFinal()" [attr.data-pos]="position()">
        @if (isFinal()) {
          <span class="final-flash" aria-hidden="true"></span>
        }

        <div class="status" [class.status--final]="isFinal()">
          @if (v.phase === 'live') {
            <span class="status-live"><i class="dot"></i>AO VIVO</span>
          }
          @if (isFinal()) {
            <span class="status-badge"
              ><span class="status-badge-shine" aria-hidden="true"></span>Grande final</span
            >
            <span class="status-seg status-seg--title">Valendo o título</span>
            @if (categoryStatusLabel(); as cat) {
              <span class="status-seg">{{ cat }}</span>
            }
            @if (courtName()) {
              <span class="status-seg">{{ courtName() }}</span>
            }
          } @else {
            @if (categoryStatusLabel(); as cat) {
              <span class="status-seg status-seg--strong">{{ cat }}</span>
            }
            <span class="status-seg">{{ v.roundTitle }}</span>
            @if (courtName()) {
              <span class="status-seg">{{ courtName() }}</span>
            }
          }
        </div>

        <div class="bar" [class.bar--final]="isFinal()">
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
                {{ isFinal() ? 'No trono · final' : 'NO TRONO' }}
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
                  @if (isFinal()) {
                    <span class="king-shine" aria-hidden="true"></span>
                  }
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

      <og-overlay-mark
        [corner]="position() === 'top' ? 'tr' : 'br'"
        [caption]="markCaption()"
      />
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

    .wrap {
      position: absolute;
      /* Margem de segurança de transmissão. */
      --gap: 48px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    .wrap,
    .wrap[data-pos='bottom'] {
      top: auto;
      bottom: var(--gap);
      left: var(--gap);
    }
    .wrap[data-pos='top'] {
      top: var(--gap);
      bottom: auto;
      left: var(--gap);
    }

    .status {
      display: inline-flex;
      align-items: stretch;
      margin-bottom: 10px;
      border-radius: 8px;
      overflow: hidden;
      background: #121214;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .status-live,
    .status-seg {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 12px;
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
       O arredondamento vai nas pontas, uma regra por canto.
       inline-flex: se fosse block flex, a barra esticava na largura do status (mais largo) e a
       borda de luz rodava num retângulo maior que o placar — “fora do card”. */
    .bar {
      display: inline-flex;
      align-items: stretch;
      width: max-content;
      max-width: 100%;
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
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
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
      background: #e5560e;
      color: #1a0d03;
      /* Alinhado à esquerda porque o selo de sequência ocupa a direita da tarja — centralizado,
         "NO TRONO" ficava POR BAIXO do selo. */
      text-align: left;
    }
    /* Acima do anel de luz do placar final (::before z-index 4) — senão a borda corta o selo. */
    [data-group='king'] {
      position: relative;
      z-index: 5;
    }

    /* Selo de sequência: flutua sobre a tarja do trono, como um adesivo. */
    .streak {
      position: absolute;
      top: -13px;
      right: 10px;
      z-index: 6;
      padding: 5px 12px;
      border-radius: 999px;
      background: #0b0b0c;
      color: #fff;
      font-size: 12px;
      letter-spacing: 0.14em;
      /* Contorno escuro: a luz do anel passa por trás sem cortar o texto. */
      box-shadow: 0 0 0 3px #0b0b0c;
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
      background: #e5560e;
      color: #1a0d03;
    }
    .block--on-fire {
      /* Só box-shadow — filter disputaria com o flash WAAPI do novo trono. */
      z-index: 1;
      animation: koc-throne-fire 1.5s ease-in-out infinite;
    }

    .players {
      display: grid;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      font-size: 29px;
      font-weight: 800;
      line-height: 1.12;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .players span {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Fila um degrau abaixo — o foco visual fica em quem está em quadra. */
    [data-role='queue'] .players {
      font-size: 26px;
      /* Nome de exibição do nexaGO é mais longo que o sobrenome de transmissão ("Bernardo 213",
         não "BRO") — a 150px a fila inteira aparecia reticenciada. */
      max-width: 200px;
    }
    [data-role='challenger'] .players {
      max-width: 260px;
    }
    [data-role='king'] .players {
      max-width: 320px;
    }

    .points {
      display: inline-block;
      margin-left: auto;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 44px;
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

    /* ── Grande final ───────────────────────────────────────── */
    @property --koc-border-a {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }

    .wrap--final .status {
      /* status e barra têm larguras próprias — o wrap não força os dois no mesmo retângulo */
      margin-bottom: 10px;
    }

    .final-flash {
      position: absolute;
      left: -40px;
      bottom: -40px;
      width: 280px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.55), transparent 68%);
      pointer-events: none;
      z-index: -1;
      animation: koc-final-flash 1.1s ease-out both;
    }
    @keyframes koc-final-flash {
      0% {
        opacity: 0;
        transform: scale(0.85);
      }
      28% {
        opacity: 1;
        transform: scale(1.05);
      }
      100% {
        opacity: 0;
        transform: scale(1.15);
      }
    }

    .status--final {
      border: 1.5px solid var(--nx-orange-500, #ff6a1a);
      background: #0d0a08;
    }
    .status-badge {
      position: relative;
      display: flex;
      align-items: center;
      overflow: hidden;
      padding: 7px 12px;
      background: var(--nx-orange-500, #ff6a1a);
      color: #1a0d03;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      animation: koc-badge-settle 600ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both;
    }
    .status-badge-shine {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        115deg,
        transparent 30%,
        rgba(255, 255, 255, 0.35) 48%,
        rgba(255, 255, 255, 0.55) 50%,
        rgba(255, 255, 255, 0.3) 52%,
        transparent 70%
      );
      background-size: 220% 100%;
      animation: koc-head-shine 2.8s ease-in-out 1.4s infinite;
      pointer-events: none;
    }
    @keyframes koc-badge-settle {
      from {
        opacity: 0;
        filter: blur(8px);
        transform: scale(1.22);
      }
      to {
        opacity: 1;
        filter: none;
        transform: none;
      }
    }
    @keyframes koc-head-shine {
      0% {
        background-position: 120% 0;
      }
      100% {
        background-position: -120% 0;
      }
    }
    .status-seg--title {
      color: #fff;
      border-left-color: rgba(255, 106, 26, 0.35);
    }

    .bar--final {
      position: relative;
      border-radius: 10px;
      /* Halo colado na borda — box-shadow não estica o layout nem vaza como o radial antigo. */
      box-shadow: 0 0 18px rgba(255, 106, 26, 0.45);
    }
    /* Anel de 2px NO contorno do placar (inset 0): inset negativo + barra esticada fazia a
       luz circular fora do card. */
    .bar--final::before {
      content: '';
      position: absolute;
      inset: 0;
      padding: 2px;
      border-radius: inherit;
      box-sizing: border-box;
      pointer-events: none;
      z-index: 4;
      background: conic-gradient(
        from var(--koc-border-a),
        transparent 0 70%,
        #ff8a4a 82%,
        #fff 86%,
        #ff6a1a 90%,
        transparent 100%
      );
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask-composite: exclude;
      animation: koc-border-spin 3.2s linear infinite;
    }
    @keyframes koc-border-spin {
      to {
        --koc-border-a: 360deg;
      }
    }

    .wrap--final [data-group='queue'] .label,
    .wrap--final [data-group='challenger'] .label {
      color: var(--nx-orange-500, #ff6a1a);
    }
    .wrap--final [data-group='king'] .label {
      text-transform: uppercase;
    }

    .block[data-role='king'] {
      position: relative;
      overflow: hidden;
    }
    .king-shine {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        115deg,
        transparent 28%,
        rgba(255, 255, 255, 0.22) 46%,
        rgba(255, 255, 255, 0.4) 50%,
        rgba(255, 255, 255, 0.18) 54%,
        transparent 72%
      );
      background-size: 220% 100%;
      animation: koc-head-shine 2.8s ease-in-out 1s infinite;
      pointer-events: none;
      z-index: 1;
    }
    .block[data-role='king'] .players,
    .block[data-role='king'] .points {
      position: relative;
      z-index: 2;
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
      .clock--urgent,
      .final-flash,
      .status-badge,
      .status-badge-shine,
      .bar--final::before,
      .king-shine {
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
  /** Gênero da categoria (`female` → QUEEN OF THE COURT no status). */
  readonly categoryGender = input<'male' | 'female' | 'mixed' | null>(null);
  readonly courtName = input<string | null>(null);
  /** A faixa ocupa a largura toda: só sobe ou desce, não vai pros cantos como o duelo. */
  readonly position = input<'top' | 'bottom'>('bottom');
  /** Visual Grande final — partida final e/ou preferência compartilhada do painel. */
  readonly isFinal = input(false);

  private readonly blocks = computed<OverlayKocBlock[]>(() => this.view()?.bar.blocks ?? []);

  readonly queue = computed(() => this.blocks().filter((b) => b.role === 'queue'));
  readonly challenger = computed(() => this.blocks().find((b) => b.role === 'challenger') ?? null);
  readonly king = computed(() => this.blocks().find((b) => b.role === 'king') ?? null);

  protected readonly isFemaleCategory = computed(() => {
    if (this.categoryGender() === 'female') return true;
    const n = (this.categoryName() ?? '').trim().toLowerCase();
    return /\bfeminin[oa]\b/.test(n) || /(^|[\s·\-_/])fem($|[\s·\-_/])/.test(n);
  });

  /** Feminino vira QUEEN OF THE COURT na Grande final. Fora dela a faixa mantém o nome da
   *  categoria: o telão é por categoria, e é por essa linha que quem assiste sabe qual está no
   *  ar — o honorífico sozinho não distingue uma Feminina A de uma Feminina B. */
  protected readonly categoryStatusLabel = computed(() => {
    if (this.isFinal() && this.isFemaleCategory()) return 'QUEEN OF THE COURT';
    return this.categoryName();
  });

  /** Carimbo de marca da Grande final. Fora dela a marca fica só com a logo: legenda fixa
   *  em toda rodada vira ruído na imagem da câmera. */
  protected readonly markCaption = computed(() => {
    if (!this.isFinal()) return null;
    return this.isFemaleCategory() ? 'NEXAGO · QOTC · Final' : 'NEXAGO · KOTC · Final';
  });

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
    return `${body}|s:${v.bar.streak ?? ''}|f:${this.isFinal() ? 1 : 0}`;
  });

  /** Primeiro frame só grava posições — senão todo mundo “entra” no mount. */
  private primed = false;
  private lastMotionKey = '';
  private lastFinal = false;
  /** left de layout (sem transform) — DOMRect mid-FLIP corrompia o próximo dx. */
  private prevLeft = new Map<string, number>();
  private prevPts = new Map<string, number>();
  private prevKingId: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const v = this.view();
      const key = this.motionKey();
      const final = this.isFinal();
      if (!v) {
        this.resetMotionState();
        return;
      }
      if (key === this.lastMotionKey) return;
      const enteringFinal = final && !this.lastFinal;
      this.lastMotionKey = key;
      this.lastFinal = final;
      this.runMotion(enteringFinal);
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
    this.lastFinal = false;
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
  private runMotion(enteringFinal = false): void {
    const root = this.host.nativeElement as HTMLElement;
    const nodes = Array.from(root.querySelectorAll('.block[data-team-id]')) as HTMLElement[];
    const groups = Array.from(root.querySelectorAll('.group')) as HTMLElement[];
    const motionOk = this.primed && !this.prefersReducedMotion() && !enteringFinal;
    const finalEnter = enteringFinal && !this.prefersReducedMotion();

    // Zera transforms em voo ANTES de medir — senão o Last do FLIP é a posição animada.
    for (const el of nodes) this.cancelMotion(el);
    void root.offsetWidth;

    const nextLeft = new Map<string, number>();
    const nextPts = new Map<string, number>();
    let kingId: string | null = null;
    let kingEl: HTMLElement | null = null;

    if (finalEnter) {
      // Entrada da final: blocos sobem por grupo (fila → desafiante → trono → tempo), 80ms entre.
      const FINAL_ENTER_MS = 420;
      const FINAL_STAGGER_MS = 80;
      const FINAL_FIRST_DELAY_MS = 250;
      groups.forEach((group, i) => {
        for (const a of group.getAnimations()) {
          if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
          a.cancel();
        }
        group.animate(
          [
            { opacity: 0, transform: 'translateY(28px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: FINAL_ENTER_MS,
            delay: FINAL_FIRST_DELAY_MS + i * FINAL_STAGGER_MS,
            easing: EASE_OUT,
            fill: 'both',
          },
        );
      });
    }

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

    if (finalEnter && kingEl) {
      const afterLast = 250 + Math.max(0, groups.length - 1) * 80 + 420;
      kingEl.animate([{ filter: 'brightness(2.1)' }, { filter: 'brightness(1)' }], {
        duration: 800,
        delay: afterLast,
        easing: EASE_OUT,
        fill: 'both',
      });
    }

    this.prevLeft = nextLeft;
    this.prevPts = nextPts;
    this.prevKingId = kingId;
    this.primed = true;
  }
}
