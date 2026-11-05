import { DEFAULT_CUSTOMIZATION, customizationFromDoc, type CustomizationConfig } from './customization';
import { areaBox, backBox, clampBox, nameBox, roundPoint } from './customization-layout';

function config(over: (c: CustomizationConfig) => void = () => undefined): CustomizationConfig {
  const c = structuredClone(DEFAULT_CUSTOMIZATION);
  over(c);
  return c;
}

describe('customization-layout', () => {
  it('sem posição, o lugar padrão do portal e do app', () => {
    const c = config();
    expect(nameBox(c.name)).toEqual({ cx: 0.5, cy: 0.24, w: 0.6, h: 0.15 });
    expect(nameBox({ placement: 'barra', position: null })).toEqual({ cx: 0.5, cy: 0.8, w: 0.6, h: 0.15 });
    const chest = areaBox(c.image.areas[0]!);
    expect([chest.cx, chest.cy]).toEqual([0.68, 0.3]);
    expect(chest.w).toBeCloseTo(9 / 60);
    expect([areaBox({ id: 'outra', name: 'Outra', widthCm: 10, heightCm: 10, enabled: true }).cy]).toEqual([0.4]);
  });

  it('com posição, o centro arrastado', () => {
    expect(nameBox({ placement: 'frente', position: { x: 0.3, y: 0.2 } })).toEqual({ cx: 0.3, cy: 0.2, w: 0.6, h: 0.15 });
    const area = areaBox({ id: 'peito_esquerdo', name: 'Peito', widthCm: 9, heightCm: 9, enabled: true, position: { x: 0.32, y: 0.3 } });
    expect([area.cx, area.cy]).toEqual([0.32, 0.3]);
  });

  it('costas coladas ao nome (inclusive arrastado) até terem posição própria', () => {
    const h = 25 / 70;
    expect(backBox(config((c) => (c.back.enabled = true))).cy).toBeCloseTo(0.24 + 0.075 + 0.03 + h / 2);
    expect(backBox(config((c) => (c.name.position = { x: 0.5, y: 0.1 }))).cy).toBeCloseTo(0.1 + 0.075 + 0.03 + h / 2);
    expect(backBox(config((c) => (c.name.placement = 'costas_inferior'))).cy).toBeCloseTo(0.62 - 0.075 - 0.03 - h / 2);
    expect(backBox(config((c) => (c.name.placement = 'frente'))).cy).toBe(0.45);
    expect(backBox(config((c) => (c.back.position = { x: 0.5, y: 0.7 }))).cy).toBe(0.7);
  });

  it('caixa inteira dentro da peça; a faixa do nome só prende o centro na horizontal', () => {
    const area = clampBox({ cx: 0.99, cy: 0.01, w: 0.2, h: 0.2 });
    expect([area.cx, area.cy]).toEqual([0.9, 0.1]);
    const name = clampBox({ cx: 0.05, cy: 0.99, w: 0.6, h: 0.15 }, false);
    expect([name.cx, name.cy]).toEqual([0.05, 0.925]);
  });

  it('ponto gravado com 4 casas; doc antigo traz área sem posição como null', () => {
    expect(roundPoint(0.123456, 0.987654)).toEqual({ x: 0.1235, y: 0.9877 });
    const c = customizationFromDoc({ active: true, image: { areas: [{ id: 'a', name: 'A', widthCm: 9, heightCm: 9, enabled: true }] } });
    expect(c.image.areas[0]!.position).toBeNull();
    expect(c.name.position).toBeNull();
    expect(c.back.position).toBeNull();
  });
});
