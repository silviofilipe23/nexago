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
import { RouterLink } from '@angular/router';
import { animate, style, transition, trigger } from '@angular/animations';

import { MotionService } from '../motion/motion.service';
import {
  registerGsapPlugins,
  prefersReducedMotion as motionReduced,
} from './animations/gsap-setup';
import { MOCK_ARENAS } from './data/arenas.mock';
import { APP_LINKS } from './data/links';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [RouterLink],
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
  private readonly motion = inject(MotionService);

  readonly links = APP_LINKS;
  readonly previewArenas = MOCK_ARENAS.slice(0, 4);

  readonly showAccentOrb = signal(false);
  readonly orbMotionOff = signal(false);

  private readonly heroSection = viewChild.required<ElementRef<HTMLElement>>('heroSection');
  private readonly heroUrgency = viewChild<ElementRef<HTMLElement>>('heroUrgency');
  private readonly heroKicker = viewChild<ElementRef<HTMLElement>>('heroKicker');
  private readonly heroTitle = viewChild.required<ElementRef<HTMLElement>>('heroTitle');
  private readonly heroSub = viewChild.required<ElementRef<HTMLElement>>('heroSub');
  private readonly heroCtas = viewChild.required<ElementRef<HTMLElement>>('heroCtas');
  private readonly heroPreview = viewChild<ElementRef<HTMLElement>>('heroPreview');
  private readonly heroOrbBlue = viewChild<ElementRef<HTMLElement>>('heroOrbBlue');
  private readonly heroOrbViolet = viewChild<ElementRef<HTMLElement>>('heroOrbViolet');

  constructor() {
    afterNextRender(() => {
      this.orbMotionOff.set(motionReduced());
      this.showAccentOrb.set(true);
      registerGsapPlugins();
      requestAnimationFrame(() => this.setupHeroMotion());
    });
  }

  /**
   * GSAP: sequência centralizada em MotionService.attachLandingHeroAnimations.
   * data-hero-parallax: camadas com loop; orbs: scrub no scroll.
   */
  private setupHeroMotion(): void {
    const root = this.heroSection().nativeElement;
    const parallaxLayers = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-parallax]'));
    const metricItems = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-metric]'));
    const trustLine = root.querySelector<HTMLElement>('[data-hero-trust]');

    const revert = this.motion.attachLandingHeroAnimations({
      root,
      urgency: this.heroUrgency()?.nativeElement,
      kicker: this.heroKicker()?.nativeElement,
      headline: this.heroTitle().nativeElement,
      subline: this.heroSub().nativeElement,
      metricItems,
      trustLine,
      ctaRow: this.heroCtas().nativeElement,
      visual: this.heroPreview()?.nativeElement ?? undefined,
      parallaxLayers,
      blueOrb: this.heroOrbBlue()?.nativeElement,
      violetOrb: this.heroOrbViolet()?.nativeElement,
    });

    this.destroyRef.onDestroy(() => revert());
  }
}
