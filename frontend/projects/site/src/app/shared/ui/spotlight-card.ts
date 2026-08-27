import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';

/**
 * Porta de `SpotlightCard` (site Next.js). Card com glow laranja que segue o cursor + leve
 * elevação no hover. Mesma linguagem do TournamentCard/ArenaCard, reutilizável em qualquer
 * seção. Só anima transform/opacity; desliga o lift sob prefers-reduced-motion.
 *
 * Diferente do original (elemento `as` configurável), aqui o host É o próprio elemento do
 * card — o consumidor decide a semântica via `<app-spotlight-card>` (equivalente a `div`).
 * Passe classes extras via `[className]`, igual ao `StoreButtons` já portado.
 */
@Component({
  selector: 'app-spotlight-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'hostClasses()',
    '(mousemove)': 'onMouseMove($event)',
  },
  template: `
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
      style="background: radial-gradient(300px circle at var(--mx, 50%) var(--my, 50%), rgba(255,106,26,0.13), transparent 60%)"
    ></span>
    <ng-content />
  `,
})
export class SpotlightCard {
  readonly className = input('');

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly hostClasses = computed(
    () =>
      `group/spot relative overflow-hidden rounded-5 border border-line bg-surface-1 transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-brand/40 motion-reduce:hover:translate-y-0 motion-reduce:transition-none ${this.className()}`,
  );

  protected onMouseMove(event: MouseEvent): void {
    const el = this.elementRef.nativeElement;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
}
