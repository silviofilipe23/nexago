import {
  BRACKET_ZOOM_DEFAULT,
  BRACKET_ZOOM_MAX,
  BRACKET_ZOOM_MIN,
  clampBracketZoom,
  scrollAfterBracketZoom,
  stepBracketZoom,
  wheelBracketZoom,
} from './chaveamento-zoom';

describe('chaveamento-zoom', () => {
  it('clampa nos limites do painel', () => {
    expect(clampBracketZoom(0.1)).toBe(BRACKET_ZOOM_MIN);
    expect(clampBracketZoom(5)).toBe(BRACKET_ZOOM_MAX);
    expect(clampBracketZoom(1.05)).toBe(1.05);
  });

  it('botões ± avançam em passo fixo e param no limite', () => {
    expect(stepBracketZoom(1, 1)).toBe(1.1);
    expect(stepBracketZoom(1, -1)).toBe(0.9);
    expect(stepBracketZoom(BRACKET_ZOOM_MAX, 1)).toBe(BRACKET_ZOOM_MAX);
    expect(stepBracketZoom(BRACKET_ZOOM_MIN, -1)).toBe(BRACKET_ZOOM_MIN);
  });

  it('roda do mouse aumenta/diminui e respeita o teto', () => {
    expect(wheelBracketZoom(1, -100)).toBe(1.1);
    expect(wheelBracketZoom(1, 100)).toBe(clampBracketZoom(1 / 1.1));
    expect(wheelBracketZoom(BRACKET_ZOOM_MAX, -100)).toBe(BRACKET_ZOOM_MAX);
  });

  it('scrollAfterBracketZoom mantém o ponto sob o cursor', () => {
    // Conteúdo sob o cursor em zoom 1: scroll 100 + offset 50 = 150 (X),
    // 40 + 20 = 60 (Y). Em zoom 2 esses pontos ficam em 300 / 120; o scroll
    // volta a colocar o mesmo ponto sob o cursor: 300-50 / 120-20.
    expect(
      scrollAfterBracketZoom({
        prevZoom: BRACKET_ZOOM_DEFAULT,
        nextZoom: 2,
        scrollLeft: 100,
        scrollTop: 40,
        offsetX: 50,
        offsetY: 20,
      }),
    ).toEqual({ scrollLeft: 250, scrollTop: 100 });
  });
});
