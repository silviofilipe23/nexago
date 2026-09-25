import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';
import { OverlayMarkComponent } from './overlay-mark.component';
import { ledIniciaisDe } from '../led/led-iniciais';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import type { KocPreRound, PreRoundRow } from './overlay-koc-preround';

const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
const ROW_FIRST_DELAY_MS = 520;
const ROW_STAGGER_MS = 110;
const FLIP_MS = 540;
const ENTER_MS = 440;
const ENTER_DELAY_MS = 180;
const FLASH_MS = 700;
const FLASH_DELAY_MS = 200;
const THRONE_ENTER_FLASH_MS = 800;
const AVATAR_SIZE = 52;
const AVATAR_SIZE_FINAL = 56;

const PAPEL: Record<PreRoundRow['papel'], string> = {
  trono: 'Começa no trono',
  desafia: 'Entra agora · Desafia o trono',
  sequencia: 'Na sequência',
  aguardando: 'Aguardando',
};

const PAPEL_FINAL: Record<PreRoundRow['papel'], string> = {
  trono: 'No trono',
  desafia: 'Desafiante',
  sequencia: 'Na fila',
  aguardando: 'Na fila',
};

interface PreRoundAthlete {
  name: string;
  initials: string;
  photoUrl: string | null;
}

/** Elenco da rodada KOTC que ainda não começou — e o card da Grande final ao vivo.
 *
 *  Preenche um buraco real da transmissão: antes do apito não existe rei nem desafiante, então o
 *  placar não tem o que desenhar e a tela ficava vazia. Aqui o que há de verdade é a ORDEM DE
 *  ENTRADA — quem começa no trono e quem desafia primeiro.
 *
 *  Na final o mesmo card anuncia as finalistas antes do apito (visual de título e borda de
 *  luz). Ao iniciar a partida ele some — a barra KOTC assume. */
@Component({
  selector: 'og-overlay-koc-preround',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent, OverlayMarkComponent],
  template: `
    @if (preRound(); as pre) {
      <div
        class="card"
        [class.card--final]="pre.isFinal"
        animate.enter="pre-card-in"
        animate.leave="pre-card-out"
      >
        @if (pre.isFinal) {
          <span class="flash" aria-hidden="true"></span>
          <span class="halo" aria-hidden="true"></span>
          <span class="border-spin" aria-hidden="true"></span>
        }

        <header class="head" [class.head--final]="pre.isFinal">
          @if (pre.isFinal) {
            <span class="head-shine" aria-hidden="true"></span>
            <div class="eyebrow eyebrow--final">
              <span class="live-dot" aria-hidden="true"></span>
              @if (courtName()) {
                <span>{{ courtName() }}</span><span class="bar">|</span>
              }
              @if (categoryName()) {
                <span>{{ categoryName() }}</span><span class="bar">|</span>
              }
              <span
                >{{ pre.teamCount }} {{ pre.teamCount === 1 ? 'dupla finalista' : 'duplas finalistas' }}</span
              >
            </div>
            <p class="sub-final">Próximos em quadra</p>
            <h1 class="titulo titulo--final">Grande final</h1>
          } @else {
            <div class="eyebrow">
              @if (courtName()) {
                <span>{{ courtName() }}</span><span class="bar">|</span>
              }
              @if (categoryName()) {
                <span>{{ categoryName() }}</span><span class="bar">|</span>
              }
              <span>{{ roundTitle() }}</span>
            </div>
            <h1 class="titulo"><span class="destaque">Próximos</span> em quadra</h1>
          }
        </header>

        <div class="linhas">
          @for (row of pre.rows; track row.teamId; let i = $index) {
            <div
              class="linha"
              [class.linha--agora]="row.papel === 'trono'"
              [class.linha--prox]="row.papel === 'desafia'"
              [attr.data-team-id]="row.teamId"
              [style.animation-delay.ms]="atrasoDaLinha(i)"
            >
              <span class="pos">{{ row.posicao }}</span>
              <span class="avatares">
                @for (p of atletasDe(row.teamId); track $index) {
                  <og-avatar [initials]="p.initials" [photoUrl]="p.photoUrl" [size]="avatarSize()" />
                }
              </span>
              <span class="quem">
                <span class="nomes">{{ nomesDe(row.teamId).join(' · ') }}</span>
                <span class="papel">{{ papelDe(row, pre.isFinal) }}</span>
              </span>
            </div>
          }
        </div>

        @if (pre.isFinal) {
          <footer class="rodape-final">Valendo o título · só o trono pontua</footer>
        } @else {
          <footer class="trono">
            No trono: <strong>{{ nomesDe(pre.tronoTeamId).join(' · ') }}</strong>
          </footer>
        }
      </div>
      <!-- O card é centralizado nesta tela, então a marca no canto inferior direito não disputa
           espaço com ele — sem desvio pro topo, ao contrário do placar de duelo. -->
      <og-overlay-mark />
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
      font-family: var(--nx-font, system-ui, sans-serif);
    }

    .card {
      position: relative;
      width: 620px;
      max-width: calc(100% - 96px);
      border-radius: 14px;
      overflow: hidden;
      /* Opaco: é leitura por cima da câmera. */
      background: #0b0b0c;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
      isolation: isolate;
    }
    .card--final {
      width: 680px;
      border-radius: 16px;
      background: #0d0a08;
      box-shadow:
        0 24px 60px rgba(0, 0, 0, 0.55),
        0 0 48px rgba(255, 106, 26, 0.22);
    }

    .halo {
      position: absolute;
      inset: -18px;
      border-radius: 28px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.28), transparent 68%);
      pointer-events: none;
      z-index: -1;
      animation: haloPulse 2.4s ease-in-out infinite;
    }
    @keyframes haloPulse {
      0%,
      100% {
        opacity: 0.7;
        transform: scale(0.98);
      }
      50% {
        opacity: 1;
        transform: scale(1.02);
      }
    }

    /* Anel de 2px: máscara no padding + ângulo do conic-gradient (não rotate no elemento). */
    @property --pre-border-a {
      syntax: '<angle>';
      inherits: false;
      initial-value: 0deg;
    }
    .border-spin {
      position: absolute;
      inset: -2px;
      padding: 2px;
      border-radius: inherit;
      box-sizing: border-box;
      pointer-events: none;
      z-index: 3;
      background: conic-gradient(
        from var(--pre-border-a),
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
      animation: borderSpin 3.2s linear infinite;
    }
    @keyframes borderSpin {
      to {
        --pre-border-a: 360deg;
      }
    }

    .flash {
      position: absolute;
      inset: -12%;
      border-radius: 24px;
      background: radial-gradient(ellipse at center, rgba(255, 106, 26, 0.55), transparent 62%);
      pointer-events: none;
      z-index: -1;
      animation: entryFlash 1.1s ease-out 0.15s both;
    }
    @keyframes entryFlash {
      0% {
        opacity: 0;
        transform: scale(0.9);
      }
      30% {
        opacity: 1;
        transform: scale(1.05);
      }
      100% {
        opacity: 0;
        transform: scale(1.1);
      }
    }

    .pre-card-in {
      animation: preCardIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .pre-card-out {
      animation: preCardOut 380ms cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes preCardIn {
      from {
        opacity: 0;
        transform: translateX(48px) scale(1.04);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes preCardOut {
      from {
        opacity: 1;
        transform: none;
      }
      to {
        opacity: 0;
        transform: translateX(40px) scale(0.98);
      }
    }

    .head {
      position: relative;
      padding: 18px 22px 14px;
      background: linear-gradient(135deg, #3a1c0c 0%, #141116 68%);
      overflow: hidden;
    }
    .head--final {
      padding: 22px 24px 16px;
      background: linear-gradient(135deg, #4a1f08 0%, #1a0e0a 55%, #0d0a08 100%);
    }
    .head-shine {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        115deg,
        transparent 30%,
        rgba(255, 200, 140, 0.18) 48%,
        rgba(255, 255, 255, 0.22) 50%,
        rgba(255, 200, 140, 0.14) 52%,
        transparent 70%
      );
      background-size: 220% 100%;
      animation: headShine 2.8s ease-in-out 1s infinite;
      pointer-events: none;
    }
    @keyframes headShine {
      0% {
        background-position: 120% 0;
      }
      100% {
        background-position: -120% 0;
      }
    }
    .eyebrow {
      display: flex;
      align-items: center;
      gap: 9px;
      color: #8f878f;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .eyebrow--final {
      color: #fff;
      letter-spacing: 0.12em;
    }
    .eyebrow--final .bar {
      color: rgba(255, 255, 255, 0.55);
    }
    .bar {
      color: #56505a;
    }
    .live-dot {
      position: relative;
      flex: none;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500, #ff6a1a);
      box-shadow: 0 0 8px rgba(255, 106, 26, 0.8);
    }
    .live-dot::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 1.5px solid rgba(255, 106, 26, 0.7);
      animation: liveRing 1.4s ease-out infinite;
    }
    @keyframes liveRing {
      from {
        transform: scale(0.7);
        opacity: 0.9;
      }
      to {
        transform: scale(2.2);
        opacity: 0;
      }
    }
    .sub-final {
      margin: 10px 0 0;
      color: var(--nx-orange-500, #ff6a1a);
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .titulo {
      margin: 8px 0 0;
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.01em;
    }
    .titulo--final {
      margin-top: 4px;
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #fff;
      text-transform: uppercase;
      text-shadow:
        0 0 24px rgba(255, 255, 255, 0.18),
        0 0 24px rgba(255, 106, 26, 0.35);
      animation: titleSettle 620ms cubic-bezier(0.22, 1, 0.36, 1) 200ms both;
    }
    @keyframes titleSettle {
      from {
        opacity: 0;
        filter: blur(8px);
        transform: scale(1.18);
      }
      to {
        opacity: 1;
        filter: none;
        transform: none;
      }
    }
    .destaque {
      color: var(--nx-orange-500, #ff6a1a);
    }

    .linhas {
      display: grid;
      gap: 8px;
      padding: 14px 16px;
    }

    .linha {
      display: grid;
      grid-template-columns: 28px auto 1fr;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: #17171a;
      animation: preRowIn 440ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes preRowIn {
      from {
        opacity: 0;
        transform: translateX(32px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .linha--agora {
      padding: 14px 14px;
      border-color: var(--nx-orange-500, #ff6a1a);
      background: linear-gradient(100deg, #4a2409 0%, #1e1512 100%);
    }
    .linha--prox .papel {
      color: #fff;
    }

    .pos {
      text-align: center;
      color: #8f878f;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 18px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .linha--agora .pos {
      color: #fff;
    }

    .avatares {
      display: flex;
      align-items: center;
    }
    .avatares og-avatar {
      background: #0b0b0c;
      border: 2px solid #3a3a40;
      color: #cfc7cf;
      box-sizing: border-box;
    }
    .avatares og-avatar + og-avatar {
      margin-left: -14px;
    }
    .linha--agora .avatares og-avatar {
      border-color: var(--nx-orange-500, #ff6a1a);
      color: var(--nx-orange-500, #ff6a1a);
    }

    .quem {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .nomes {
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: #e9e4e9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .linha--agora .nomes {
      color: #fff;
    }
    .linha--agora .nomes,
    .linha--prox .nomes {
      font-size: 28px;
    }
    .papel {
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #8f878f;
    }
    .linha--agora .papel {
      color: var(--nx-orange-500, #ff6a1a);
    }

    .trono {
      padding: 13px 22px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: #8f878f;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .trono strong {
      color: #efeaef;
    }

    .rodape-final {
      padding: 14px 22px;
      background: linear-gradient(90deg, #ff6a1a 0%, #ff8a3d 50%, #ff6a1a 100%);
      color: #1a0a02;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      text-align: center;
      animation: footRise 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
      animation-delay: calc(520ms + var(--rows, 4) * 110ms);
    }
    @keyframes footRise {
      from {
        opacity: 0;
        transform: translateY(100%);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pre-card-in,
      .pre-card-out,
      .linha,
      .titulo--final,
      .flash,
      .border-spin,
      .halo,
      .head-shine,
      .live-dot::after,
      .rodape-final {
        animation: none;
      }
    }
  `,
})
export class OverlayKocPreRoundComponent {
  private readonly host = inject(ElementRef);

  readonly preRound = input<KocPreRound | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  readonly roundTitle = input('');

  protected readonly avatarSize = computed(() =>
    this.preRound()?.isFinal ? AVATAR_SIZE_FINAL : AVATAR_SIZE,
  );
  protected readonly vazio = computed(() => this.preRound() == null);

  /** Ordem da fila + trono — só isto dispara FLIP; o rodapé troca o nome na hora, sem animação. */
  private readonly motionKey = computed(() => {
    const pre = this.preRound();
    if (!pre) return '';
    return `${pre.tronoTeamId}>${pre.rows.map((r) => r.teamId).join('|')}`;
  });

  private primed = false;
  private lastMotionKey = '';
  private prevTop = new Map<string, number>();
  private prevFirstId: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const key = this.motionKey();
      const pre = this.preRound();
      const root = this.host.nativeElement as HTMLElement;
      const card = root.querySelector('.card') as HTMLElement | null;
      if (card && pre) {
        card.style.setProperty('--rows', String(pre.rows.length));
      }

      if (!key) {
        this.resetMotionState();
        return;
      }
      if (key === this.lastMotionKey) return;
      this.lastMotionKey = key;
      this.runMotion();
    });
  }

  protected atrasoDaLinha(index: number): number {
    return ROW_FIRST_DELAY_MS + index * ROW_STAGGER_MS;
  }

  protected nomesDe(teamId: string): string[] {
    return this.atletasDe(teamId).map((p) => p.name);
  }

  protected atletasDe(teamId: string): PreRoundAthlete[] {
    const team = this.teams().get(teamId);
    if (!team) return [];
    return team.players
      .map((name, i) => ({
        name,
        initials: ledIniciaisDe(name),
        photoUrl: team.photos?.[i] ?? null,
      }))
      .filter((p) => p.name !== '');
  }

  protected papelDe(row: PreRoundRow, isFinal: boolean): string {
    return (isFinal ? PAPEL_FINAL : PAPEL)[row.papel];
  }

  private resetMotionState(): void {
    this.primed = false;
    this.lastMotionKey = '';
    this.prevTop = new Map();
    this.prevFirstId = null;
  }

  private prefersReducedMotion(): boolean {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Só WAAPI — cancelar CSS mataria o stagger de entrada do card. */
  private cancelWaapi(el: HTMLElement): void {
    for (const a of el.getAnimations()) {
      if (a instanceof CSSAnimation || a instanceof CSSTransition) continue;
      a.cancel();
    }
  }

  private cancelAll(el: HTMLElement): void {
    for (const a of el.getAnimations()) a.cancel();
  }

  private runMotion(): void {
    const root = this.host.nativeElement as HTMLElement;
    const nodes = Array.from(root.querySelectorAll('.linha[data-team-id]')) as HTMLElement[];
    const motionOk = this.primed && !this.prefersReducedMotion();
    const isFinal = this.preRound()?.isFinal === true;
    const rowCount = nodes.length;

    for (const el of nodes) this.cancelWaapi(el);
    void root.offsetWidth;

    const nextTop = new Map<string, number>();
    let firstId: string | null = null;
    let firstEl: HTMLElement | null = null;

    for (const el of nodes) {
      const id = el.dataset['teamId'];
      if (!id) continue;
      const top = el.getBoundingClientRect().top;
      nextTop.set(id, top);
      if (firstId === null) {
        firstId = id;
        firstEl = el;
      }

      if (!motionOk) continue;

      const prev = this.prevTop.get(id);
      if (prev === undefined) {
        // Quem perdeu o trono entra no fim da fila — sobe enquanto aparece.
        // Cancela o preRowIn do CSS: a entrada pós-FLIP é vertical, não o stagger lateral.
        this.cancelAll(el);
        el.animate(
          [
            { opacity: 0, transform: 'translateY(24px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: ENTER_MS, delay: ENTER_DELAY_MS, easing: EASE_OUT, fill: 'both' },
        );
      } else {
        const dy = prev - top;
        if (Math.abs(dy) > 0.5) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
            duration: FLIP_MS,
            easing: EASE_OUT,
          });
        }
      }
    }

    if (motionOk && firstEl && firstId && firstId !== this.prevFirstId) {
      firstEl.animate([{ filter: 'brightness(1.9)' }, { filter: 'brightness(1)' }], {
        duration: FLASH_MS,
        delay: FLASH_DELAY_MS,
        easing: EASE_OUT,
        fill: 'both',
      });
    }

    // Entrada da Grande final: clarão no trono depois da última dupla entrar.
    if (!motionOk && isFinal && firstEl && !this.prefersReducedMotion()) {
      const afterLast = ROW_FIRST_DELAY_MS + Math.max(0, rowCount - 1) * ROW_STAGGER_MS + 440;
      firstEl.animate([{ filter: 'brightness(1.9)' }, { filter: 'brightness(1)' }], {
        duration: THRONE_ENTER_FLASH_MS,
        delay: afterLast,
        easing: EASE_OUT,
        fill: 'both',
      });
    }

    this.prevTop = nextTop;
    this.prevFirstId = firstId;
    this.primed = true;
  }
}
