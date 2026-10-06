import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import type { OverlayPatroItem } from './overlay-nx';
import { tecnicoClock, tecnicoRestanteSeg, type OverlayTecnicoView } from './overlay-tecnico';

/** Tela de Tempo Técnico — card central 1120 px, a 96 px do topo (canvas 1920×1080).
 *
 *  Só apresentação: QUANDO entra e sai é do `overlay-tecnico.ts`. O relógio é calculado de
 *  `startMs`/`durMs` a cada 250 ms, então todas as instâncias abertas mostram o mesmo número. */
@Component({
  selector: 'og-overlay-tecnico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <section
        class="card"
        animate.enter="tec-in"
        animate.leave="tec-out"
        role="timer"
        [attr.aria-label]="'Tempo técnico ' + clock()"
      >
        <div class="top">
          <div class="who">
            <span class="badge">{{ v.kind === 'auto' ? 'Tempo técnico · automático' : 'Tempo técnico' }}</span>
            <div class="names">
              @for (linha of linhas(); track $index) {
                <span class="nome">{{ linha }}</span>
              }
            </div>
            <span class="info">{{ v.info }}</span>
          </div>
          <span class="clock" [class.zero]="restante() === 0">{{ clock() }}</span>
        </div>

        <div class="track" aria-hidden="true">
          <i class="fill" [style.transform]="'scaleX(' + fracao() + ')'"></i>
        </div>

        @if (sponsors().length > 0) {
          <div class="divider"><span>Oferecimento</span><i></i></div>
          <div class="grid" [style.grid-template-columns]="'repeat(' + colunas() + ', 1fr)'">
            @for (s of sponsors(); track $index) {
              <div class="cell" [class.has-logo]="!!s.logo" [style.animation-delay]="0.35 + $index * 0.08 + 's'">
                @if (s.logo) {
                  <img [src]="s.logo" [alt]="s.nome" />
                } @else {
                  <span class="ph">{{ s.nome }}</span>
                }
              </div>
            }
          </div>
        }
      </section>
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 30;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }
    .card {
      position: absolute;
      top: 96px;
      left: 50%;
      width: 1120px;
      margin-left: -560px;
      box-sizing: border-box;
      padding: 40px 48px 44px;
      display: flex;
      flex-direction: column;
      gap: 30px;
      background: rgba(11, 11, 12, 0.93);
      border: 1px solid rgba(255, 138, 74, 0.45);
      border-radius: var(--nx-r-2, 10px);
      box-shadow: 0 24px 50px rgba(0, 0, 0, 0.55);
    }
    .tec-in {
      animation: tec-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .tec-out {
      animation: tec-out 0.4s ease-in both;
    }
    @keyframes tec-in {
      from {
        opacity: 0;
        transform: translateY(-30px);
      }
    }
    @keyframes tec-out {
      to {
        opacity: 0;
        transform: translateY(-30px);
      }
    }

    .top {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      column-gap: 40px;
    }
    .who {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 18px;
      min-width: 0;
    }
    .badge {
      background: var(--nx-orange-500, #ff6a1a);
      color: #120600;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      padding: 8px 14px;
      border-radius: 6px;
    }
    .names {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nome {
      font-size: 50px;
      font-weight: 800;
      line-height: 1.05;
      text-transform: uppercase;
      color: #fff;
    }
    .info {
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .clock {
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 190px;
      font-weight: 700;
      line-height: 0.85;
      font-variant-numeric: tabular-nums;
      color: #fff;
    }
    .clock.zero {
      color: var(--nx-orange-400, #ff8a4a);
      animation: tec-pulse 0.8s ease-in-out infinite alternate;
    }
    @keyframes tec-pulse {
      from {
        opacity: 1;
      }
      to {
        opacity: 0.3;
      }
    }

    .track {
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
    }
    .fill {
      display: block;
      height: 100%;
      background: var(--nx-orange-500, #ff6a1a);
      transform-origin: 0 50%;
      transition: transform 0.25s linear;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 20px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--nx-orange-400, #ff8a4a);
      margin-bottom: -14px;
    }
    .divider i {
      flex: 1;
      height: 1px;
      background: rgba(255, 255, 255, 0.12);
    }

    .grid {
      display: grid;
      gap: 16px;
    }
    .cell {
      height: 110px;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      overflow: hidden;
      border-radius: 8px;
      border: 1.5px dashed rgba(255, 255, 255, 0.22);
      background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.045) 0 10px, transparent 10px 20px);
      animation: tec-logo 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .cell.has-logo {
      border: 0;
      background: #fff;
      padding: 12px;
    }
    .cell img {
      /* 100% nos dois eixos + contain: o logo ESCALA pra caber (pequeno cresce, grande encolhe).
         max-* em % não resolve numa célula de altura intrínseca e o overflow cortava o logo. */
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
    }
    .ph {
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
      text-align: center;
      padding: 0 8px;
    }
    @keyframes tec-logo {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
  `,
})
export class OverlayTecnicoComponent {
  readonly view = input<OverlayTecnicoView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());
  readonly sponsors = input<OverlayPatroItem[]>([]);

  private readonly now = signal(Date.now());

  protected readonly restante = computed(() => {
    const v = this.view();
    return v ? tecnicoRestanteSeg(v.startMs, v.durMs, this.now()) : 0;
  });
  protected readonly clock = computed(() => tecnicoClock(this.restante()));
  protected readonly fracao = computed(() => {
    const v = this.view();
    if (!v) return 0;
    return Math.min(1, Math.max(0, (v.durMs - (this.now() - v.startMs)) / v.durMs));
  });

  /** Um atleta por linha; sem elenco carregado, cai no rótulo da dupla. No automático o título
   *  é o fato que disparou o tempo. */
  protected readonly linhas = computed<string[]>(() => {
    const v = this.view();
    if (!v) return [];
    if (v.kind === 'auto') return ['21 pontos no set'];
    const team = this.teams().get(v.teamId);
    const players = (team?.players ?? []).map((p) => p.trim()).filter((p) => p !== '');
    if (players.length > 0) return players;
    return [team?.label?.trim() || (v.side === 'B' ? 'Dupla B' : 'Dupla A')];
  });

  /** 6 logos viram 2 linhas de 3; fora isso, até 5 por linha. */
  protected readonly colunas = computed(() => {
    const n = this.sponsors().length;
    return n === 6 ? 3 : Math.max(1, Math.min(n, 5));
  });

  constructor() {
    // Relógio de 250 ms só enquanto há tempo técnico no ar.
    effect((onCleanup) => {
      if (!this.view()) return;
      this.now.set(Date.now());
      const h = setInterval(() => this.now.set(Date.now()), 250);
      onCleanup(() => clearInterval(h));
    });
  }
}
