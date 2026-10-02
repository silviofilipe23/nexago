import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { InterviewCampaign } from '../../painel/data/broadcast-control';

/** Campanha do entrevistado no torneio, no canto direito, acima da marca. Cada linha entra em
 *  cascata (200 ms + 80 ms por linha) — o componente é recriado a cada entrevistado, então a
 *  cascata roda de novo sem estado próprio. */
@Component({
  selector: 'og-overlay-interview-campaign',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topo">
      <span class="titulo">{{ campaign().title }}</span>
      <span class="resumo">{{ campaign().summary }}</span>
    </div>
    <ol class="linhas">
      @for (r of campaign().rows; track $index) {
        <li class="linha" [style.--i]="$index">
          <span class="marca" [class.venceu]="r.won">{{ r.mark }}</span>
          <span class="jogo">
            <span class="adv">{{ r.opponent }}</span>
            <span class="fase">{{ r.phase }}</span>
          </span>
          <span class="placar">{{ r.score }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 420px;
      box-sizing: border-box;
      padding: 22px 24px 24px;
      border: 1px solid rgba(255, 106, 26, 0.4);
      border-radius: 10px;
      background: rgba(11, 11, 12, 0.9);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5);
      color: #f4f4f5;
    }
    .topo {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .titulo {
      color: #ff8a4a;
    }
    .resumo {
      color: rgba(244, 244, 245, 0.62);
    }
    .linhas {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .linha {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      padding: 10px 14px;
      border-radius: 8px;
      background: #141416;
      animation: linha-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) calc(200ms + var(--i, 0) * 80ms) both;
    }
    @keyframes linha-in {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
    }
    .marca {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #2a2a2e;
      color: rgba(244, 244, 245, 0.8);
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 13px;
      font-weight: 800;
    }
    .marca.venceu {
      background: #ff6a1a;
      color: #120600;
    }
    .jogo {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .adv {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-display, 'Sora', sans-serif);
      font-size: 17px;
      font-weight: 600;
    }
    .fase {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(244, 244, 245, 0.62);
    }
    .placar {
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 22px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    @media (prefers-reduced-motion: reduce) {
      .linha {
        animation-duration: 1ms;
        animation-delay: 0ms;
      }
    }
  `,
})
export class OverlayInterviewCampaignComponent {
  readonly campaign = input.required<InterviewCampaign>();
}
