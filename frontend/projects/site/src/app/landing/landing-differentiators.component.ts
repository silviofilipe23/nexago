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

import { registerGsapPlugins, prefersReducedMotion, scheduleScrollTriggerRefresh } from './animations/gsap-setup';

@Component({
  selector: 'app-landing-differentiators',
  standalone: true,
  templateUrl: './landing-differentiators.component.html',
  styleUrl: './landing-differentiators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingDifferentiatorsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly sectionRef = viewChild.required<ElementRef<HTMLElement>>('diffSection');
  private readonly cardRefs = viewChildren<ElementRef<HTMLElement>>('diffCard');

  constructor() {
    afterNextRender(() => {
      registerGsapPlugins();
      const section = this.sectionRef().nativeElement;
      const els = this.cardRefs().map((r) => r.nativeElement);
      if (els.length === 0) {
        return;
      }
      if (prefersReducedMotion()) {
        gsap.set(els, { opacity: 1, y: 0 });
        return;
      }
      const glowCleanups: Array<() => void> = [];
      for (const el of els) {
        const onMove = (e: PointerEvent): void => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--diff-glow-x', `${e.clientX - r.left}px`);
          el.style.setProperty('--diff-glow-y', `${e.clientY - r.top}px`);
        };
        const onLeave = (): void => {
          el.style.removeProperty('--diff-glow-x');
          el.style.removeProperty('--diff-glow-y');
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
          y: 48,
          opacity: 0,
          duration: 0.55,
          stagger: {
            each: 0.12,
            from: 'start',
          },
          ease: 'power3.out',
          immediateRender: false,
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
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
