import type { ImageSize } from '../../../loja/campanhas/data/campaign-image';

/**
 * Imagem do card do carrossel. No app ela ocupa 112×132 pt à esquerda do texto e é cortada pelo
 * centro (`BoxFit.cover`); 3x cobre os iPhones e os Android de tela densa, 2x é o mínimo antes de
 * borrar. Pixels só o backoffice confere: a rule do Storage (`app/home-banners/`) só vê bytes e
 * tipo, e a callable `saveHomeBanners` recebe só a URL. Bytes e tipo espelham a rule.
 */
export const ART_WIDTH = 336;
export const ART_HEIGHT = 396;
export const ART_MIN_WIDTH = 224;
export const ART_MIN_HEIGHT = 264;
/** Desvio da proporção a partir do qual a tela avisa (não bloqueia: o recorte é pelo centro). */
const RATIO_TOLERANCE = 0.15;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const ART_SPEC = `Recomendado: ${ART_WIDTH}×${ART_HEIGHT} px · JPG, PNG ou WebP até 5 MB · mínimo ${ART_MIN_WIDTH}×${ART_MIN_HEIGHT}`;

/** O que o arquivo tem de errado para subir, ou `null`. Mesmo limite da rule do Storage. */
export function artFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  return file.size >= IMAGE_MAX_BYTES ? 'A imagem passa de 5 MB.' : null;
}

/**
 * Pixels contra o card. `error` barra o envio (pequena demais: borra no app); `warning` só avisa
 * (proporção longe de 112:132: o app corta o que sobrar).
 */
export function artSizeCheck(size: ImageSize): { error: string | null; warning: string | null } {
  const dims = `${size.width}×${size.height} px`;
  if (size.width < ART_MIN_WIDTH || size.height < ART_MIN_HEIGHT) {
    return {
      error: `A imagem tem ${dims}; o mínimo é ${ART_MIN_WIDTH}×${ART_MIN_HEIGHT} (recomendado ${ART_WIDTH}×${ART_HEIGHT}).`,
      warning: null,
    };
  }
  const ratio = size.width / size.height;
  if (Math.abs(ratio / (ART_WIDTH / ART_HEIGHT) - 1) > RATIO_TOLERANCE) {
    return {
      error: null,
      warning: `A imagem tem ${dims}; o card é em pé (${ART_WIDTH}×${ART_HEIGHT}) e corta o que sobrar — confira a prévia.`,
    };
  }
  return { error: null, warning: null };
}
