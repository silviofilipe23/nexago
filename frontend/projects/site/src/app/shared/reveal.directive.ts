import { Directive, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

/**
 * Reveal on scroll: sobe + fade ao entrar no viewport (uma vez só). Porta do `Reveal`
 * (Framer Motion) do site Next.js — aqui via `IntersectionObserver` puro, sem lib de
 * animação extra (GSAP fica reservado pra cena cinemática do hero). Anima só
 * transform/opacity; respeita `prefers-reduced-motion` (sem deslocamento).
 */
@Directive({
  selector: '[nxReveal]',
  host: {
    class: 'nx-reveal',
    '[class.nx-reveal-visible]': 'visible()',
    '[style.transition-delay.ms]': 'delay()',
  },
})
export class RevealDirective {
  readonly delay = input(0, { alias: 'nxRevealDelay' });

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  protected readonly visible = signal(false);

  constructor() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.visible.set(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.visible.set(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -80px 0px', threshold: 0.1 },
    );
    observer.observe(this.elementRef.nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
