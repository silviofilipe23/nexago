import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  APP_STORE_URL,
  GOOGLE_PLAY_COMING_SOON,
  GOOGLE_PLAY_URL,
  isGooglePlayAvailable,
} from '../../../../lib/store-links';
import { ToastService } from '../../../shared/ui/toast';

gsap.registerPlugin(ScrollTrigger);

/** Distância de scroll (px) durante a qual o hero fica pinado. Compartilhada com o header
 *  (mesmo papel do `HERO_SCROLL_LENGTH` exportado pelo site Next.js). */
export const HERO_SCROLL_LENGTH = 2000;

/**
 * Porta de `CinematicHero` (site Next.js, `components/ui/cinematic-hero.tsx`) — a cena de
 * scroll cinemática do hero: GSAP + ScrollTrigger pinam o container e tocam uma timeline
 * (headline -> card premium -> mockup de iPhone -> CTA de download) conforme o usuário rola.
 *
 * Diferenças em relação ao source:
 * - Sem o guard `typeof window !== 'undefined'` (Next.js SSR) nem o hack `html.js .gsap-reveal`
 *   (visibilidade via classe pré-paint) — este app é CSR-only, então o conteúdo sempre renderiza
 *   e o GSAP anima por cima assim que o componente é montado (`afterNextRender`).
 * - `cardDescription` (que no source é `ReactNode`, com um `<span>` em negrito por padrão) virou
 *   markup fixo no template em vez de `input()`, já que o único call-site (`page.tsx`) nunca
 *   sobrescreve esse prop e Angular não tem um equivalente direto e simples pra "nó React" — os
 *   demais textos (título, tagline, CTA) continuam como `input()` normalmente.
 * - As classes `main-card`/`mockup-scroll-wrapper`/`card-left-text`/etc. permanecem no template
 *   como seletores puros porque o GSAP as consulta via `gsap.context()` escopado à raiz do host
 *   (ver `setupScrollTimeline`) — não precisam de `#template-ref` a não ser onde há acesso
 *   imperativo direto ao nó (`mainCard`/`mockup`, usados também no parallax do mouse).
 */
@Component({
  selector: 'app-cinematic-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative w-screen h-screen overflow-hidden flex items-center justify-center bg-background text-foreground font-sans antialiased',
    style: 'perspective: 1500px',
  },
  templateUrl: './cinematic-hero.html',
  styleUrl: './cinematic-hero.scss',
})
export class CinematicHero {
  readonly brandName = input('nexaGO');
  readonly tagline1 = input('Domine a areia,');
  readonly tagline2 = input('do saque ao título.');
  readonly cardHeading = input('Seu ranking, vivo a cada jogo.');
  readonly metricValue = input(1280);
  readonly metricLabel = input('Pontos · Ranking');
  readonly ctaHeading = input('Ecossistema nexaGO.');
  readonly ctaDescription = input(
    'Encontre arenas, inscreva-se em torneios, acompanhe as chaves ao vivo e suba no ranking. Baixe o app e comece sua temporada na areia.',
  );

  protected readonly brandHasGoSuffix = computed(() => this.brandName().endsWith('GO'));
  protected readonly brandPrefix = computed(() =>
    this.brandHasGoSuffix() ? this.brandName().slice(0, -2) : this.brandName(),
  );

  protected readonly appStoreUrl = APP_STORE_URL;
  protected readonly googlePlayUrl = GOOGLE_PLAY_URL;
  protected readonly playReady = isGooglePlayAvailable();

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);

  private readonly mainCard = viewChild.required<ElementRef<HTMLDivElement>>('mainCard');
  private readonly mockup = viewChild.required<ElementRef<HTMLDivElement>>('mockup');

  constructor() {
    afterNextRender(() => {
      this.setupMouseParallax();
      this.setupScrollTimeline();
    });
  }

  protected onGooglePlayClick(event: MouseEvent): void {
    if (this.playReady) return;
    event.preventDefault();
    this.toastService.show(GOOGLE_PLAY_COMING_SOON);
  }

  /** Interação do mouse de alta performance (requestAnimationFrame), fora do ciclo de change
   *  detection do Angular — mesma técnica do source (`window.addEventListener` + rAF), não um
   *  host listener declarativo, porque roda a cada movimento do mouse na página inteira. */
  private setupMouseParallax(): void {
    const mainCardEl = this.mainCard().nativeElement;
    const mockupEl = this.mockup().nativeElement;
    let rafId = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const rect = mainCardEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        mainCardEl.style.setProperty('--mouse-x', `${mouseX}px`);
        mainCardEl.style.setProperty('--mouse-y', `${mouseY}px`);

        const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
        const yVal = (e.clientY / window.innerHeight - 0.5) * 2;

        gsap.to(mockupEl, {
          rotationY: xVal * 12,
          rotationX: -yVal * 12,
          ease: 'power3.out',
          duration: 1.2,
        });
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    });
  }

  /** Timeline cinematográfica de scroll (pin + scrub). Idêntica ao source, exceto pelo trigger
   *  (`this.hostRef.nativeElement` em vez do `containerRef` do React — aqui o host do próprio
   *  componente É o container, via `host: {}` acima) e o cleanup via `DestroyRef` no lugar do
   *  retorno do `useEffect`. */
  private setupScrollTimeline(): void {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const isMobile = window.innerWidth < 768;
    const metricValue = this.metricValue();

    const ctx = gsap.context(() => {
      gsap.set('.main-card', { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set(
        ['.card-left-text', '.card-right-text', '.mockup-scroll-wrapper', '.floating-badge', '.phone-widget'],
        { autoAlpha: 0 },
      );
      gsap.set('.cta-wrapper', { autoAlpha: 0, scale: 0.8, filter: 'blur(30px)' });

      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: this.hostRef.nativeElement,
          start: 'top top',
          end: `+=${HERO_SCROLL_LENGTH}`,
          pin: true,
          scrub: 1,
          anticipatePin: 1,
        },
      });

      scrollTl
        .to(['.hero-text-wrapper', '.bg-grid-theme'], { scale: 1.15, filter: 'blur(20px)', opacity: 0.2, ease: 'power2.inOut', duration: 2 }, 0)
        .to('.main-card', { y: 0, ease: 'power3.inOut', duration: 2 }, 0)
        .to('.main-card', { width: '100%', height: '100%', borderRadius: '0px', ease: 'power3.inOut', duration: 1.5 })
        .fromTo(
          '.mockup-scroll-wrapper',
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: 'expo.out', duration: 2.5 },
          '-=0.8',
        )
        .fromTo('.phone-widget', { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: 'back.out(1.2)', duration: 1.5 }, '-=1.5')
        .to('.progress-ring', { strokeDashoffset: 60, duration: 2, ease: 'power3.inOut' }, '-=1.2')
        .to('.counter-val', { innerHTML: metricValue, snap: { innerHTML: 1 }, duration: 2, ease: 'expo.out' }, '-=2.0')
        .fromTo('.floating-badge', { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: 'back.out(1.5)', duration: 1.5, stagger: 0.2 }, '-=2.0')
        .fromTo('.card-left-text', { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: 'power4.out', duration: 1.5 }, '-=1.5')
        .fromTo('.card-right-text', { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: 'expo.out', duration: 1.5 }, '<')
        .to({}, { duration: 1 })
        .set('.hero-text-wrapper', { autoAlpha: 0 })
        .set('.cta-wrapper', { autoAlpha: 1 })
        .to({}, { duration: 0.3 })
        .to(['.mockup-scroll-wrapper', '.floating-badge', '.card-left-text', '.card-right-text'], {
          scale: 0.9,
          y: -40,
          z: -200,
          autoAlpha: 0,
          ease: 'power3.in',
          duration: 0.9,
          stagger: 0.04,
        })
        // Card some junto com o conteúdo — evita shell vazio prolongado.
        .to(
          '.main-card',
          {
            width: isMobile ? '92vw' : '85vw',
            height: isMobile ? '92vh' : '85vh',
            borderRadius: isMobile ? '32px' : '40px',
            ease: 'expo.inOut',
            duration: 1.0,
          },
          '-=0.55',
        )
        .to('.cta-wrapper', { scale: 1, filter: 'blur(0px)', ease: 'expo.inOut', duration: 1.0 }, '<')
        .to('.main-card', { y: -window.innerHeight - 300, ease: 'power3.in', duration: 0.85 }, '-=0.35');
    }, this.hostRef.nativeElement);

    this.destroyRef.onDestroy(() => ctx.revert());
  }
}
