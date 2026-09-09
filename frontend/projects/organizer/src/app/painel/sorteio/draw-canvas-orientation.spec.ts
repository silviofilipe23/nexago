import { drawCanvasFor, isPortraitViewport } from './draw-canvas-orientation';

/**
 * O telão é público e o link circula em grupo de WhatsApp: quem abre é o
 * celular. A regra de virar o canvas tem duas condições e trocar uma delas
 * quebra em silêncio — daí o teste.
 */
describe('isPortraitViewport', () => {
  it('celular em pé vira o canvas', () => {
    expect(isPortraitViewport(375, 812)).toBe(true);
  });

  it('celular DEITADO fica no canvas deitado — ali o 16:9 é o que se quer', () => {
    expect(isPortraitViewport(812, 375)).toBe(false);
  });

  it('tablet em pé vira o canvas', () => {
    expect(isPortraitViewport(768, 1024)).toBe(true);
  });

  it('tablet deitado fica deitado', () => {
    expect(isPortraitViewport(1024, 768)).toBe(false);
  });

  it('TV e desktop ficam deitados', () => {
    expect(isPortraitViewport(1920, 1080)).toBe(false);
    expect(isPortraitViewport(1440, 900)).toBe(false);
  });

  it('janela alta e ESTREITA no desktop também vira — é o mesmo problema', () => {
    expect(isPortraitViewport(500, 900)).toBe(true);
  });

  it('janela alta mas LARGA fica deitada', () => {
    expect(isPortraitViewport(1200, 1400)).toBe(false);
  });

  it('viewport ainda não medido não vira nada', () => {
    expect(isPortraitViewport(0, 0)).toBe(false);
  });
});

describe('drawCanvasFor', () => {
  it('em pé é 1080×1920', () => {
    expect(drawCanvasFor(true)).toEqual({ width: 1080, height: 1920 });
  });

  it('deitado é 1920×1080', () => {
    expect(drawCanvasFor(false)).toEqual({ width: 1920, height: 1080 });
  });
});
