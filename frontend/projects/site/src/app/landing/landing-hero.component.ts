import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import gsap from 'gsap';

import {
  registerGsapPlugins,
  prefersReducedMotion as motionReduced,
  scheduleScrollTriggerRefresh,
} from './animations/gsap-setup';
import { MOCK_ARENAS } from './data/arenas.mock';
import { APP_LINKS } from './data/links';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  templateUrl: './landing-hero.component.html',
  styleUrl: './landing-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('accentOrb', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.85)' }),
        animate(
          '520ms cubic-bezier(0.22, 1, 0.36, 1)',
          style({ opacity: 1, transform: 'scale(1)' }),
        ),
      ]),
    ]),
  ],
})
export class LandingHeroComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly links = APP_LINKS;
  readonly previewArenas = MOCK_ARENAS.slice(0, 4);

  readonly showAccentOrb = signal(false);
  readonly orbMotionOff = signal(false);

  private readonly heroSection = viewChild.required<ElementRef<HTMLElement>>('heroSection');
  private readonly heroTitle = viewChild.required<ElementRef<HTMLElement>>('heroTitle');
  private readonly heroSub = viewChild.required<ElementRef<HTMLElement>>('heroSub');
  private readonly heroCtas = viewChild.required<ElementRef<HTMLElement>>('heroCtas');
  private readonly heroPills = viewChild<ElementRef<HTMLElement>>('heroPills');
  private readonly heroPreview = viewChild<ElementRef<HTMLElement>>('heroPreview');
  private readonly heroBadge = viewChild<ElementRef<HTMLElement>>('heroBadge');
  private readonly heroOrbBlue = viewChild<ElementRef<HTMLElement>>('heroOrbBlue');
  private readonly heroOrbViolet = viewChild<ElementRef<HTMLElement>>('heroOrbViolet');

  constructor() {
    afterNextRender(() => {
      this.orbMotionOff.set(motionReduced());
      this.showAccentOrb.set(true);
      registerGsapPlugins();
      // Aguarda o *ngIf do orb atualizar o DOM antes do GSAP ler refs.
      requestAnimationFrame(() => this.setupGsap());
    });
  }

  private setupGsap(): void {
    const section = this.heroSection().nativeElement;

    if (motionReduced()) {
      return;
    }

    const title = this.heroTitle().nativeElement;
    const subtxt = this.heroSub().nativeElement;
    const ctas = this.heroCtas().nativeElement;
    const badge = this.heroBadge()?.nativeElement;

    const introTargets: HTMLElement[] = [];
    if (badge) {
      introTargets.push(badge);
    }
    introTargets.push(title, subtxt, ctas);

    const pillsEl = this.heroPills()?.nativeElement;
    const previewEl = this.heroPreview()?.nativeElement;
    const blueOrb = this.heroOrbBlue()?.nativeElement;
    const violetOrb = this.heroOrbViolet()?.nativeElement;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from(introTargets, {
        y: 32,
        opacity: 0,
        duration: 0.58,
        stagger: 0.1,
        ease: 'power3.out',
      });

      const extra: HTMLElement[] = [];
      if (pillsEl) {
        extra.push(pillsEl);
      }
      if (previewEl) {
        extra.push(previewEl);
      }
      if (extra.length > 0) {
        tl.from(
          extra,
          {
            y: 28,
            opacity: 0,
            duration: 0.52,
            stagger: 0.08,
            ease: 'power3.out',
          },
          '-=0.32',
        );
      }

      if (blueOrb) {
        gsap.to(blueOrb, {
          y: -48,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.15,
          },
        });
      }
      if (violetOrb) {
        gsap.to(violetOrb, {
          y: 40,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.95,
          },
        });
      }
    }, section);

    this.destroyRef.onDestroy(() => ctx.revert());
    scheduleScrollTriggerRefresh();
  }
}
