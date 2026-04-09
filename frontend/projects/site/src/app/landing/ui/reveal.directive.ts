import {
  Directive,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  Renderer2,
} from '@angular/core';

import { prefersReducedMotion } from '../animations/gsap-setup';

@Directive({
  selector: '[appReveal]',
  standalone: true,
})
export class RevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const native = this.el.nativeElement;
    if (prefersReducedMotion()) {
      this.renderer.addClass(native, 'reveal-visible');
      return;
    }
    this.renderer.addClass(native, 'reveal-hidden');
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            this.renderer.removeClass(native, 'reveal-hidden');
            this.renderer.addClass(native, 'reveal-visible');
            this.observer?.disconnect();
            this.observer = undefined;
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -5% 0px' },
    );
    this.observer.observe(native);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
