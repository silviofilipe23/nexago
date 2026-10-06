import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { OverlayTeam } from './overlay-live.gateway';
import type { OverlayMedicoView } from './overlay-medico';
import { tecnicoClock, tecnicoRestanteSeg } from './overlay-tecnico';

/** Tela de Tempo Médico — card compacto de 780 px a 74 px do topo (canvas 1920×1080), em
 *  vermelho-coral (`--med`) no lugar do laranja. Sem patrocinadores: não é momento comercial.
 *
 *  Só apresentação: QUANDO está no ar é do doc (`medicoOf`). Ao zerar NÃO sai: vira "Tempo
 *  esgotado" até a mesa encerrar. */
@Component({
  selector: 'og-overlay-medico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <section class="card" animate.enter="med-in" animate.leave="med-out" role="timer" [attr.aria-label]="'Atendimento médico ' + clock()">
        <span class="selo"><i class="cruz" aria-hidden="true"></i>Atendimento médico</span>
        <div class="esq">
          <span class="atleta">{{ atleta() }}</span>
          <span class="detalhe">{{ detalhe() }}</span>
        </div>
        <div class="dir">
          <span class="rotulo">{{ restante() === 0 ? 'Tempo esgotado' : 'Tempo restante' }}</span>
          <span class="clock" [class.zero]="restante() === 0">{{ clock() }}</span>
        </div>
        <div class="track" aria-hidden="true">
          <i class="fill" [style.transform]="'scaleX(' + fracao() + ')'"></i>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      --med: oklch(0.7 0.17 22);
      position: absolute;
      inset: 0;
      z-index: 30;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-display, 'Sora', system-ui, sans-serif);
    }
    .card {
      position: absolute;
      top: 74px;
      left: 50%;
      width: 780px;
      margin-left: -390px;
      box-sizing: border-box;
      padding: 24px 32px 30px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      row-gap: 14px;
      column-gap: 40px;
      overflow: hidden;
      background: rgba(11, 11, 12, 0.93);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-top: 3px solid var(--med);
      border-radius: var(--nx-r-2, 10px);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
    }
    .med-in {
      animation: med-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .med-out {
      animation: med-out 0.4s ease-in both;
    }
    @keyframes med-in {
      from {
        opacity: 0;
        transform: translateY(-30px);
      }
    }
    @keyframes med-out {
      to {
        opacity: 0;
        transform: translateY(-30px);
      }
    }

    .selo {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--med);
    }
    /* Cruz de 16 px: duas barras de 6 px. */
    .cruz {
      position: relative;
      width: 16px;
      height: 16px;
      flex: none;
    }
    .cruz::before,
    .cruz::after {
      content: '';
      position: absolute;
      background: var(--med);
    }
    .cruz::before {
      left: 5px;
      top: 0;
      width: 6px;
      height: 16px;
    }
    .cruz::after {
      left: 0;
      top: 5px;
      width: 16px;
      height: 6px;
    }

    .esq {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .atleta {
      font-size: 42px;
      font-weight: 800;
      line-height: 1.1;
      text-transform: uppercase;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .detalhe {
      font-family: var(--nx-font-body, 'Inter', system-ui, sans-serif);
      font-size: 17px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.55);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dir {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .rotulo {
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .clock {
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 72px;
      font-weight: 700;
      line-height: 0.9;
      font-variant-numeric: tabular-nums;
      color: #fff;
    }
    .clock.zero {
      color: var(--med);
      animation: med-pulse 0.8s ease-in-out infinite alternate;
    }
    @keyframes med-pulse {
      from {
        opacity: 1;
      }
      to {
        opacity: 0.3;
      }
    }

    .track {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
    }
    .fill {
      display: block;
      height: 100%;
      background: var(--med);
      transform-origin: 0 50%;
      transition: transform 0.25s linear;
    }
  `,
})
export class OverlayMedicoComponent {
  readonly view = input<OverlayMedicoView | null>(null);
  readonly teams = input<ReadonlyMap<string, OverlayTeam>>(new Map());

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

  private readonly equipe = computed(() => this.teams().get(this.view()?.teamId ?? ''));

  protected readonly atleta = computed(() => {
    const v = this.view();
    if (!v) return '';
    return v.playerName || this.equipe()?.players[v.playerSlot - 1]?.trim() || `Atleta ${v.playerSlot}`;
  });

  /** "Dupla Fulano / Ciclano · Set 2 · 17–19". */
  protected readonly detalhe = computed(() => {
    const v = this.view();
    if (!v) return '';
    const nomes = (this.equipe()?.players ?? []).map((p) => p.trim()).filter((p) => p !== '');
    const dupla = nomes.length > 0 ? nomes.join(' / ') : this.equipe()?.label?.trim() || `Dupla ${v.side}`;
    return `Dupla ${dupla} · ${v.setInfo}`;
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.view()) return;
      this.now.set(Date.now());
      const h = setInterval(() => this.now.set(Date.now()), 250);
      onCleanup(() => clearInterval(h));
    });
  }
}
