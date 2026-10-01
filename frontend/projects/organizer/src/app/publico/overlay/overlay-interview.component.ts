import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { interviewLineOf, type BroadcastInterview } from '../../painel/data/broadcast-control';
import { initialsOf } from '../../painel/data/mock-data';
import { OgAvatarComponent } from '../../painel/ui/avatar.component';

/** Tarja de entrevista ("reporter") — terço inferior à esquerda, comandada pela tela
 *  Transmissão do painel. A página mantém o componente SEMPRE montado: o `@if` interno com
 *  `animate.leave` precisa do host vivo pra tarja sair deslizando.
 *
 *  Painel OPACO: translúcido, o fundo da câmera atravessava e disputava com o nome (lição do
 *  placar de duelo). Mesma âncora do placar (80px, 74px do rodapé) — por isso a página tira o
 *  placar do ar enquanto a tarja está nele. */
@Component({
  selector: 'og-overlay-interview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgAvatarComponent],
  host: { 'aria-live': 'polite' },
  template: `
    @if (data(); as d) {
      <div class="tarja" animate.enter="tarja-in" animate.leave="tarja-out">
        <og-avatar class="foto" [initials]="iniciais()" [photoUrl]="d.photoUrl" [size]="112" />
        <div class="texto">
          <div class="nome">{{ d.name }}</div>
          @if (linha(); as l) {
            <div class="linha">{{ l }}</div>
          }
        </div>
      </div>
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
    .tarja {
      position: absolute;
      left: 80px;
      bottom: 74px;
      display: flex;
      align-items: center;
      gap: 24px;
      max-width: 1100px;
      padding: 20px 40px 20px 20px;
      border-radius: 18px;
      border-left: 6px solid var(--nx-orange-500, #ff6a1a);
      background: linear-gradient(135deg, #3a1c0c 0%, #141116 68%);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
      color: #f4f4f5;
    }
    .foto {
      flex: none;
    }
    .texto {
      min-width: 0;
    }
    .nome {
      font-size: 46px;
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .linha {
      margin-top: 8px;
      font-family: var(--nx-font-mono, 'JetBrains Mono', ui-monospace, monospace);
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-400, #ff8a4c);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tarja-in {
      animation: tarjaIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .tarja-out {
      animation: tarjaOut 360ms cubic-bezier(0.4, 0, 1, 1) both;
    }
    @keyframes tarjaIn {
      from {
        opacity: 0;
        transform: translateX(-60px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @keyframes tarjaOut {
      from {
        opacity: 1;
        transform: none;
      }
      to {
        opacity: 0;
        transform: translateX(-40px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tarja-in,
      .tarja-out {
        animation-duration: 1ms;
      }
    }
  `,
})
export class OverlayInterviewComponent {
  readonly data = input<BroadcastInterview | null>(null);

  protected readonly iniciais = computed(() => initialsOf(this.data()?.name ?? '') || '?');
  protected readonly linha = computed(() => {
    const d = this.data();
    return d ? interviewLineOf(d) : null;
  });
}
