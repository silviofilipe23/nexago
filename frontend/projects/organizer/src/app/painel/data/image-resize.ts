/** Redimensionamento de imagem no navegador, antes do upload pro Storage. */

/** Limita a LARGURA mantendo a proporção. Nunca amplia. */
export function scaleToMaxWidth(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) };
}

/** Decodifica, reduz pra `maxWidth` de largura e exporta JPEG. Fundo branco: PNG transparente
 *  viraria preto no JPEG. Lança se o arquivo não for uma imagem decodificável. */
export async function resizeImageToJpeg(file: Blob, maxWidth: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = scaleToMaxWidth(bitmap.width, bitmap.height, maxWidth);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('falha ao gerar o JPEG');
    return blob;
  } finally {
    bitmap.close();
  }
}
