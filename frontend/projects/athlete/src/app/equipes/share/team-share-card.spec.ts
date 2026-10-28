import { circleCropScale } from './team-share-card';

describe('circleCropScale', () => {
  it('amplia a foto redonda até a moldura da ficha caber no círculo', () => {
    // Foto quadrada de 800: o cover sozinho daria 228/800; o círculo pede a diagonal.
    const scale = circleCropScale(148, 228, 800, 800);
    const radius = (800 * scale) / 2;

    expect(scale).toBeGreaterThan(228 / 800);
    // Todo canto da moldura fica dentro do círculo da foto.
    expect(Math.hypot(148 / 2, 228 / 2)).toBeLessThanOrEqual(radius + 1e-9);
  });

  it('foto que não é quadrada usa o lado menor (onde o círculo encosta)', () => {
    expect(circleCropScale(100, 100, 800, 600)).toBeCloseTo(Math.SQRT2 * (100 / 600), 10);
  });
});
