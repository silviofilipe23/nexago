import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxSpinnerComponent } from './nx-spinner.component';

/** Loading de página inteira (transição de rota / primeira carga) — espelho do
 *  `OgcLoadingPageScreen` do design: spinner 64px, título "Carregando X…" e subtítulo
 *  mono pulsante opcional. Anuncia via `role="status"`. */
@Component({
  selector: 'app-nx-page-loading',
  imports: [NxSpinnerComponent],
  template: `
    <app-nx-spinner [size]="64" />
    <div class="copy">
      <p class="title">{{ title() }}</p>
      @if (subtitle(); as s) {
        <p class="subtitle">{{ s }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      flex: 1;
      min-height: 260px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      padding: 40px 24px;
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

    .subtitle {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin: 6px 0 0;
      animation: nx-pulse 1.6s ease-in-out infinite;
    }

    @keyframes nx-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .subtitle {
        animation: none;
      }
    }
  `,
  host: {
    role: 'status',
    'aria-live': 'polite',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxPageLoadingComponent {
  readonly title = input('Carregando…');
  readonly subtitle = input<string | null>(null);
}
