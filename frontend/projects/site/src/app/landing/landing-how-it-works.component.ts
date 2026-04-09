import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
  viewChildren,
} from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import {
  registerGsapPlugins,
  prefersReducedMotion,
  scheduleScrollTriggerRefresh,
} from './animations/gsap-setup';

@Component({
  selector: 'app-landing-how-it-works',
  standalone: true,
  templateUrl: './landing-how-it-works.component.html',
  styleUrl: './landing-how-it-works.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingHowItWorksComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly sectionRef = viewChild.required<ElementRef<HTMLElement>>('howSection');
  private readonly stepRefs = viewChildren<ElementRef<HTMLElement>>('step');

  constructor() {
    afterNextRender(() => {
      registerGsapPlugins();
      const section = this.sectionRef().nativeElement;
      const refs = this.stepRefs();
      if (refs.length === 0) {
        return;
      }
      const els = refs.map((r) => r.nativeElement);
      if (prefersReducedMotion()) {
        gsap.set(els, { opacity: 1, y: 0 });
        return;
      }

      const glowCleanups: Array<() => void> = [];
      for (const el of els) {
        const onMove = (e: PointerEvent): void => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--how-glow-x', `${e.clientX - r.left}px`);
          el.style.setProperty('--how-glow-y', `${e.clientY - r.top}px`);
        };
        const onLeave = (): void => {
          el.style.removeProperty('--how-glow-x');
          el.style.removeProperty('--how-glow-y');
        };
        el.addEventListener('pointermove', onMove, { passive: true });
        el.addEventListener('pointerleave', onLeave);
        glowCleanups.push(() => {
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerleave', onLeave);
        });
      }

      const ctx = gsap.context(() => {
        gsap.from(els, {
          y: 44,
          opacity: 0,
          duration: 0.58,
          ease: 'power3.out',
          immediateRender: false,
          stagger: {
            each: 0.12,
            from: 'start',
          },
          scrollTrigger: {
            trigger: section,
            start: 'top 78%',
            toggleActions: 'play none none none',
          },
        });

        for (const el of els) {
          ScrollTrigger.create({
            trigger: el,
            start: 'top 58%',
            end: 'bottom 42%',
            onToggle: ({ isActive }) => {
              el.classList.toggle('how-step-card--active', isActive);
            },
          });
        }
      }, section);

      this.destroyRef.onDestroy(() => {
        for (const d of glowCleanups) {
          d();
        }
        ctx.revert();
      });
      scheduleScrollTriggerRefresh();
    });
  }
}
