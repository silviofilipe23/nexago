/**
 * NexaGO Motion System — durações e curvas alinhadas entre CSS (tokens em `styles.scss`) e GSAP.
 */

export const MOTION_DURATION = {
  fast: 120,
  normal: 220,
  slow: 350,
  page: 450,
} as const;

export const MOTION_EASING = {
  /** Principal — feel tipo Airbnb / Apple */
  smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  soft: 'ease-out',
  sharp: 'ease-in-out',
} as const;

/**
 * Curva GSAP próxima a MOTION_EASING.smooth sem CustomEase.
 * @see https://gsap.com/docs/v3/Eases
 */
export const MOTION_GSAP_EASE = 'power3.out' as const;

export function motionDurationSec(key: keyof typeof MOTION_DURATION): number {
  return MOTION_DURATION[key] / 1000;
}

/** Presets semânticos para GSAP / documentação. */
export const MOTION_PRESETS = {
  fadeSlide: {
    from: { opacity: 0, y: 20 },
    to: { opacity: 1, y: 0 },
  },
  scaleIn: {
    from: { scale: 0.96, opacity: 0 },
    to: { scale: 1, opacity: 1 },
  },
  expand: {
    from: { scale: 0.9 },
    to: { scale: 1 },
  },
} as const;
