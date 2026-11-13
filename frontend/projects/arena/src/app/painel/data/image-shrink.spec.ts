import { IMAGE_MAX_SIDE, KEEP_ORIGINAL_MAX_BYTES, planImageShrink, shrinkImageFile, STORED_IMAGE_MAX_BYTES } from './image-shrink';

const MB = 1024 * 1024;

describe('planImageShrink', () => {
  it('reduz foto de celular ao lado maior do destino, mantendo a proporção', () => {
    const plan = planImageShrink({ width: 4032, height: 3024, bytes: 9 * MB, type: 'image/jpeg' }, 'wide');
    expect(plan.keepOriginal).toBeFalse();
    expect(plan.width).toBe(2048);
    expect(plan.height).toBe(1536);
    expect(plan.outputType).toBe('image/jpeg');
  });

  it('usa o lado maior também em retrato', () => {
    const plan = planImageShrink({ width: 3024, height: 4032, bytes: 9 * MB, type: 'image/jpeg' }, 'product');
    expect(plan.height).toBe(IMAGE_MAX_SIDE.product);
    expect(plan.width).toBe(900);
  });

  it('logo vai a 512 px e PNG continua PNG (fundo transparente)', () => {
    const plan = planImageShrink({ width: 2000, height: 2000, bytes: 3 * MB, type: 'image/png' }, 'logo');
    expect(plan.width).toBe(512);
    expect(plan.outputType).toBe('image/png');
  });

  it('WebP vira JPEG', () => {
    expect(planImageShrink({ width: 3000, height: 2000, bytes: 2 * MB, type: 'image/webp' }, 'wide').outputType).toBe('image/jpeg');
  });

  it('imagem já pequena e dentro das medidas sobe como veio', () => {
    const plan = planImageShrink({ width: 1600, height: 900, bytes: KEEP_ORIGINAL_MAX_BYTES, type: 'image/jpeg' }, 'wide');
    expect(plan.keepOriginal).toBeTrue();
  });

  it('dentro das medidas mas pesada é reencodada', () => {
    const plan = planImageShrink({ width: 1600, height: 900, bytes: 3 * MB, type: 'image/jpeg' }, 'wide');
    expect(plan.keepOriginal).toBeFalse();
    expect(plan.width).toBe(1600);
  });
});

describe('shrinkImageFile', () => {
  async function canvasBlob(width: number, height: number, type: string, noisy = false): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (noisy) {
      const img = ctx.createImageData(width, height);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761) % 256;
      ctx.putImageData(img, 0, 0);
    } else {
      ctx.fillStyle = '#ff6a00';
      ctx.fillRect(0, 0, width, height);
    }
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), type, 0.95));
  }

  async function sizeOf(blob: Blob): Promise<{ width: number; height: number }> {
    const bmp = await createImageBitmap(blob);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  }

  it('foto grande sai reduzida, em JPEG e abaixo do teto do storage.rules', async () => {
    const big = await canvasBlob(4000, 3000, 'image/jpeg', true);
    const out = await shrinkImageFile(big, 'wide');
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBeLessThan(STORED_IMAGE_MAX_BYTES);
    expect(await sizeOf(out)).toEqual({ width: 2048, height: 1536 });
  });

  it('logo PNG sai PNG em 512 px', async () => {
    const logo = await canvasBlob(1500, 1500, 'image/png');
    const out = await shrinkImageFile(logo, 'logo');
    expect(out.type).toBe('image/png');
    expect(await sizeOf(out)).toEqual({ width: 512, height: 512 });
  });

  it('imagem pequena volta o mesmo arquivo', async () => {
    const small = await canvasBlob(800, 600, 'image/jpeg');
    expect(await shrinkImageFile(small, 'wide')).toBe(small);
  });

  it('arquivo que não é imagem dá mensagem pra tela', async () => {
    await expectAsync(shrinkImageFile(new Blob(['x'], { type: 'image/jpeg' }), 'wide')).toBeRejectedWithError(/Não foi possível abrir/);
  });
});
