/**
 * Escolha do formato do canvas do telão.
 *
 * O telão é desenhado num canvas lógico de tamanho fixo e escalado para caber
 * na tela. Deitado (1920×1080) num celular em pé, a escala vira 0,195 e o texto
 * de 25px sai com 5px — ilegível, no meio de uma tela quase toda preta. E é
 * justamente no celular que o link público é aberto.
 */

/** Abaixo disso a tela é estreita o bastante para o canvas deitado não servir. */
export const PORTRAIT_MAX_WIDTH = 900;

/**
 * Vira o canvas quando a tela é estreita E mais alta que larga.
 *
 * As duas condições juntas de propósito: um celular DEITADO (812×375) também é
 * estreito pelo primeiro critério, mas ali o 16:9 é exatamente o que se quer.
 */
export function isPortraitViewport(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return width < PORTRAIT_MAX_WIDTH && height > width;
}

export interface DrawCanvasSize {
  width: number;
  height: number;
}

export function drawCanvasFor(portrait: boolean): DrawCanvasSize {
  return portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}
