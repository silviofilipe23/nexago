import { Injectable } from '@angular/core';
import gsap from 'gsap';

import { prefersReducedMotion } from '../landing/animations/gsap-setup';
import {
  MOTION_DURATION,
  MOTION_GSAP_EASE,
  MOTION_PRESETS,
  motionDurationSec,
} from './motion.tokens';

type DurationKey = keyof typeof MOTION_DURATION;

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
}
