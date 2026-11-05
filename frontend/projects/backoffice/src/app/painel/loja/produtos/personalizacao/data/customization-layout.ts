import type { CustomizationConfig, NamePlacement, PreviewPoint, PrintArea } from './customization';

/**
 * Geometria da prévia, a mesma do portal (`store-customize-model.ts`) e do app
 * (`store_customize_rules.dart`): peça de referência de 60 × 70 cm, tudo em fração dela. O que
 * se arrasta aqui é o `position` que os dois clientes desenham; sem ele, o lugar padrão abaixo.
 */
export const GARMENT_CM = { width: 60, height: 70 } as const;

export interface LayoutBox {
  /** Centro e tamanho em fração da peça (0–1). */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Altura da faixa do nome. */
export const NAME_BAND_H = 0.15;

const NAME_CENTERS: Readonly<Record<NamePlacement, PreviewPoint>> = {
  costas_superior: { x: 0.5, y: 0.24 },
  costas_inferior: { x: 0.5, y: 0.62 },
  frente: { x: 0.5, y: 0.3 },
  manga: { x: 0.88, y: 0.24 },
  barra: { x: 0.5, y: 0.8 },
};

const AREA_CENTERS: Readonly<Record<string, PreviewPoint>> = {
  // Esquerdo de quem veste = direita de quem olha.
  peito_esquerdo: { x: 0.68, y: 0.3 },
  centro_frente: { x: 0.5, y: 0.45 },
  manga: { x: 0.88, y: 0.24 },
};

export function nameOnBack(placement: NamePlacement): boolean {
  return placement === 'costas_superior' || placement === 'costas_inferior';
}

/**
 * Centro dentro da peça; caixas (áreas, costas) inteiras dentro dela. A faixa do nome só prende
 * o centro na horizontal: o texto é centrado e encolhe até caber, então dá para levá-lo ao peito.
 */
export function clampBox(b: LayoutBox, keepWidthInside = true): LayoutBox {
  const halfW = keepWidthInside ? Math.min(0.5, b.w / 2) : 0;
  const halfH = Math.min(0.5, b.h / 2);
  return {
    ...b,
    cx: Math.min(1 - halfW, Math.max(halfW, b.cx)),
    cy: Math.min(1 - halfH, Math.max(halfH, b.cy)),
  };
}

/** Faixa do nome: 60% da largura (a manga é estreita: 18%). */
export function nameBox(name: Pick<CustomizationConfig['name'], 'placement' | 'position'>): LayoutBox {
  const at = name.position ?? NAME_CENTERS[name.placement];
  return clampBox({ cx: at.x, cy: at.y, w: name.placement === 'manga' ? 0.18 : 0.6, h: NAME_BAND_H }, false);
}

/** Caixa da área = `widthCm/60 × heightCm/70`; área desconhecida começa em (50%, 40%). */
export function areaBox(area: PrintArea): LayoutBox {
  const at = area.position ?? AREA_CENTERS[area.id] ?? { x: 0.5, y: 0.4 };
  return clampBox({
    cx: at.x,
    cy: at.y,
    w: Math.min(1, area.widthCm / GARMENT_CM.width),
    h: Math.min(1, area.heightCm / GARMENT_CM.height),
  });
}

/**
 * Costas: sem posição, centrada e colada ao nome nas costas (abaixo dele; acima com o nome em
 * `costas_inferior`); sem nome nas costas, 0,45.
 */
export function backBox(c: Pick<CustomizationConfig, 'name' | 'back'>): LayoutBox {
  const w = Math.min(1, c.back.widthCm / GARMENT_CM.width);
  const h = Math.min(1, c.back.heightCm / GARMENT_CM.height);
  if (c.back.position) {
    return clampBox({ cx: c.back.position.x, cy: c.back.position.y, w, h });
  }
  const gap = 0.03;
  const name = c.name.enabled && nameOnBack(c.name.placement) ? nameBox(c.name) : null;
  const cy = !name
    ? 0.45
    : c.name.placement === 'costas_inferior'
      ? name.cy - NAME_BAND_H / 2 - gap - h / 2
      : name.cy + NAME_BAND_H / 2 + gap + h / 2;
  return clampBox({ cx: 0.5, cy, w, h });
}

/** Fonte do nome em fração da largura da peça: 8,8% até caber numa linha da faixa (igual ao portal). */
export function nameFontFraction(length: number, bandWidth: number): number {
  return Math.min(0.088 * (bandWidth / 0.6), (bandWidth * 0.95) / (Math.max(1, length) * 0.85));
}

/** Ponto como é gravado: 4 casas (o servidor arredonda igual). */
export function roundPoint(x: number, y: number): PreviewPoint {
  return { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
}
