import { BANNER_IMAGE_SPEC, imageFileError, imageSizeCheck, readImageSize } from './campaign-image';

function canvasBlob(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

describe('campaign-image', () => {
  it('o texto do campo diz o tamanho recomendado, o mínimo e os formatos', () => {
    expect(BANNER_IMAGE_SPEC).toBe('Recomendado: 1600×800 px (2:1) · JPG, PNG ou WebP até 10 MB · mínimo 1200×600');
  });

  describe('imageSizeCheck', () => {
    it('2:1 a partir do mínimo passa sem aviso', () => {
      for (const size of [
        { width: 1600, height: 800 },
        { width: 1200, height: 600 },
        { width: 3200, height: 1600 },
        // 1,78:1 (16:9) está dentro da tolerância de 15%
        { width: 1920, height: 1080 },
      ]) {
        expect(imageSizeCheck(size)).withContext(`${size.width}×${size.height}`).toEqual({ error: null, warning: null });
      }
    });

    it('abaixo do mínimo em qualquer lado barra o envio', () => {
      expect(imageSizeCheck({ width: 1199, height: 800 }).error).toBe(
        'A foto tem 1199×800 px; o mínimo é 1200×600 (recomendado 1600×800).',
      );
      expect(imageSizeCheck({ width: 1600, height: 599 }).error).toContain('o mínimo é 1200×600');
      expect(imageSizeCheck({ width: 800, height: 400 }).warning).toBeNull();
    });

    it('proporção longe de 2:1 sobe com aviso do recorte', () => {
      expect(imageSizeCheck({ width: 1600, height: 600 })).toEqual({
        error: null,
        warning: 'A foto tem 1600×600 px (2,67:1); a vitrine mostra em 2:1 e corta o que sobrar — confira o recorte acima.',
      });
      expect(imageSizeCheck({ width: 1600, height: 1600 }).warning).toContain('(1:1)');
      expect(imageSizeCheck({ width: 1600, height: 1000 }).warning).toContain('(1,6:1)');
    });
  });

  describe('imageFileError', () => {
    it('mesmo limite da rule do Storage: JPG/PNG/WebP abaixo de 10 MB', () => {
      expect(imageFileError(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('Use JPG, PNG ou WebP.');
      const big = new File([new Uint8Array(10 * 1024 * 1024)], 'a.jpg', { type: 'image/jpeg' });
      expect(imageFileError(big)).toBe('A foto passa de 10 MB.');
      expect(imageFileError(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull();
    });
  });

  describe('readImageSize', () => {
    it('lê os pixels do arquivo', async () => {
      expect(await readImageSize(await canvasBlob(1600, 600))).toEqual({ width: 1600, height: 600 });
    });

    it('arquivo que não é imagem rejeita', async () => {
      await expectAsync(readImageSize(new Blob(['não é foto'], { type: 'image/png' }))).toBeRejected();
    });
  });
});
