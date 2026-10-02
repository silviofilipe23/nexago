import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import type { OverlayPatroItem } from './overlay-nx';

/** Rotação do logo, do protótipo do dono. */
export const INTERVIEW_SPONSOR_ROTATION_MS = 8000;
/** Fim da transição de saída (0,65 s) com folga — depois disso o logo volta pra fila. */
const SPONSOR_OUT_CLEAR_MS = 700;

/** Marca nexaGO + "Oferecimento" com os patrocinadores do torneio, no canto inferior direito
 *  durante a entrevista. A tarja suspende o card de patrocínio (ela toma a tela), então o
 *  patrocínio vem junto com ela: os logos se empilham numa célula só e revezam — o atual sobe e
 *  sai, o próximo entra por baixo. Sem patrocinador, fica só a marca. */
@Component({
  selector: 'og-overlay-interview-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="nexa">NEXA<span class="go">GO</span></span>
    @if (sponsors().length > 0) {
      <span class="divisor" aria-hidden="true"></span>
      <span class="oferecimento">Oferecimento</span>
      <span class="slot">
        @for (s of sponsors(); track $index) {
          <span class="logo" [class.atual]="$index === atual()" [class.saindo]="$index === saindo()">
            @if (s.logo) {
              <img [src]="s.logo" [alt]="s.nome" />
            } @else {
              <span class="nome">{{ s.nome }}</span>
            }
          </span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      background: rgba(11, 11, 12, 0.9);
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5);
      color: #f4f4f5;
    }
    .nexa {
      font-family: var(--nx-font-display, 'Sora', sans-serif);
      font-size: 19px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .go {
      color: #ff6a1a;
    }
    .divisor {
      width: 1px;
      height: 22px;
      background: rgba(255, 255, 255, 0.16);
    }
    .oferecimento {
      font-family: var(--nx-font-mono, 'JetBrains Mono', monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(244, 244, 245, 0.62);
    }
    .slot {
      display: grid;
      width: 124px;
      height: 34px;
      overflow: hidden;
    }
    .logo {
      grid-area: 1 / 1;
      display: grid;
      place-items: center;
      opacity: 0;
      transform: translateY(110%);
      transition:
        transform 0.65s cubic-bezier(0.22, 1, 0.36, 1),
        opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .logo.atual {
      opacity: 1;
      transform: none;
    }
    .logo.saindo {
      opacity: 0;
      transform: translateY(-110%);
    }
    img {
      max-width: 124px;
      max-height: 34px;
      object-fit: contain;
    }
    .nome {
      overflow: hidden;
      max-width: 124px;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--nx-font-ui, 'Inter', sans-serif);
      font-size: 13px;
      font-weight: 700;
    }
    @media (prefers-reduced-motion: reduce) {
      .logo {
        transition-duration: 1ms;
      }
    }
  `,
})
export class OverlayInterviewBrandComponent {
  readonly sponsors = input<readonly OverlayPatroItem[]>([]);

  /** Número, não a lista: o snapshot do torneio recria o array, e a rotação não deve recomeçar
   *  a cada um. */
  private readonly total = computed(() => this.sponsors().length);
  protected readonly atual = signal(0);
  protected readonly saindo = signal<number | null>(null);

  constructor() {
    let clear: ReturnType<typeof setTimeout> | null = null;
    effect((onCleanup) => {
      const n = this.total();
      this.atual.set(0);
      this.saindo.set(null);
      if (n < 2) return;
      const timer = setInterval(() => {
        const prev = this.atual();
        this.saindo.set(prev);
        this.atual.set((prev + 1) % n);
        if (clear != null) clearTimeout(clear);
        clear = setTimeout(() => this.saindo.set(null), SPONSOR_OUT_CLEAR_MS);
      }, INTERVIEW_SPONSOR_ROTATION_MS);
      onCleanup(() => clearInterval(timer));
    });
    inject(DestroyRef).onDestroy(() => {
      if (clear != null) clearTimeout(clear);
    });
  }
}
