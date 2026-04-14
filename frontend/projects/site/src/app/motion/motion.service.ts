import { Injectable } from '@angular/core';
import gsap from 'gsap';

import {
  prefersReducedMotion,
  registerGsapPlugins,
  scheduleScrollTriggerRefresh,
} from '../landing/animations/gsap-setup';
import {
  MOTION_DURATION,
  MOTION_GSAP_EASE,
  MOTION_PRESETS,
  motionDurationSec,
} from './motion.tokens';

type DurationKey = keyof typeof MOTION_DURATION;

/** Refs da seção de apoiadores na landing (query no host). */
export interface LandingSupportersMotionRefs {
  root: HTMLElement;
  header: HTMLElement;
  tierLabels: HTMLElement[];
  logos: HTMLElement[];
  ctaBand: HTMLElement | null;
}

/** Refs para animação da landing hero — preencher só o que existir no DOM. */
export interface LandingHeroMotionRefs {
  root: HTMLElement;
  urgency?: HTMLElement | null;
  kicker?: HTMLElement | null;
  headline: HTMLElement;
  subline: HTMLElement;
  ctaRow: HTMLElement;
  /** Nós com `data-hero-metric` (faixa tipo Yango — stagger). */
  metricItems?: HTMLElement[];
  trustLine?: HTMLElement | null;
  visual?: HTMLElement | null;
  scrollVideo?: HTMLVideoElement | null;
  /** Camadas leves com loop (parallax suave). */
  parallaxLayers?: HTMLElement[];
  blueOrb?: HTMLElement | null;
  violetOrb?: HTMLElement | null;
}

@Injectable({ providedIn: 'root' })
export class MotionService {
  /** Fade + slide vertical (listas, blocos). */
  fadeSlideIn(
    el: HTMLElement,
    opts?: { duration?: DurationKey; delay?: number },
  ): gsap.core.Tween | void {
    if (!el) {
      return;
    }
    if (prefersReducedMotion()) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    const { from, to } = MOTION_PRESETS.fadeSlide;
    const d = opts?.duration ?? 'normal';
    return gsap.fromTo(el, from, {
      ...to,
      duration: motionDurationSec(d),
      ease: MOTION_GSAP_EASE,
      delay: opts?.delay ?? 0,
    });
  }

  /** Scale + fade (modais, dropdowns). */
  scaleIn(
    el: HTMLElement,
    opts?: { duration?: DurationKey; delay?: number },
  ): gsap.core.Tween | void {
    if (!el) {
      return;
    }
    if (prefersReducedMotion()) {
      gsap.set(el, { scale: 1, opacity: 1 });
      return;
    }
    const { from, to } = MOTION_PRESETS.scaleIn;
    const d = opts?.duration ?? 'normal';
    return gsap.fromTo(el, from, {
      ...to,
      duration: motionDurationSec(d),
      ease: MOTION_GSAP_EASE,
      delay: opts?.delay ?? 0,
    });
  }

  /** Lista: fade + slide com stagger (hierarquia “conteúdo”). */
  staggerFadeSlide(
    elements: HTMLElement[],
    opts?: { stagger?: number; duration?: DurationKey },
  ): gsap.core.Tween | void {
    if (elements.length === 0) {
      return;
    }
    if (prefersReducedMotion()) {
      gsap.set(elements, { opacity: 1, y: 0 });
      return;
    }
    const d = opts?.duration ?? 'normal';
    return gsap.from(elements, {
      opacity: 0,
      y: 20,
      duration: motionDurationSec(d),
      ease: MOTION_GSAP_EASE,
      stagger: opts?.stagger ?? 0.08,
    });
  }

  /**
   * Sequência premium da landing hero: entrada hierárquica + parallax nos orbs.
   * Retorna `revert` para `onDestroy` (limpa ScrollTriggers).
   */
  attachLandingHeroAnimations(refs: LandingHeroMotionRefs): () => void {
    registerGsapPlugins();

    const createVideoScrollScrub = (): (() => void) => {
      if (!refs.scrollVideo) {
        return () => {};
      }

      const video = refs.scrollVideo;
      const desktopQuery = globalThis.matchMedia?.('(min-width: 768px)');
      if (desktopQuery && !desktopQuery.matches) {
        return () => {};
      }

      video.muted = true;
      video.defaultMuted = true;
      video.controls = false;
      video.playsInline = true;
      video.preload = 'auto';

      const getDuration = (): number => {
        const d = video.duration;
        return Number.isFinite(d) && d > 0 ? d : 1;
      };

      const canSeek = (): boolean => {
        if (video.readyState < 1) {
          return false;
        }
        if (video.seekable.length === 0) {
          return false;
        }
        return true;
      };

      const syncTime = (progress: number): void => {
        if (!canSeek()) {
          return;
        }
        const target = getDuration() * progress;
        if (!Number.isFinite(target)) {
          return;
        }
        const maxTime = Math.max(0, getDuration() - 0.001);
        const clampedTarget = Math.min(Math.max(0, target), maxTime);
        if (Math.abs(video.currentTime - clampedTarget) > 0.016) {
          try {
            video.currentTime = clampedTarget;
          } catch {
            // Alguns browsers podem negar seek antes do buffer inicial; tentaremos no próximo update.
          }
        }
      };

      let tween: gsap.core.Tween | null = null;

      const createScrubTween = (): void => {
        if (tween) {
          return;
        }
        const d = video.duration;
        if (!Number.isFinite(d) || d <= 0) {
          return;
        }
        const scrubState = { progress: 0 };
        tween = gsap.to(scrubState, {
          progress: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: refs.root,
            start: 'top top',
            end: () => {
              const distanceByDuration = getDuration() * 1100;
              const viewportHeight =
                typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 900;
              const minDistance = viewportHeight * 3.2;
              return `+=${Math.max(minDistance, distanceByDuration)}`;
            },
            pin: true,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              scrubState.progress = self.progress;
              syncTime(self.progress);
            },
          },
        });
        scheduleScrollTriggerRefresh();
      };

      const onMetaLoaded = (): void => {
        try {
          video.currentTime = 0;
        } catch {
          // noop
        }
        createScrubTween();
      };

      const onVideoError = (): void => {
        // Sem metadados válidos => não cria pin/scrub para não esticar o hero.
        tween?.scrollTrigger?.kill();
        tween?.kill();
        tween = null;
      };

      video.addEventListener('loadedmetadata', onMetaLoaded);
      video.addEventListener('error', onVideoError);
      video.load();

      // Garante “prime” em navegadores mobile sem reproduzir áudio.
      const primePromise = video.play();
      if (primePromise && typeof primePromise.then === 'function') {
        void primePromise.then(() => video.pause()).catch(() => {});
      }

      if (video.readyState >= 1) {
        createScrubTween();
      }

      return () => {
        video.removeEventListener('loadedmetadata', onMetaLoaded);
        video.removeEventListener('error', onVideoError);
        tween?.scrollTrigger?.kill();
        tween?.kill();
        tween = null;
      };
    };

    const cleanupVideoScrub = createVideoScrollScrub();

    const revealAll = (): void => {
      const nodes = [
        refs.urgency,
        refs.kicker,
        refs.headline,
        refs.subline,
        ...(refs.metricItems ?? []),
        refs.trustLine,
        refs.ctaRow,
        refs.visual,
      ].filter((n): n is HTMLElement => !!n);
      gsap.set(nodes, { opacity: 1, y: 0, scale: 1, clearProps: 'transform' });
    };

    if (prefersReducedMotion()) {
      revealAll();
      return () => {
        cleanupVideoScrub();
      };
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: MOTION_GSAP_EASE } });

      if (refs.urgency) {
        tl.from(refs.urgency, { opacity: 0, y: 12, duration: motionDurationSec('normal') }, 0);
      }
      if (refs.kicker) {
        tl.from(refs.kicker, { opacity: 0, y: 12, duration: motionDurationSec('normal') }, 0.06);
      }

      tl.from(refs.headline, { opacity: 0, y: 40, duration: motionDurationSec('slow') }, 0.14);
      tl.from(refs.subline, { opacity: 0, y: 26, duration: motionDurationSec('normal') }, '-=0.22');

      if (refs.metricItems && refs.metricItems.length > 0) {
        tl.from(
          refs.metricItems,
          {
            opacity: 0,
            y: 22,
            duration: motionDurationSec('normal'),
            stagger: 0.09,
            ease: MOTION_GSAP_EASE,
          },
          '-=0.12',
        );
      }

      if (refs.trustLine) {
        tl.from(
          refs.trustLine,
          { opacity: 0, y: 14, duration: motionDurationSec('fast') },
          refs.metricItems?.length ? '-=0.06' : '-=0.14',
        );
      }

      const { from, to } = MOTION_PRESETS.scaleIn;
      tl.fromTo(
        refs.ctaRow,
        from,
        { ...to, duration: motionDurationSec('normal') },
        '-=0.12',
      );

      if (refs.visual) {
        tl.from(refs.visual, { opacity: 0, y: 36, duration: motionDurationSec('slow') }, '-=0.24');
      }

      if (refs.parallaxLayers?.length) {
        refs.parallaxLayers.forEach((layer, i) => {
          gsap.to(layer, {
            y: i % 2 === 0 ? -10 : 8,
            duration: 7 + i * 0.8,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
        });
      }

      if (refs.blueOrb) {
        gsap.to(refs.blueOrb, {
          y: -52,
          ease: 'none',
          scrollTrigger: {
            trigger: refs.root,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.15,
          },
        });
      }
      if (refs.violetOrb) {
        gsap.to(refs.violetOrb, {
          y: 44,
          ease: 'none',
          scrollTrigger: {
            trigger: refs.root,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.95,
          },
        });
      }
    }, refs.root);

    scheduleScrollTriggerRefresh();
    return () => {
      cleanupVideoScrub();
      ctx.revert();
    };
  }

  /**
   * Landing — seção Apoiadores / Parceiros: entrada com ScrollTrigger + timeline.
   *
   * Ideias extras (não aplicadas aqui; descomente/adapte se quiser refinar):
   *
   * // 1) Split por tier: um timeline por `.lsu-tier` com `stagger` apenas nos filhos,
   * //    para a cascata acompanhar visualmente cada bloco (mais trabalho de query).
   *
   * // 2) ScrollTrigger com `scrub: true` no header para parallax leve:
   * //    gsap.to(header, { y: -24, ease: 'none', scrollTrigger: { trigger: root, scrub: 1 } });
   *
   * // 3) `gsap.utils.toArray` + `batch()` do ScrollTrigger para lazy reveal por viewport.
   *
   * // 4) Micro-bounce nos logos: `ease: 'back.out(1.2)'` no `from` final (usar com moderação).
   */
  attachLandingSupportersAnimations(refs: LandingSupportersMotionRefs): () => void {
    registerGsapPlugins();

    const revealAll = (): void => {
      const nodes = [refs.header, ...refs.tierLabels, ...refs.logos, refs.ctaBand].filter(
        (n): n is HTMLElement => !!n,
      );
      gsap.set(nodes, { opacity: 1, y: 0, scale: 1, clearProps: 'transform' });
    };

    if (prefersReducedMotion()) {
      revealAll();
      return () => {};
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: MOTION_GSAP_EASE },
        scrollTrigger: {
          trigger: refs.root,
          start: 'top 78%',
          toggleActions: 'play none none none',
        },
      });

      tl.from(refs.header, {
        opacity: 0,
        y: 28,
        duration: motionDurationSec('slow'),
      });

      if (refs.tierLabels.length > 0) {
        tl.from(
          refs.tierLabels,
          {
            opacity: 0,
            y: 14,
            duration: motionDurationSec('normal'),
            stagger: 0.07,
          },
          '-=0.32',
        );
      }

      tl.from(
        refs.logos,
        {
          opacity: 0,
          y: 22,
          scale: 0.94,
          duration: motionDurationSec('normal'),
          stagger: { each: 0.055, from: 'start' },
        },
        '-=0.18',
      );

      if (refs.ctaBand) {
        tl.from(
          refs.ctaBand,
          { opacity: 0, y: 18, duration: motionDurationSec('normal') },
          '-=0.28',
        );
      }
    }, refs.root);

    scheduleScrollTriggerRefresh();
    return () => ctx.revert();
  }
}
