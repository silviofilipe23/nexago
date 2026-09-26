import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { OverlayMarkComponent } from './overlay-mark.component';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import { duelAnimEventsOf, duelSnapOf } from './overlay-duel-anim';
import type { OverlayDuelView, OverlaySide } from './overlay-selectors';

const POINT_POP_MS = 420;
const SERVE_ENTER_MS = 420;
const FLASH_MS = 1100;
const SET_RISE_MS = 700;
const WIN_BLINK_MS = 600;
const ROW_STAGGER_MS = 110;

type Side = 'A' | 'B';
type ServeKey = `${Side}${1 | 2}`;

/** Placar Dupla×Dupla — layout de transmissão (âncora bl 80/74) + animações.
 *
 *  Só apresentação: a visão vem de `overlayViewOf`. Transições saem de `duelAnimEventsOf`. */
@Component({
  selector: 'og-overlay-scoreboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayMarkComponent],
  template: `
    @if (view(); as v) {
      <div
        class="board"
        [class.board--final-mode]="isFinal()"
        [class.board--ended]="v.phase === 'final'"
      >
        @if (flash()) {
          <span class="flash" aria-hidden="true"></span>
        }

        <div class="status" [class.status--final-mode]="isFinal()">
          @if (v.phase === 'final') {
            <span class="status-fim">Fim de jogo</span>
          } @else if (isFinal()) {
            <span class="status-badge"
              ><span class="status-badge-shine" aria-hidden="true"></span>Grande final</span
            >
          } @else if (v.phase === 'live') {
            <span class="status-live"><i class="dot"></i>Ao vivo</span>
          }
          @if (categoryName()) {
            <span class="sep" aria-hidden="true"></span>
            <span class="status-seg status-seg--strong">{{ categoryName() }}</span>
          }
          @if (v.roundLabel) {
            <span class="sep" aria-hidden="true"></span>
            <span class="status-seg">{{ v.roundLabel }}</span>
          }
          @if (v.phase === 'final') {
            <span class="sep" aria-hidden="true"></span>
            <span class="status-seg">Vitória por {{ v.setsA }} × {{ v.setsB }}</span>
          } @else {
            <span class="sep" aria-hidden="true"></span>
            <span class="status-seg">{{ setStatusLabel(v) }}</span>
          }
          @if (courtName() && v.phase !== 'final') {
            <span class="sep" aria-hidden="true"></span>
            <span class="status-seg">{{ courtName() }}</span>
          }
        </div>

        <div
          class="panel"
          [class.panel--final-mode]="isFinal()"
          [style.--set-cols]="v.showSets ? v.setColumns.length : 0"
        >
          <div class="head">
            <span class="head-dupla">{{ v.phase === 'final' ? 'Resultado' : 'Dupla' }}</span>
            @if (v.showSets) {
              @for (col of v.setColumns; track col.index) {
                <span class="head-set" [class.head-set--on]="col.active && v.phase !== 'final'">{{
                  col.label
                }}</span>
              }
            }
            <span class="head-pts">{{ v.phase === 'final' ? 'Sets' : 'Pontos' }}</span>
          </div>

          @for (side of sides; track side; let i = $index) {
            <div
              class="row"
              [class.row--win]="winSide() === side"
              [class.row--lose]="loseSide() === side"
              [class.row--blink]="winBlink() === side"
              [class.row--enter]="rowEnter()"
              [style.animation-delay]="rowEnter() ? i * 110 + 'ms' : null"
            >
              @if (winSide() === side) {
                <span class="row-shine" aria-hidden="true"></span>
              }

              <div class="team" [class.team--win]="winSide() === side">
                @for (slot of slots; track slot) {
                  <div class="athlete">
                    <span
                      class="serve"
                      [class.serve--on]="isServing(v, side, slot)"
                      [class.serve--enter]="serveEnter() === serveKey(side, slot)"
                    ></span>
                    <span
                      class="name"
                      [class.name--dim]="!isServing(v, side, slot) && v.phase !== 'final'"
                      >{{ playerName(sideOf(v, side), slot) }}</span
                    >
                  </div>
                }
              </div>

              @if (v.showSets) {
                @for (col of v.setColumns; track col.index) {
                  <span
                    class="set"
                    [class.set--live]="col.active && v.phase !== 'final'"
                    [class.set--won]="setWon(v, side, col.index)"
                    [class.set--lost]="setLost(v, side, col.index)"
                    [class.set--rise]="setRise() && col.index === riseCol()"
                  >
                    {{ setValue(v, side, col.index) }}
                  </span>
                }
              }

              <span
                class="points"
                [class.points--lead]="v.phase !== 'final' && v.pointsLead === side"
                [class.points--pop]="pointPop() === side"
                [class.points--sets]="v.phase === 'final'"
              >
                @if (isFinal() && v.phase !== 'final' && v.pointsLead === side) {
                  <span class="points-shine" aria-hidden="true"></span>
                }
                <span class="points-num">{{
                  v.phase === 'final'
                    ? side === 'A'
                      ? v.setsA
                      : v.setsB
                    : side === 'A'
                      ? (v.pointsA ?? '–')
                      : (v.pointsB ?? '–')
                }}</span>
                @if (v.phase !== 'final' && v.alert?.side === side && v.alert; as alert) {
                  <span
                    class="seal"
                    [class.seal--match]="alert.kind === 'match'"
                    [class.seal--set]="alert.kind === 'set'"
                  >
                    {{ alert.kind === 'match' ? 'MATCH POINT' : 'SET POINT' }}
                  </span>
                }
              </span>
            </div>
          }
        </div>
      </div>
      <og-overlay-mark corner="br" />
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }

    .board {
      position: absolute;
      left: 80px;
      bottom: 74px;
      width: max-content;
      max-width: calc(100% - 160px);
    }

    .flash {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 160%;
      height: 160%;
      background: radial-gradient(
        circle at 0% 100%,
        rgba(255, 106, 26, 0.55) 0%,
        rgba(255, 106, 26, 0.18) 28%,
        transparent 58%
      );
      animation: duel-flash 1.1s ease-out both;
      pointer-events: none;
      z-index: 5;
    }
    @keyframes duel-flash {
      from {
        opacity: 0.95;
        transform: scale(0.55);
      }
      to {
        opacity: 0;
        transform: scale(1.15);
      }
    }

    .status {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      margin-bottom: 14px;
      padding: 8px 16px;
      border-radius: var(--nx-r-2, 10px);
      border: 1px solid var(--nx-line, rgba(255, 255, 255, 0.08));
      background: rgba(11, 11, 12, 0.86);
      overflow: hidden;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .status--final-mode {
      border-color: rgba(255, 106, 26, 0.35);
      background: rgba(13, 10, 8, 0.92);
    }
    .status-live,
    .status-fim,
    .status-badge,
    .status-seg {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--nx-text-dim, rgba(244, 244, 245, 0.55));
    }
    .status-live {
      color: var(--nx-live, #ff3b30);
    }
    .status-fim,
    .status-badge {
      position: relative;
      overflow: hidden;
      margin: -8px 0 -8px -16px;
      padding: 8px 14px;
      background: var(--nx-orange-500, #ff6a1a);
      color: #1a0800;
      animation: duel-seal-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
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
      animation: duel-head-shine 2.8s ease-in-out 1.4s infinite;
      pointer-events: none;
    }
    .status-seg--strong {
      color: #fff;
    }
    .sep {
      flex: none;
      width: 1px;
      height: 14px;
      margin: 0 12px;
      background: var(--nx-line, rgba(255, 255, 255, 0.08));
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: duel-live 1.6s ease-in-out infinite;
    }
    @keyframes duel-live {
      0%,
      100% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.35;
        transform: scale(0.72);
      }
    }
    @keyframes duel-seal-in {
      from {
        opacity: 0;
        filter: blur(8px);
        transform: scale(1.28);
      }
      to {
        opacity: 1;
        filter: none;
        transform: none;
      }
    }
    @keyframes duel-head-shine {
      from {
        background-position: 120% 0;
      }
      to {
        background-position: -120% 0;
      }
    }

    .panel {
      --set-cols: 0;
      position: relative;
      border-radius: var(--nx-r-2, 10px);
      background: #0b0b0c;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
      /* Selo de set/match point vive 14 px fora da célula de pontos. */
      overflow: visible;
    }
    .panel--final-mode {
      border-radius: 12px;
      box-shadow:
        0 18px 40px rgba(0, 0, 0, 0.55),
        0 0 22px rgba(255, 106, 26, 0.45);
    }
    .panel--final-mode::before {
      content: '';
      position: absolute;
      inset: 0;
      padding: 2px;
      border-radius: inherit;
      box-sizing: border-box;
      pointer-events: none;
      z-index: 4;
      background: conic-gradient(
        from 0deg,
        transparent 0 70%,
        var(--nx-orange-400, #ff8a4a) 82%,
        #fff 86%,
        var(--nx-orange-500, #ff6a1a) 90%,
        transparent 100%
      );
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: duel-border-spin 3.2s linear infinite;
    }
    @keyframes duel-border-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .head,
    .row {
      display: grid;
      grid-template-columns: minmax(340px, auto) repeat(var(--set-cols), 64px) 104px;
      align-items: stretch;
    }

    .head {
      height: 30px;
      border-radius: var(--nx-r-2, 10px) var(--nx-r-2, 10px) 0 0;
      overflow: hidden;
      background: #0e0e10;
      color: var(--nx-text-dim, rgba(244, 244, 245, 0.55));
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .board--final-mode .head {
      color: var(--nx-orange-400, #ff8a4a);
    }
    .head-dupla {
      display: flex;
      align-items: center;
      padding-left: 22px;
    }
    .head-set,
    .head-pts {
      display: grid;
      place-items: center;
    }
    .head-set--on {
      color: var(--nx-orange-400, #ff8a4a);
    }
    .head-pts {
      background: var(--nx-orange-600, #e5560e);
      color: #1a0800;
    }

    .row {
      position: relative;
      height: 96px;
      color: #fff;
    }
    .row + .row {
      border-top: 1px solid var(--nx-line, rgba(255, 255, 255, 0.08));
    }
    .row:last-child {
      border-radius: 0 0 var(--nx-r-2, 10px) var(--nx-r-2, 10px);
      overflow: hidden;
    }
    .row--lose {
      color: rgba(255, 255, 255, 0.5);
    }
    .row--lose .name,
    .row--lose .set,
    .row--lose .points-num {
      color: rgba(255, 255, 255, 0.5);
    }
    .row--blink {
      animation: duel-win-blink 0.6s ease-out both;
    }
    .row--enter {
      animation: duel-row-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes duel-row-up {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes duel-win-blink {
      0% {
        filter: brightness(1);
      }
      40% {
        filter: brightness(1.35);
      }
      100% {
        filter: brightness(1);
      }
    }
    .row-shine {
      position: absolute;
      inset: 0;
      width: 42%;
      background: linear-gradient(
        105deg,
        transparent 0%,
        rgba(255, 255, 255, 0.28) 48%,
        transparent 62%
      );
      transform: translateX(-120%) skewX(-18deg);
      animation: duel-row-shine 2.8s ease-in-out infinite;
      pointer-events: none;
      z-index: 1;
    }
    @keyframes duel-row-shine {
      0%,
      18% {
        transform: translateX(-120%) skewX(-18deg);
      }
      48%,
      100% {
        transform: translateX(280%) skewX(-18deg);
      }
    }

    .team {
      display: grid;
      grid-template-rows: 1fr 1fr;
      align-content: center;
      gap: 6px;
      min-width: 0;
      padding: 0 26px 0 22px;
      background: linear-gradient(180deg, #17171a, #0d0d0f);
    }
    .team--win {
      background: var(--nx-orange-500, #ff6a1a);
      color: #120600;
    }
    .team--win .serve {
      border-color: rgba(18, 6, 0, 0.35);
    }
    .team--win .name {
      color: #120600;
    }

    .athlete {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .serve {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.12);
      background: transparent;
    }
    .serve--on {
      border-color: transparent;
      background: var(--nx-orange-500, #ff6a1a);
      box-shadow: 0 0 12px rgba(255, 138, 74, 0.8);
    }
    .team--win .serve--on {
      background: #120600;
      box-shadow: none;
    }
    .serve--enter.serve--on {
      animation: duel-serve 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    @keyframes duel-serve {
      from {
        opacity: 0.25;
        transform: scale(2.2);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .name {
      min-width: 0;
      font-size: 27px;
      font-weight: 800;
      letter-spacing: 0.01em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.1;
      color: #fff;
    }
    .name--dim {
      color: rgba(255, 255, 255, 0.82);
    }

    .set {
      display: grid;
      place-items: center;
      border-left: 1px solid var(--nx-line, rgba(255, 255, 255, 0.08));
      background: #0b0b0d;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 28px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: rgba(255, 255, 255, 0.55);
    }
    .set--live {
      background: #141416;
      color: rgba(255, 255, 255, 0.45);
    }
    .set--won {
      color: #fff;
    }
    .set--lost {
      color: rgba(255, 255, 255, 0.38);
    }
    .set--rise {
      animation: duel-set-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes duel-set-rise {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .points {
      position: relative;
      display: grid;
      place-items: center;
      overflow: visible;
      background: linear-gradient(180deg, #3a1808, #1b0b03);
      color: #ffe2cf;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 44px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .points--lead {
      background: linear-gradient(
        180deg,
        var(--nx-orange-500, #ff6a1a),
        var(--nx-orange-600, #e5560e)
      );
      color: #120600;
    }
    .points--sets {
      background: #0b0b0d;
      color: #fff;
    }
    .points-shine {
      position: absolute;
      inset: 0;
      width: 55%;
      background: linear-gradient(
        105deg,
        transparent 0%,
        rgba(255, 255, 255, 0.35) 50%,
        transparent 100%
      );
      transform: translateX(-120%);
      animation: duel-row-shine 2.8s ease-in-out infinite;
      pointer-events: none;
    }
    .points-num {
      display: inline-block;
      position: relative;
      z-index: 1;
    }
    .points--pop .points-num {
      animation: duel-point 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    @keyframes duel-point {
      0% {
        transform: scale(1);
      }
      35% {
        transform: scale(1.3);
      }
      70% {
        transform: scale(0.94);
      }
      100% {
        transform: scale(1);
      }
    }

    .seal {
      position: absolute;
      left: calc(100% + 14px);
      top: 50%;
      transform: translateY(-50%);
      padding: 6px 12px;
      border-radius: 999px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.12em;
      white-space: nowrap;
      animation: duel-seal-pulse 1.4s ease-in-out infinite;
      z-index: 6;
    }
    .seal--match {
      background: var(--nx-orange-500, #ff6a1a);
      color: #120600;
      box-shadow: 0 0 12px rgba(255, 106, 26, 0.7);
    }
    .seal--set {
      background: #120600;
      color: var(--nx-orange-500, #ff6a1a);
      border: 1px solid var(--nx-orange-500, #ff6a1a);
      box-shadow: 0 0 10px rgba(255, 106, 26, 0.45);
    }
    @keyframes duel-seal-pulse {
      0%,
      100% {
        filter: brightness(1);
        box-shadow: 0 0 10px rgba(255, 106, 26, 0.4);
      }
      50% {
        filter: brightness(1.25);
        box-shadow: 0 0 18px rgba(255, 106, 26, 0.85);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .flash,
      .dot,
      .serve--enter,
      .points--pop .points-num,
      .set--rise,
      .seal,
      .row-shine,
      .points-shine,
      .row--blink,
      .row--enter,
      .status-fim,
      .status-badge,
      .status-badge-shine,
      .panel--final-mode::before {
        animation: none;
      }
    }
  `,
})
export class OverlayScoreboardComponent {
  readonly view = input<OverlayDuelView | null>(null);
  readonly categoryName = input<string | null>(null);
  readonly courtName = input<string | null>(null);
  /** Modo Grande final — preferência do painel / partida final. */
  readonly isFinal = input(false);
  /** Elenco por time — cada atleta numa linha. Sem isto, cai no rótulo "A / B". */
  readonly teams = input<ReadonlyMap<string, OverlayKocTeam>>(new Map<string, OverlayKocTeam>());

  protected readonly sides: readonly Side[] = ['A', 'B'];
  protected readonly slots: readonly (1 | 2)[] = [1, 2];

  protected readonly pointPop = signal<Side | null>(null);
  protected readonly serveEnter = signal<ServeKey | null>(null);
  protected readonly flash = signal(false);
  protected readonly setRise = signal(false);
  protected readonly riseCol = signal(0);
  protected readonly winBlink = signal<Side | null>(null);
  protected readonly winSide = signal<Side | null>(null);
  protected readonly loseSide = signal<Side | null>(null);
  protected readonly rowEnter = signal(false);

  private prevSnap: ReturnType<typeof duelSnapOf> | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  protected sideOf(v: OverlayDuelView, side: Side): OverlaySide {
    return side === 'A' ? v.a : v.b;
  }

  protected serveKey(side: Side, slot: 1 | 2): ServeKey {
    return `${side}${slot}`;
  }

  protected setStatusLabel(v: OverlayDuelView): string {
    if (v.targetPoints <= 15 && v.currentSetNumber >= 3) return 'Tie-break';
    return `Set ${v.currentSetNumber} · até ${v.targetPoints}`;
  }

  protected playerName(side: OverlaySide, slot: 1 | 2): string {
    const fromTeam = this.teams().get(side.teamId)?.players[slot - 1]?.trim() ?? '';
    if (fromTeam) return fromTeam;
    const parts = side.label.split(/\s*\/\s*/);
    return (parts[slot - 1] ?? '').trim() || `Atleta ${slot}`;
  }

  protected isServing(v: OverlayDuelView, side: Side, slot: 1 | 2): boolean {
    if (v.phase === 'final') return false;
    const s = this.sideOf(v, side);
    return s.serving && v.servingPlayerSlot === slot;
  }

  protected setValue(v: OverlayDuelView, side: Side, colIndex: number): string | number {
    const col = v.setColumns.find((c) => c.index === colIndex);
    if (!col) return '–';
    const n = side === 'A' ? col.a : col.b;
    return n ?? '–';
  }

  protected setWon(v: OverlayDuelView, side: Side, colIndex: number): boolean {
    const col = v.setColumns.find((c) => c.index === colIndex);
    if (!col || col.a == null || col.b == null) return false;
    return side === 'A' ? col.a > col.b : col.b > col.a;
  }

  protected setLost(v: OverlayDuelView, side: Side, colIndex: number): boolean {
    const col = v.setColumns.find((c) => c.index === colIndex);
    if (!col || col.a == null || col.b == null) return false;
    return side === 'A' ? col.a < col.b : col.b < col.a;
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const t of this.timers) clearTimeout(t);
      this.timers.clear();
    });

    effect(() => {
      const v = this.view();
      if (!v || v.kind !== 'duel') {
        this.prevSnap = null;
        return;
      }

      if (!this.prevSnap && v.phase === 'final' && v.winnerSide) {
        this.winSide.set(v.winnerSide);
        this.loseSide.set(v.winnerSide === 'A' ? 'B' : 'A');
        this.rowEnter.set(true);
        this.later(ROW_STAGGER_MS * 2 + 600, () => this.rowEnter.set(false));
        this.prevSnap = duelSnapOf(v);
        return;
      }

      const events = duelAnimEventsOf(this.prevSnap, v);
      this.prevSnap = duelSnapOf(v);

      for (const ev of events) {
        if (ev.type === 'point') this.triggerPoint(ev.side);
        if (ev.type === 'serve') this.triggerServe(ev.side, ev.slot);
        if (ev.type === 'setEnd') this.triggerSetEnd(v);
        if (ev.type === 'matchEnd') this.triggerMatchEnd(ev.winner);
      }
    });
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private triggerPoint(side: Side): void {
    this.pointPop.set(side);
    this.later(POINT_POP_MS, () => {
      if (this.pointPop() === side) this.pointPop.set(null);
    });
  }

  private triggerServe(side: Side, slot: 1 | 2): void {
    const key = this.serveKey(side, slot);
    this.serveEnter.set(key);
    this.later(SERVE_ENTER_MS, () => {
      if (this.serveEnter() === key) this.serveEnter.set(null);
    });
  }

  private triggerSetEnd(v: OverlayDuelView): void {
    this.flash.set(true);
    this.later(FLASH_MS, () => this.flash.set(false));
    const lastClosed = [...v.setColumns].reverse().find((c) => c.a != null && !c.active);
    this.riseCol.set(lastClosed?.index ?? 0);
    this.setRise.set(true);
    this.later(SET_RISE_MS, () => this.setRise.set(false));
  }

  private triggerMatchEnd(winner: Side): void {
    this.flash.set(true);
    this.later(FLASH_MS, () => this.flash.set(false));
    this.winSide.set(winner);
    this.loseSide.set(winner === 'A' ? 'B' : 'A');
    this.winBlink.set(winner);
    this.later(WIN_BLINK_MS, () => this.winBlink.set(null));
    this.rowEnter.set(true);
    this.later(ROW_STAGGER_MS * 2 + 600, () => this.rowEnter.set(false));
  }
}
