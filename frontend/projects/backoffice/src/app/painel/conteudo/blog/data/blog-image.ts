import type { ImageSize } from '../../../loja/campanhas/data/campaign-image';

/**
 * Capa, imagens do corpo e foto do autor. Tipo e bytes valem pela rule do Storage (`blog/`: JPG/PNG/WebP
 * < 5 MB); tamanho e proporção só avisam. Os recortes de cada uma (medidos no app e no site):
 *
 * - Capa: 16:9 no site (lista e post); no app, 1,3:1 no topo do post, 1,5:1 no destaque do feed e
 *   quadrada (92 e 70 px) nas listas. Uma 16:9 com o principal no centro atende todos.
 * - Corpo: aparece inteira, na largura da tela (app) ou da coluna (site).
 * - Autor: círculo de 40 px; quadrada evita corte.
 */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const BLOG_IMAGE_MIN_WIDTH = 1200;
export const BLOG_AUTHOR_PHOTO_MIN = 400;

export type BlogImageKind = 'cover' | 'body' | 'author';

const FORMATS = 'JPG, PNG ou WebP até 5 MB';

/** A dica que fica embaixo da área de imagem, por tipo. */
export const BLOG_IMAGE_SPECS: Record<BlogImageKind, string> = {
  cover: `Recomendado: 1600×900 px (16:9), com o principal no centro: o app corta em quadrado nas listas e mais alto no topo do post. ${FORMATS}.`,
  body: `Recomendado: 1200 px de largura ou mais, de preferência horizontal. Aparece inteira, na largura da tela. ${FORMATS}.`,
  author: `Recomendado: quadrada, ${BLOG_AUTHOR_PHOTO_MIN}×${BLOG_AUTHOR_PHOTO_MIN} px ou mais, com o rosto no centro (aparece em círculo). ${FORMATS}.`,
};

/** Mantido para quem importava a dica da capa. */
export const BLOG_COVER_SPEC = BLOG_IMAGE_SPECS.cover;

/** O que o arquivo tem de errado para subir, ou `null`. Mesmo limite da rule do Storage. */
export function blogImageFileError(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return 'Use JPG, PNG ou WebP.';
  }
  return file.size >= IMAGE_MAX_BYTES ? 'A imagem passa de 5 MB.' : null;
}

/** "1,33" — proporção para o aviso. */
function ratioLabel(size: ImageSize): string {
  return (size.width / size.height).toFixed(2).replace('.', ',');
}

/** Aviso (não barra) para imagem pequena ou fora da proporção do lugar onde aparece. */
export function blogImageWarning(size: ImageSize, kind: BlogImageKind = 'body'): string | null {
  const dims = `${size.width}×${size.height} px`;
  if (kind === 'author') {
    if (Math.min(size.width, size.height) < BLOG_AUTHOR_PHOTO_MIN) {
      return `A foto tem ${dims}; abaixo de ${BLOG_AUTHOR_PHOTO_MIN}×${BLOG_AUTHOR_PHOTO_MIN} px ela pode borrar.`;
    }
    const ratio = size.width / size.height;
    return ratio < 0.9 || ratio > 1.1 ? `A foto tem ${dims} e não é quadrada: o círculo corta as bordas.` : null;
  }
  if (size.width < BLOG_IMAGE_MIN_WIDTH) {
    return `A imagem tem ${dims}; abaixo de ${BLOG_IMAGE_MIN_WIDTH} px de largura ela pode borrar no site.`;
  }
  if (kind === 'cover') {
    const ratio = size.width / size.height;
    if (ratio < 1.6 || ratio > 1.9) {
      return `A capa tem ${dims} (proporção ${ratioLabel(size)}); fora de 16:9 (1,78) o site e o app cortam mais das bordas.`;
    }
  }
  return null;
}
