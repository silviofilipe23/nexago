import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import gsap from 'gsap';

import { registerGsapPlugins, prefersReducedMotion, scheduleScrollTriggerRefresh } from './animations/gsap-setup';
import { APP_LINKS } from './data/links';

@Component({
  selector: 'app-landing-final-cta',
  standalone: true,
  templateUrl: './landing-final-cta.component.html',
  styleUrls: ['./landing-final-cta.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFinalCtaComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly links = APP_LINKS;
  private readonly wrapRef = viewChild.required<ElementRef<HTMLElement>>('ctaWrap');

  constructor() {
    afterNextRender(() => {
      registerGsapPlugins();
      const wrap = this.wrapRef().nativeElement;
      if (prefersReducedMotion()) {
        gsap.set(wrap, { opacity: 1, scale: 1 });
        return;
      }
      const ctx = gsap.context(() => {
        gsap.from(wrap, {
          opacity: 0,
          y: 40,
          scale: 0.98,
          duration: 0.7,
          ease: 'power3.out',
          immediateRender: false,
          scrollTrigger: {
            trigger: wrap,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        });
      }, wrap);
      this.destroyRef.onDestroy(() => ctx.revert());
      scheduleScrollTriggerRefresh();
    });
  }
}
