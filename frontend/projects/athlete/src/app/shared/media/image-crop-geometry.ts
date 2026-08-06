/**
 * Geometria do recorte de imagem — pura, sem DOM, para o
 * `NxImageCropperComponent` poder ser testado sem renderizar nada.
 *
 * Convenção: `offset` é o deslocamento do CENTRO da foto em relação ao CENTRO
 * da moldura, em px de tela. (0, 0) = foto centralizada.
 */

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CropRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * Menor escala que ainda cobre a moldura inteira — o "cover" do CSS. É o piso
 * do zoom: abaixo dela sobraria buraco preto dentro do recorte.
 * Devolve 0 quando algum lado ainda não foi medido.
 */
export function coverScale(natural: Size, frame: Size): number {
  if (natural.w <= 0 || natural.h <= 0 || frame.w <= 0 || frame.h <= 0) {
    return 0;
  }
  return Math.max(frame.w / natural.w, frame.h / natural.h);
}

/**
 * Prende o deslocamento às bordas da foto: nenhuma borda pode entrar na
 * moldura. Quando a foto é menor que a moldura num eixo, o único valor válido
 * naquele eixo é 0 (centralizado).
 */
export function clampOffset(offset: Point, display: Size, frame: Size): Point {
  const maxX = Math.max(0, (display.w - frame.w) / 2);
  const maxY = Math.max(0, (display.h - frame.h) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/**
 * Novo deslocamento depois de multiplicar a escala por `ratio`, mantendo fixo
 * o ponto da foto que está sob `anchor` (offset a partir do centro da
 * moldura). Com `anchor` no centro (0,0) vira uma simples multiplicação.
 *
 * Ainda NÃO está preso às bordas — passe por `clampOffset` depois.
 */
export function zoomAnchoredOffset(offset: Point, anchor: Point, ratio: number): Point {
  return {
    x: anchor.x - (anchor.x - offset.x) * ratio,
    y: anchor.y - (anchor.y - offset.y) * ratio,
  };
}

/**
 * A moldura convertida para o espaço de pixels da foto original — é o
 * `sx, sy, sw, sh` do `drawImage`.
 */
export function cropRect(natural: Size, frame: Size, offset: Point, scale: number): CropRect {
  const sw = frame.w / scale;
  const sh = frame.h / scale;
  return {
    sx: natural.w / 2 - offset.x / scale - sw / 2,
    sy: natural.h / 2 - offset.y / scale - sh / 2,
    sw,
    sh,
  };
}

/**
 * Tamanho do JPEG exportado. Nunca amplia: o teto é o menor entre o pedido e a
 * largura real do recorte, senão uma foto pequena sairia borrada e mais pesada.
 */
export function outputSize(cropWidth: number, aspectRatio: number, maxOutputWidth: number): Size {
  const w = Math.max(1, Math.round(Math.min(maxOutputWidth, cropWidth)));
  return { w, h: Math.max(1, Math.round(w / aspectRatio)) };
}
