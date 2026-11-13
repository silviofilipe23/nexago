/**
 * Reduz a imagem no navegador ANTES de subir pro Storage.
 *
 * A foto de celular chega com 8–12 MB e 4000 px; a tela nunca mostra mais que ~2000 px. Subir crua
 * esbarrava no teto de 5 MB do `storage.rules` e, quando passava, cada atleta que abria a arena no
 * app baixava o arquivo inteiro. Reduzida, a mesma foto fica entre 300 e 600 KB.
 *
 * O teto de 5 MB do `storage.rules` continua valendo, só que agora para o arquivo GRAVADO; o
 * arquivo ESCOLHIDO pode ir até {@link PICKED_IMAGE_MAX_BYTES}.
 */

/** Arquivo escolhido: acima disso nem tenta reduzir (mesmo teto da avaliação da loja no portal do atleta). */
export const PICKED_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/** Arquivo gravado: o mesmo teto do `storage.rules` (`request.resource.size < 5 MB`). */
export const STORED_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Já pequeno e dentro das medidas: sobe como veio, sem reencodar (não perde qualidade à toa). */
export const KEEP_ORIGINAL_MAX_BYTES = 1024 * 1024;

/** Onde a imagem aparece define o lado maior que vale guardar. */
export type ImageTarget = 'logo' | 'product' | 'wide';

export const IMAGE_MAX_SIDE: Record<ImageTarget, number> = {
  /** Logo: aparece pequeno, em círculo ou quadrado. */
  logo: 512,
  /** Foto de produto: comanda e cardápio. */
  product: 1200,
  /** Capa, site e vitrine: faixas largas, inclusive em tela grande. */
  wide: 2048,
};

const JPEG_QUALITY = 0.85;
/** Segunda tentativa quando a primeira ainda passa do teto gravado (foto muito detalhada). */
const JPEG_QUALITY_RETRY = 0.72;

export type ShrinkOutputType = 'image/jpeg' | 'image/png';

export interface ShrinkPlan {
  /** Sobe o arquivo original, sem passar pelo canvas. */
  keepOriginal: boolean;
  width: number;
  height: number;
  /** PNG continua PNG (logo com fundo transparente); o resto vira JPEG. */
  outputType: ShrinkOutputType;
}

/** Decide medidas e formato de saída. Pura: o canvas só executa o que sai daqui. */
export function planImageShrink(
  source: { width: number; height: number; bytes: number; type: string },
  target: ImageTarget,
): ShrinkPlan {
  const maxSide = IMAGE_MAX_SIDE[target];
  const longest = Math.max(source.width, source.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const outputType: ShrinkOutputType = source.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const keepOriginal = scale === 1 && source.bytes <= KEEP_ORIGINAL_MAX_BYTES;
  return { keepOriginal, width, height, outputType };
}

function encode(canvas: HTMLCanvasElement, type: ShrinkOutputType, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), type, quality);
  });
}

function draw(bitmap: ImageBitmap, width: number, height: number, opaque: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  if (opaque) {
    // JPEG não tem transparência: sem fundo, o que era transparente sai preto.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Devolve o arquivo pronto pra subir: reduzido ao lado maior do [target] e reencodado, ou o
 * original quando já é pequeno. Lança `Error` com mensagem pra tela quando não dá.
 */
export async function shrinkImageFile(file: Blob, target: ImageTarget): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // `from-image`: respeita a rotação EXIF da foto de celular (sem isso, retrato sai deitado).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível abrir essa imagem. Use JPG, PNG ou WebP.');
  }
  try {
    const plan = planImageShrink({ width: bitmap.width, height: bitmap.height, bytes: file.size, type: file.type }, target);
    if (plan.keepOriginal) return file;

    if (plan.outputType === 'image/png') {
      const png = await encode(draw(bitmap, plan.width, plan.height, false), 'image/png', 1);
      if (png.size < STORED_IMAGE_MAX_BYTES) return png;
      // PNG de foto (print de tela grande) não cabe: cai pra JPEG, como as outras.
    }

    const canvas = draw(bitmap, plan.width, plan.height, true);
    const jpeg = await encode(canvas, 'image/jpeg', JPEG_QUALITY);
    if (jpeg.size < STORED_IMAGE_MAX_BYTES) return jpeg;
    const retry = await encode(canvas, 'image/jpeg', JPEG_QUALITY_RETRY);
    if (retry.size < STORED_IMAGE_MAX_BYTES) return retry;
    throw new Error('Imagem muito grande mesmo depois de reduzida. Tente outra foto.');
  } finally {
    bitmap.close();
  }
}
