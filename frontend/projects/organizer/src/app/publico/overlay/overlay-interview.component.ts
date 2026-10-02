import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, untracked } from '@angular/core';
import type { BroadcastInterview } from '../../painel/data/broadcast-control';
import { InterviewStageDriver } from './overlay-interview';
import { OverlayInterviewBrandComponent } from './overlay-interview-brand.component';
import { OverlayInterviewCampaignComponent } from './overlay-interview-campaign.component';
import { OverlayInterviewCardComponent } from './overlay-interview-card.component';
import type { OverlayPatroItem } from './overlay-nx';

/** Tarja de entrevista, comandada pela tela Transmissão do painel. Quatro blocos no canvas
 *  1920×1080: bug "Entrevista · Ao vivo" no topo, card no terço inferior esquerdo, campanha e
 *  marca/patrocínio à direita.
 *
 *  A página mantém o componente SEMPRE montado; a entrada, a troca de entrevistado (sai → 520 ms
 *  → entra) e a saída são do `InterviewStageDriver`, e o CSS anima pela fase. Cada bloco tem um
 *  índice `--d`: entra com 90 ms × d de atraso e sai com (3 − d) × 60 ms — o card entra primeiro
 *  e sai por último.
 *
 *  Mesma âncora do placar (80px, 74px do rodapé) — por isso a página tira o placar do ar
 *  enquanto a tarja está nele. Painéis opacos: translúcido, a câmera atravessa e disputa com o
 *  nome (lição do placar de duelo). */
@Component({
  selector: 'og-overlay-interview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayInterviewCardComponent, OverlayInterviewCampaignComponent, OverlayInterviewBrandComponent],
  host: { 'aria-live': 'polite' },
  template: `
    @if (main.stage().shown; as d) {
      <div class="bug" [attr.data-phase]="main.stage().phase">
        <span class="tag">Entrevista</span>
        <span class="live"><i aria-hidden="true"></i>Ao vivo</span>
        @if (eventName()) {
          <span class="divisor" aria-hidden="true"></span>
          <span class="evento">{{ eventName() }}</span>
        }
      </div>
      <div class="terco" [attr.data-phase]="main.stage().phase">
        @for (c of [d]; track c.key) {
          <og-overlay-interview-card class="blk" style="--d: 1" [data]="c" />
        }
      </div>
      <og-overlay-interview-brand class="blk marca" style="--d: 2" [attr.data-phase]="main.stage().phase" [sponsors]="sponsors()" />
    }
    @if (camp.stage().shown; as c) {
      <div class="campanha" [attr.data-phase]="camp.stage().phase">
        @for (x of [c]; track x.key) {
          @if (x.campaign; as campaign) {
            <og-overlay-interview-campaign class="blk" style="--d: 1" [campaign]="campaign" />
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      --ease: cubic-bezier(0.22, 1, 0.36, 1);
      position: fixed;
      inset: 0;
      display: block;
      pointer-events: none;
      font-family: var(--nx-font-ui, 'Inter', system-ui, sans-serif);
      color: #f4f4f5;
    }

    /* ── Entrada / saída dos blocos ─────────────────────────────── */
    .blk {
      animation:
        blk-fade-in 0.45s var(--ease) calc(var(--d, 1) * 90ms) both,
        blk-slide-in 0.6s var(--ease) calc(var(--d, 1) * 90ms) both;
    }
    .terco:is([data-phase='swap'], [data-phase='out']) .blk,
    .campanha:is([data-phase='swap'], [data-phase='out']) .blk,
    .marca[data-phase='out'] {
      animation:
        blk-fade-out 0.45s var(--ease) calc((3 - var(--d, 1)) * 60ms) both,
        blk-slide-out 0.6s var(--ease) calc((3 - var(--d, 1)) * 60ms) both;
    }
    @keyframes blk-fade-in {
      from {
        opacity: 0;
        filter: blur(4px);
      }
      to {
        opacity: 1;
        filter: blur(0);
      }
    }
    @keyframes blk-slide-in {
      from {
        transform: translateX(var(--from-x, -50px));
      }
      to {
        transform: none;
      }
    }
    @keyframes blk-fade-out {
      from {
        opacity: 1;
        filter: blur(0);
      }
      to {
        opacity: 0;
        filter: blur(4px);
      }
    }
    @keyframes blk-slide-out {
      from {
        transform: none;
      }
      to {
        transform: translateX(var(--from-x, -50px));
      }
    }

    /* ── 1. Bug do topo ─────────────────────────────────────────── */
    .bug {
      position: absolute;
      left: 80px;
      top: 64px;
      display: flex;
      align-items: center;
      gap: 12px;
      height: 32px;
      padding-right: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      background: rgba(11, 11, 12, 0.9);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5);
      animation:
        bug-fade 0.5s var(--ease) both,
        bug-drop 0.6s var(--ease) both;
    }
    .bug[data-phase='out'] {
      animation:
        bug-fade-out 0.5s var(--ease) 0.12s both,
        bug-rise 0.6s var(--ease) 0.12s both;
    }
    @keyframes bug-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes bug-drop {
      from {
        transform: translateY(-20px);
      }
    }
    @keyframes bug-fade-out {
      to {
        opacity: 0;
      }
    }
    @keyframes bug-rise {
      to {
        transform: translateY(-20px);
      }
    }
    .tag {
      position: relative;
      display: grid;
      place-items: center;
      align-self: stretch;
      padding: 0 14px;
      border-radius: 9px 0 0 9px;
      background: #ff6a1a;
      color: #120600;
      overflow: hidden;
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.24em;
      text-transform: uppercase;
    }
    /* Faixa de brilho: atravessa o selo em 45% de um ciclo de 3,2 s. */
    .tag::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: -40%;
      width: 30%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
      transform: skewX(-18deg);
      animation: sweep 3.2s cubic-bezier(0.5, 0, 0.3, 1) 1.2s infinite;
    }
    @keyframes sweep {
      0% {
        left: -40%;
      }
      45%,
      100% {
        left: 130%;
      }
    }
    .live {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .live i {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ff3b30;
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.3;
      }
    }
    .divisor {
      width: 1px;
      height: 14px;
      background: rgba(255, 255, 255, 0.16);
    }
    .evento {
      max-width: 900px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 600;
    }

    /* ── 2. Terço inferior ─────────────────────────────────────── */
    .terco {
      position: absolute;
      left: 80px;
      bottom: 74px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }

    /* ── 3. Campanha ───────────────────────────────────────────── */
    .campanha {
      position: absolute;
      right: 80px;
      bottom: 150px;
      --from-x: 60px;
    }

    /* ── 4. Marca / patrocínio ─────────────────────────────────── */
    .marca {
      position: absolute;
      right: 80px;
      bottom: 74px;
      --from-x: 60px;
    }

    @media (prefers-reduced-motion: reduce) {
      .blk,
      .bug,
      .terco .blk,
      .campanha .blk,
      .marca {
        animation-duration: 1ms !important;
        animation-delay: 0ms !important;
      }
      .tag::after,
      .live i {
        animation: none;
      }
    }
  `,
})
export class OverlayInterviewComponent {
  readonly data = input<BroadcastInterview | null>(null);
  /** Nome do torneio, no bug do topo. */
  readonly eventName = input('');
  readonly sponsors = input<readonly OverlayPatroItem[]>([]);

  protected readonly main = new InterviewStageDriver();
  /** Campanha tem fase própria: a chave do painel a liga e desliga com o card no ar. */
  protected readonly camp = new InterviewStageDriver();

  constructor() {
    effect(() => {
      const d = this.data();
      untracked(() => {
        this.main.push(d);
        this.camp.push(d && d.showCampaign && d.campaign ? d : null);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.main.destroy();
      this.camp.destroy();
    });
  }
}
