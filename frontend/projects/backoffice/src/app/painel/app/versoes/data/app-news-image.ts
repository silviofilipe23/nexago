import type { ImageSize } from '../../../loja/campanhas/data/campaign-image';

/**
 * Imagem da funcionalidade. No app ela ocupa a largura toda e é cortada pelo centro
 * (`BoxFit.cover`): 180 pt de altura no destaque da lista, até 380 pt no detalhe e a tela quase
 * inteira nos stories. 1170×1140 é o detalhe em 3x; 2x é o mínimo antes de borrar. Bytes e tipo
 * valem pela rule do Storage (`app/news/`) e por `artFileError`; pixels só o backoffice confere.
 */
export const NEWS_ART_WIDTH = 1170;
export const NEWS_ART_HEIGHT = 1140;
export const NEWS_ART_MIN_WIDTH = 780;
export const NEWS_ART_MIN_HEIGHT = 760;
/** Desvio da proporção a partir do qual a tela avisa (não bloqueia: o recorte é pelo centro). */
const RATIO_TOLERANCE = 0.2;

export const NEWS_ART_SPEC = `Recomendado: ${NEWS_ART_WIDTH}×${NEWS_ART_HEIGHT} px · JPG, PNG ou WebP até 5 MB · mínimo ${NEWS_ART_MIN_WIDTH}×${NEWS_ART_MIN_HEIGHT}`;

/** `error` barra o envio (pequena demais: borra no app); `warning` só avisa (o app corta o que sobrar). */
export function newsArtSizeCheck(size: ImageSize): { error: string | null; warning: string | null } {
  const dims = `${size.width}×${size.height} px`;
  if (size.width < NEWS_ART_MIN_WIDTH || size.height < NEWS_ART_MIN_HEIGHT) {
    return {
      error: `A imagem tem ${dims}; o mínimo é ${NEWS_ART_MIN_WIDTH}×${NEWS_ART_MIN_HEIGHT} (recomendado ${NEWS_ART_WIDTH}×${NEWS_ART_HEIGHT}).`,
      warning: null,
    };
  }
  const ratio = size.width / size.height;
  if (Math.abs(ratio / (NEWS_ART_WIDTH / NEWS_ART_HEIGHT) - 1) > RATIO_TOLERANCE) {
    return {
      error: null,
      warning: `A imagem tem ${dims}; a tela da funcionalidade é quase quadrada e o app corta o que sobrar — confira a prévia.`,
    };
  }
  return { error: null, warning: null };
}
