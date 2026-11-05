import type { ImageSize } from '../../../loja/campanhas/data/campaign-image';

/**
 * Capa e imagens do corpo. Tipo e bytes valem pela rule do Storage (`blog/`: JPG/PNG/WebP < 5 MB);
 * a largura só avisa (o site mostra a capa na largura da coluna e o app na da tela).
 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const BLOG_IMAGE_MIN_WIDTH = 1200;

export const BLOG_COVER_SPEC = 'Recomendado: 1600×900 px (16:9) · JPG, PNG ou WebP até 5 MB';

/** O que o arquivo tem de errado para subir, ou `null`. Mesmo limite da rule do Storage. */
export function blogImageFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  return file.size >= IMAGE_MAX_BYTES ? 'A imagem passa de 5 MB.' : null;
}

/** Aviso (não barra) para imagem estreita, que borra no site. */
export function blogImageWarning(size: ImageSize): string | null {
  return size.width < BLOG_IMAGE_MIN_WIDTH
    ? `A imagem tem ${size.width}×${size.height} px; abaixo de ${BLOG_IMAGE_MIN_WIDTH} px de largura ela pode borrar no site.`
    : null;
}
