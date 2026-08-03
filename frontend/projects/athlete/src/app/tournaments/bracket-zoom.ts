/** Matemática do zoom da árvore de chave (aba "Chaves").
 *
 *  O canvas é escalado via `transform: scale` dentro de um wrapper que rola nos dois eixos;
 *  ampliar/reduzir precisa reposicionar o scroll para que o ponto do conteúdo sob a âncora
 *  (ponto médio da pinça, cursor do ctrl+scroll ou centro do viewport nos botões) fique parado.
 *  Puro e sem DOM de propósito — o componente só aplica o resultado no elemento.
 */

export const BRACKET_ZOOM_MIN = 0.5;
export const BRACKET_ZOOM_MAX = 2;
/** Passo dos botões −/＋ (multiplicativo, para subir e descer pela mesma escada). */
export const BRACKET_ZOOM_STEP = 1.25;

export interface BracketZoomState {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
}

export function clampZoom(zoom: number): number {
  return Math.min(BRACKET_ZOOM_MAX, Math.max(BRACKET_ZOOM_MIN, zoom));
}

/** Próximo estado de zoom mantendo o ponto do conteúdo sob a âncora (coordenadas relativas ao
 *  viewport do scroller) no mesmo lugar da tela. Scroll nunca fica negativo — espelha o clamp
 *  que o navegador faria, para o estado devolvido ser o estado real. */
export function zoomAt(current: BracketZoomState, targetZoom: number, anchorX: number, anchorY: number): BracketZoomState {
  const zoom = clampZoom(targetZoom);
  const factor = zoom / current.zoom;
  if (factor === 1) return current;
  return {
    zoom,
    scrollLeft: Math.max(0, (current.scrollLeft + anchorX) * factor - anchorX),
    scrollTop: Math.max(0, (current.scrollTop + anchorY) * factor - anchorY),
  };
}
