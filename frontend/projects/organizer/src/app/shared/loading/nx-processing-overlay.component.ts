import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxSpinnerComponent } from './nx-spinner.component';

/** Overlay de processamento pra ações LONGAS e críticas (sortear chave, avançar rodada,
 *  salvar wizard) — espelho do `OgcProcessingScreen` do design: scrim sobre o conteúdo,
 *  card escuro com spinner 44px, título, descrição, barra indeterminada pulsante e o aviso
 *  "Não feche esta tela". O container pai precisa de `position: relative`. */
@Component({
  selector: 'app-nx-processing-overlay',
  imports: [NxSpinnerComponent],
  template: `
    <div class="card">
      <app-nx-spinner [size]="44" />
      <div class="copy">
        <p class="title">{{ title() }}</p>
        @if (description(); as d) {
          <p class="description">{{ d }}</p>
        }
      </div>
      <div class="bar" aria-hidden="true">
        <div class="bar-fill"></div>
      </div>
      <span class="note">{{ note() }}</span>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      z-index: 40;
      display: grid;
      place-items: center;
      background: rgba(10, 10, 10, 0.55);
      border-radius: inherit;
    }

    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 28px 40px;
      border-radius: var(--nx-r-4, 16px);
      background: rgba(10, 10, 10, 0.92);
      border: 1px solid var(--nx-line-strong);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      max-width: 360px;
    }

    .copy {
      text-align: center;
    }

    .title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin: 0;
    }

    .description {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 5px 0 0;
      max-width: 260px;
      line-height: 1.45;
    }

    .bar {
      width: 220px;
      height: 5px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .bar-fill {
      width: 62%;
      height: 100%;
      border-radius: 3px;
      background: var(--nx-orange-500);
      animation: nx-bar-pulse 1.2s ease-in-out infinite;
    }

    .note {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    @keyframes nx-bar-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bar-fill {
        animation: none;
      }
    }
  `,
  host: {
    role: 'alert',
    'aria-busy': 'true',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxProcessingOverlayComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly note = input('Não feche esta tela');
}
