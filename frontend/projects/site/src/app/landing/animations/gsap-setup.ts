import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let pluginsRegistered = false;

export function registerGsapPlugins(): void {
  if (pluginsRegistered) {
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  pluginsRegistered = true;
}

/** Após lazy route / fontes / layout, recalcula posições dos triggers. */
export function scheduleScrollTriggerRefresh(): void {
  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });
}

export function prefersReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== 'function') {
    return false;
  }
  return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
