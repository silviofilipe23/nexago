/** Limites alinhados ao `InteractiveViewer` do app (min ~0.35 / max 2.5),
 *  um pouco mais conservadores no desktop do painel — abaixo de 50% a tipografia
 *  do card some, acima de 200% o pan vira rolagem longa demais. */
export const BRACKET_ZOOM_MIN = 0.5;
export const BRACKET_ZOOM_MAX = 2;
export const BRACKET_ZOOM_STEP = 0.1;
export const BRACKET_ZOOM_DEFAULT = 1;

export function clampBracketZoom(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.min(BRACKET_ZOOM_MAX, Math.max(BRACKET_ZOOM_MIN, rounded));
}

/** Próximo passo de zoom pelos botões ± (passo fixo). */
export function stepBracketZoom(current: number, direction: 1 | -1): number {
  return clampBracketZoom(current + direction * BRACKET_ZOOM_STEP);
}

/** Zoom pelo scroll: fator relativo (roda pra cima aumenta). */
export function wheelBracketZoom(current: number, deltaY: number): number {
  const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
  return clampBracketZoom(current * factor);
}

/**
 * Mantém o ponto sob o cursor (em coords do conteúdo) depois de mudar a escala.
 * `offsetX/Y` = posição do cursor relativa ao viewport; `scroll*` = scroll atual.
 */
export function scrollAfterBracketZoom(args: {
  prevZoom: number;
  nextZoom: number;
  scrollLeft: number;
  scrollTop: number;
  offsetX: number;
  offsetY: number;
}): { scrollLeft: number; scrollTop: number } {
  const prev = args.prevZoom > 0 ? args.prevZoom : 1;
  const contentX = (args.scrollLeft + args.offsetX) / prev;
  const contentY = (args.scrollTop + args.offsetY) / prev;
  return {
    scrollLeft: contentX * args.nextZoom - args.offsetX,
    scrollTop: contentY * args.nextZoom - args.offsetY,
  };
}
