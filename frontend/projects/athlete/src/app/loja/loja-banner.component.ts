import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import type { StoreBanner } from '../data/store-showcase-model';

/** Troca automática dos banners (spec: 6 s). */
const ROTATE_MS = 6000;

/**
 * Banner de campanha da vitrine web: texto à esquerda, foto à direita. Com mais de um banner,
 * troca a cada 6 s com indicadores; pausa enquanto o mouse ou o foco estão nele.
 *
 * Todos os banners ficam empilhados na mesma célula: a troca é um crossfade (o que entra sobe de
 * leve e a foto assenta do zoom) e o bloco tem a altura do maior, então nada pula ao trocar. Os
 * que não estão no ar ficam `inert` — o foco e o leitor de tela só alcançam o visível.
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
  /** A lista pode encolher (banner saiu do ar) com o índice lá na frente. */
  protected readonly active = computed(() => Math.min(this.index(), Math.max(this.banners().length - 1, 0)));

  constructor() {
    // Relê o índice: troca manual também reinicia os 6 s, em vez de o próximo vir logo em seguida.
    effect((onCleanup) => {
      const count = this.banners().length;
      const current = this.active();
      if (count < 2 || this.paused()) return;
      const timer = setTimeout(() => this.index.set((current + 1) % count), ROTATE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected go(i: number): void {
    this.index.set(i);
  }

  /** Setas, Home e End no seletor de abas (padrão ARIA de tabs): troca e leva o foco junto. */
  protected onDotsKeydown(event: KeyboardEvent): void {
    const count = this.banners().length;
    const current = this.active();
    const targets: Record<string, number> = {
      ArrowRight: (current + 1) % count,
      ArrowLeft: (current - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    this.go(next);
    const dots = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]');
    dots[next]?.focus();
  }
}
