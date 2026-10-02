import { resizeImageToJpeg, scaleToMaxWidth } from './image-resize';

/** PNG sintético do tamanho pedido, gerado no próprio Chrome do Karma. */
async function pngOf(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob!;
}

describe('image-resize', () => {
  describe('scaleToMaxWidth', () => {
    it('reduz mantendo a proporção', () => {
      expect(scaleToMaxWidth(3200, 800, 1600)).toEqual({ width: 1600, height: 400 });
      expect(scaleToMaxWidth(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    });

    it('nunca amplia imagem menor que o limite', () => {
      expect(scaleToMaxWidth(800, 200, 1600)).toEqual({ width: 800, height: 200 });
      expect(scaleToMaxWidth(1600, 400, 1600)).toEqual({ width: 1600, height: 400 });
    });

    it('arredonda a altura', () => {
      expect(scaleToMaxWidth(3000, 1001, 1600)).toEqual({ width: 1600, height: 534 });
    });

    it('não deixa lado zerado em imagem muito estreita', () => {
      expect(scaleToMaxWidth(100000, 10, 1600)).toEqual({ width: 1600, height: 1 });
    });
  });

  describe('resizeImageToJpeg', () => {
    it('devolve JPEG com a largura limitada', async () => {
      const out = await resizeImageToJpeg(await pngOf(3200, 800), 1600);
      expect(out.type).toBe('image/jpeg');
      const bitmap = await createImageBitmap(out);
      expect([bitmap.width, bitmap.height]).toEqual([1600, 400]);
      bitmap.close();
    });

    it('imagem pequena só muda de formato', async () => {
      const out = await resizeImageToJpeg(await pngOf(400, 100), 1600);
      expect(out.type).toBe('image/jpeg');
      const bitmap = await createImageBitmap(out);
      expect([bitmap.width, bitmap.height]).toEqual([400, 100]);
      bitmap.close();
    });

    it('arquivo que não é imagem lança', async () => {
      await expectAsync(resizeImageToJpeg(new Blob(['nada'], { type: 'image/png' }), 1600)).toBeRejected();
    });
  });
});
