import { BRACKET_ZOOM_MAX, BRACKET_ZOOM_MIN, clampZoom, zoomAt } from './bracket-zoom';

describe('clampZoom', () => {
  it('mantém valores dentro da faixa', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.7)).toBe(1.7);
  });

  it('limita abaixo do mínimo e acima do máximo', () => {
    expect(clampZoom(0.01)).toBe(BRACKET_ZOOM_MIN);
    expect(clampZoom(99)).toBe(BRACKET_ZOOM_MAX);
  });
});

describe('zoomAt', () => {
  it('mantém o ponto do conteúdo sob a âncora ao ampliar', () => {
    const before = { zoom: 1, scrollLeft: 100, scrollTop: 50 };
    const anchorX = 180;
    const anchorY = 120;
    const result = zoomAt(before, 1.5, anchorX, anchorY);

    // Ponto do conteúdo (em px não escalados) sob a âncora não pode mudar.
    const contentXBefore = (before.scrollLeft + anchorX) / before.zoom;
    const contentXAfter = (result.scrollLeft + anchorX) / result.zoom;
    const contentYBefore = (before.scrollTop + anchorY) / before.zoom;
    const contentYAfter = (result.scrollTop + anchorY) / result.zoom;

    expect(result.zoom).toBe(1.5);
    expect(contentXAfter).toBeCloseTo(contentXBefore, 6);
    expect(contentYAfter).toBeCloseTo(contentYBefore, 6);
  });

  it('mantém o ponto do conteúdo sob a âncora ao reduzir', () => {
    const before = { zoom: 2, scrollLeft: 400, scrollTop: 300 };
    const result = zoomAt(before, 1.2, 90, 40);

    expect(result.zoom).toBe(1.2);
    expect((result.scrollLeft + 90) / result.zoom).toBeCloseTo((before.scrollLeft + 90) / before.zoom, 6);
    expect((result.scrollTop + 40) / result.zoom).toBeCloseTo((before.scrollTop + 40) / before.zoom, 6);
  });

  it('limita o zoom alvo à faixa permitida', () => {
    expect(zoomAt({ zoom: 1, scrollLeft: 0, scrollTop: 0 }, 10, 0, 0).zoom).toBe(BRACKET_ZOOM_MAX);
    expect(zoomAt({ zoom: 1, scrollLeft: 0, scrollTop: 0 }, 0, 0, 0).zoom).toBe(BRACKET_ZOOM_MIN);
  });

  it('nunca devolve scroll negativo', () => {
    // Reduzindo perto do canto superior esquerdo a fórmula crua ficaria negativa;
    // o navegador limitaria em 0, e a função deve devolver o mesmo valor final.
    const result = zoomAt({ zoom: 1, scrollLeft: 10, scrollTop: 5 }, BRACKET_ZOOM_MIN, 200, 150);
    expect(result.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(result.scrollTop).toBeGreaterThanOrEqual(0);
  });

  it('sem mudança de zoom devolve o scroll intacto', () => {
    const result = zoomAt({ zoom: 1.5, scrollLeft: 123, scrollTop: 45 }, 1.5, 60, 60);
    expect(result).toEqual({ zoom: 1.5, scrollLeft: 123, scrollTop: 45 });
  });
});
