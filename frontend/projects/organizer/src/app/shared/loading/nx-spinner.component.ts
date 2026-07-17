import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Spinner de anel — trilha em `surface-1` + arco laranja girando (0.8s linear), espelho do
 *  `OgcSpinner` do design. `tone="dark"` é pra uso DENTRO de botões laranja (arco escuro).
 *  Decorativo (`aria-hidden`): o texto do botão/tela é quem anuncia o estado. */
@Component({
  selector: 'app-nx-spinner',
  template: '<div class="track"></div><div class="arc"></div>',
  styles: `
    :host {
      display: block;
      position: relative;
      flex: none;
    }

    .track,
    .arc {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border-style: solid;
      border-width: var(--nx-spinner-border, 3px);
    }

    .track {
      border-color: var(--nx-surface-1);
    }

    .arc {
      border-color: transparent;
      border-top-color: var(--nx-orange-500);
      animation: nx-spin 0.8s linear infinite;
    }

    :host(.nx-spinner--dark) .track {
      border-color: rgba(10, 10, 10, 0.25);
    }

    :host(.nx-spinner--dark) .arc {
      border-top-color: #0a0a0a;
    }

    @keyframes nx-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .arc {
        animation-duration: 1.6s;
      }
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.--nx-spinner-border]': 'borderWidth()',
    '[class.nx-spinner--dark]': 'tone() === "dark"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxSpinnerComponent {
  readonly size = input(36);
  /** `orange` (padrão, sobre superfícies) ou `dark` (dentro de botões laranja). */
  readonly tone = input<'orange' | 'dark'>('orange');

  protected readonly borderWidth = computed(() => (this.size() < 20 ? '2px' : '3px'));
}
