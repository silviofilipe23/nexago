import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type { StoreBanner } from '../data/store-showcase-model';

/** Troca automática dos banners (spec: 6 s). */
const ROTATE_MS = 6000;

/**
 * Banner de campanha da vitrine web: texto à esquerda, foto à direita. Com mais de um banner,
 * troca a cada 6 s com indicadores; pausa enquanto o mouse ou o foco estão nele.
 */
@Component({
  selector: 'app-loja-banner',
  templateUrl: './loja-banner.component.html',
  styleUrl: './loja-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mouseenter)': 'paused.set(true)',
    '(mouseleave)': 'paused.set(false)',
    '(focusin)': 'paused.set(true)',
    '(focusout)': 'paused.set(false)',
  },
})
export class LojaBannerComponent {
  readonly banners = input.required<StoreBanner[]>();

  readonly primaryClick = output<StoreBanner>();
  readonly secondaryClick = output<StoreBanner>();

  protected readonly index = signal(0);
  protected readonly paused = signal(false);
  /** Lista de um item com chave no id: trocar de banner recria o bloco e o fade roda de novo. */
  protected readonly current = computed(() => {
    const list = this.banners();
    const b = list[Math.min(this.index(), list.length - 1)];
    return b ? [b] : [];
  });

  constructor() {
    effect((onCleanup) => {
      const count = this.banners().length;
      if (count < 2 || this.paused()) return;
      const timer = setInterval(() => this.index.update((i) => (i + 1) % count), ROTATE_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  protected go(i: number): void {
    this.index.set(i);
  }
}
