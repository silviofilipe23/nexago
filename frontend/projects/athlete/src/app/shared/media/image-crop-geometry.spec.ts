import {
  clampOffset,
  coverScale,
  cropRect,
  outputSize,
  zoomAnchoredOffset,
} from './image-crop-geometry';

describe('image-crop-geometry', () => {
  describe('coverScale', () => {
    it('usa o lado que falta pra cobrir a moldura (foto deitada, moldura quadrada)', () => {
      // 800x400 numa moldura 400x400: a altura é o gargalo → 400/400 = 1.
      expect(coverScale({ w: 800, h: 400 }, { w: 400, h: 400 })).toBe(1);
    });

    it('amplia quando a foto é menor que a moldura', () => {
      expect(coverScale({ w: 200, h: 200 }, { w: 400, h: 400 })).toBe(2);
    });

    it('devolve 0 enquanto a moldura não foi medida', () => {
      expect(coverScale({ w: 800, h: 600 }, { w: 0, h: 0 })).toBe(0);
      expect(coverScale({ w: 0, h: 0 }, { w: 400, h: 400 })).toBe(0);
    });
  });

  describe('clampOffset', () => {
    const frame = { w: 400, h: 400 };

    it('deixa arrastar até a borda da foto, nunca além', () => {
      const display = { w: 800, h: 400 };
      // Sobra 400px de largura → 200px pra cada lado.
      expect(clampOffset({ x: 500, y: 0 }, display, frame)).toEqual({ x: 200, y: 0 });
      expect(clampOffset({ x: -500, y: 0 }, display, frame)).toEqual({ x: -200, y: 0 });
      expect(clampOffset({ x: 120, y: 0 }, display, frame)).toEqual({ x: 120, y: 0 });
    });

    it('trava no centro o eixo em que a foto não é maior que a moldura', () => {
      expect(clampOffset({ x: 90, y: 90 }, { w: 400, h: 400 }, frame)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('zoomAnchoredOffset', () => {
    it('com âncora no centro é só uma multiplicação', () => {
      expect(zoomAnchoredOffset({ x: 10, y: -20 }, { x: 0, y: 0 }, 2)).toEqual({ x: 20, y: -40 });
    });

    it('mantém parado o ponto sob a âncora', () => {
      const offset = { x: 0, y: 0 };
      const anchor = { x: 100, y: 50 };
      const ratio = 2;
      const next = zoomAnchoredOffset(offset, anchor, ratio);

      // O ponto da foto sob a âncora é (anchor - offset) / escala. Se ele não se
      // moveu, essa razão continua a mesma depois do zoom.
      const before = { x: (anchor.x - offset.x) / 1, y: (anchor.y - offset.y) / 1 };
      const after = { x: (anchor.x - next.x) / ratio, y: (anchor.y - next.y) / ratio };
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
    });

    it('não mexe em nada quando a escala não muda', () => {
      expect(zoomAnchoredOffset({ x: 33, y: 7 }, { x: 120, y: -4 }, 1)).toEqual({ x: 33, y: 7 });
    });
  });

  describe('cropRect', () => {
    it('centralizado e sem zoom, recorta o quadrado central', () => {
      // 800x400 na moldura 400x400 com escala 1: sobra 200px de cada lado.
      const rect = cropRect({ w: 800, h: 400 }, { w: 400, h: 400 }, { x: 0, y: 0 }, 1);
      expect(rect).toEqual({ sx: 200, sy: 0, sw: 400, sh: 400 });
    });

    it('arrastar a foto pra direita move o recorte pra esquerda', () => {
      const rect = cropRect({ w: 800, h: 400 }, { w: 400, h: 400 }, { x: 200, y: 0 }, 1);
      expect(rect.sx).toBe(0);
      expect(rect.sw).toBe(400);
    });

    it('zoom encolhe a área lida da foto original', () => {
      const rect = cropRect({ w: 800, h: 800 }, { w: 400, h: 400 }, { x: 0, y: 0 }, 2);
      expect(rect).toEqual({ sx: 300, sy: 300, sw: 200, sh: 200 });
    });
  });

  describe('outputSize', () => {
    it('respeita o teto de largura', () => {
      expect(outputSize(4000, 1, 1600)).toEqual({ w: 1600, h: 1600 });
    });

    it('nunca amplia um recorte menor que o teto', () => {
      expect(outputSize(900, 1, 1600)).toEqual({ w: 900, h: 900 });
    });

    it('deriva a altura da proporção pedida', () => {
      expect(outputSize(2200, 2.63, 2200)).toEqual({ w: 2200, h: 837 });
    });

    it('nunca devolve dimensão zero', () => {
      expect(outputSize(0.2, 1, 1600)).toEqual({ w: 1, h: 1 });
    });
  });
});
