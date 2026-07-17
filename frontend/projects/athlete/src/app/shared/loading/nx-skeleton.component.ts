import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

function cssSize(v: string | number): string {
  return typeof v === 'number' ? `${v}px` : v;
}

/** Barra de skeleton com shimmer — espelho do `OgcSkel` do design (NexaGO Loading / Cascata).
 *  Compor várias num layout que imita a tela final; sempre `aria-hidden` (o container da tela
 *  anuncia o carregamento). */
@Component({
  selector: 'app-nx-skeleton',
  template: '',
  styles: `
    :host {
      display: block;
      flex: none;
      background: linear-gradient(90deg, var(--nx-surface-1) 25%, rgba(255, 255, 255, 0.06) 50%, var(--nx-surface-1) 75%);
      background-size: 400px 100%;
      animation: nx-shimmer 1.4s linear infinite;
    }

    @keyframes nx-shimmer {
      0% {
        background-position: -400px 0;
      }
      100% {
        background-position: 400px 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
        background: var(--nx-surface-1);
      }
    }
  `,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': 'radius()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxSkeletonComponent {
  readonly w = input<string | number>('100%');
  readonly h = input<string | number>(12);
  readonly r = input<string | number>(6);

  protected readonly width = computed(() => cssSize(this.w()));
  protected readonly height = computed(() => cssSize(this.h()));
  protected readonly radius = computed(() => cssSize(this.r()));
}
