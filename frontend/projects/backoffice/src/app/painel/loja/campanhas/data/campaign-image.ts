/**
 * Foto do banner. A vitrine corta pelo centro (`object-fit: cover`): no app o card tem 196px de
 * altura e a largura da tela − 40 (1,7–2:1); no portal a coluna da foto vai de ~1:1 (1024px) a
 * 2,6:1 (1920px) e some abaixo de 900px. 2:1 cabe inteira no app e é o meio do portal.
 *
 * Pixels só o backoffice confere: a rule do Storage (`store/campaigns/`) só vê bytes e tipo, e a
 * callable `saveStoreCampaigns` recebe só a URL. Bytes e tipo espelham a rule — mudar os dois.
 */
export const BANNER_IMAGE_WIDTH = 1600;
export const BANNER_IMAGE_HEIGHT = 800;
/** Abaixo disso a foto estica: 2x na coluna do portal em 1440px, 3x no card do app. */
export const BANNER_IMAGE_MIN_WIDTH = 1200;
export const BANNER_IMAGE_MIN_HEIGHT = 600;
/** Desvio da proporção 2:1 a partir do qual a tela avisa (não bloqueia: o recorte é pelo centro). */
export const BANNER_RATIO_TOLERANCE = 0.15;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const BANNER_IMAGE_SPEC = `Recomendado: ${BANNER_IMAGE_WIDTH}×${BANNER_IMAGE_HEIGHT} px (2:1) · JPG, PNG ou WebP até 10 MB · mínimo ${BANNER_IMAGE_MIN_WIDTH}×${BANNER_IMAGE_MIN_HEIGHT}`;

export interface ImageSize {
  width: number;
  height: number;
}

/** O que o arquivo tem de errado para subir, ou `null`. Mesmo limite da rule do Storage. */
export function imageFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  return file.size >= IMAGE_MAX_BYTES ? 'A foto passa de 10 MB.' : null;
}

function ratioLabel(size: ImageSize): string {
  return (size.width / size.height).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

/**
 * Pixels da foto contra o tamanho do banner. `error` barra o envio (pequena demais: fica borrada
 * na vitrine); `warning` só avisa (proporção longe de 2:1: a vitrine corta o que sobrar).
 */
export function imageSizeCheck(size: ImageSize): { error: string | null; warning: string | null } {
  const dims = `${size.width}×${size.height} px`;
  if (size.width < BANNER_IMAGE_MIN_WIDTH || size.height < BANNER_IMAGE_MIN_HEIGHT) {
    return {
      error: `A foto tem ${dims}; o mínimo é ${BANNER_IMAGE_MIN_WIDTH}×${BANNER_IMAGE_MIN_HEIGHT} (recomendado ${BANNER_IMAGE_WIDTH}×${BANNER_IMAGE_HEIGHT}).`,
      warning: null,
    };
  }
  const ratio = size.width / size.height;
  const target = BANNER_IMAGE_WIDTH / BANNER_IMAGE_HEIGHT;
  if (Math.abs(ratio / target - 1) > BANNER_RATIO_TOLERANCE) {
    return {
      error: null,
      warning: `A foto tem ${dims} (${ratioLabel(size)}:1); a vitrine mostra em 2:1 e corta o que sobrar — confira o recorte acima.`,
    };
  }
  return { error: null, warning: null };
}

/** Largura e altura reais do arquivo, sem subir nada. Rejeita se o navegador não decodifica. */
export async function readImageSize(file: Blob): Promise<ImageSize> {
  const bitmap = await createImageBitmap(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}
