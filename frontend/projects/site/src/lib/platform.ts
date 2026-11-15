export type DevicePlatform = 'ios' | 'android' | 'desktop';

/** O mínimo do `navigator` que a detecção lê — separado para o teste não depender do browser. */
export interface PlatformHints {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/**
 * De que loja este aparelho baixa o app. iPadOS se apresenta como "Macintosh" desde o iPadOS 13;
 * o que o separa de um Mac de verdade é ter tela de toque.
 */
export function detectPlatform(hints: PlatformHints = navigator): DevicePlatform {
  const ua = hints.userAgent ?? '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && (hints.maxTouchPoints ?? 0) > 1) return 'ios';
  return 'desktop';
}
