export type NamePlacement = 'costas_superior' | 'costas_inferior' | 'frente' | 'manga';
export type FontId = 'bloco' | 'classica' | 'mono';
export type ImageFormat = 'png' | 'jpg' | 'svg';

export interface PrintArea {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
  enabled: boolean;
}

/** Mesmo formato de `CustomizationConfig` em functions/src/store-custom.ts. */
export interface CustomizationConfig {
  active: boolean;
  name: {
    enabled: boolean;
    maxChars: number;
    placement: NamePlacement;
    fonts: { id: FontId; enabled: boolean }[];
    colors: string[];
    blockOffensive: boolean;
    allowNumber: boolean;
  };
  image: {
    enabled: boolean;
    formats: ImageFormat[];
    maxSizeMb: number;
    minWidthPx: number;
    minHeightPx: number;
    areas: PrintArea[];
    removeBackground: boolean;
  };
  price: { nameOnlyCents: number; imageOnlyCents: number; bothCents: number };
  production: { leadDays: number; printShop: string; manualApproval: boolean };
  defectOnlyReturns: boolean;
}

export const PLACEMENT_LABELS: Record<NamePlacement, string> = {
  costas_superior: 'Costas superior',
  costas_inferior: 'Costas inferior',
  frente: 'Frente',
  manga: 'Manga',
};

export const FONT_LABELS: Record<FontId, string> = { bloco: 'Bloco', classica: 'Clássica', mono: 'Mono' };
export const FORMAT_LABELS: Record<ImageFormat, string> = { png: 'PNG', jpg: 'JPG', svg: 'SVG' };

/**
 * Espelho de `DEFAULT_CUSTOMIZATION` (functions/src/store-custom.ts): o que um produto sem
 * doc de personalização mostra. Mudar lá exige mudar aqui.
 */
export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  active: false,
  name: {
    enabled: true,
    maxChars: 12,
    placement: 'costas_superior',
    fonts: [
      { id: 'bloco', enabled: true },
      { id: 'classica', enabled: true },
      { id: 'mono', enabled: true },
    ],
    colors: ['#ffffff', '#111111', '#ff6a1a', '#e3b85c'],
    blockOffensive: true,
    allowNumber: false,
  },
  image: {
    enabled: true,
    formats: ['png', 'jpg', 'svg'],
    maxSizeMb: 10,
    minWidthPx: 1000,
    minHeightPx: 1000,
    areas: [
      { id: 'peito_esquerdo', name: 'Peito esquerdo', widthCm: 9, heightCm: 9, enabled: true },
      { id: 'centro_frente', name: 'Centro da frente', widthCm: 25, heightCm: 30, enabled: true },
      { id: 'manga', name: 'Manga', widthCm: 7, heightCm: 7, enabled: false },
    ],
    removeBackground: true,
  },
  price: { nameOnlyCents: 1490, imageOnlyCents: 1990, bothCents: 2490 },
  production: { leadDays: 5, printShop: '', manualApproval: true },
  defectOnlyReturns: true,
};

type Raw = Record<string, any>;

/** Doc salvo por cima do padrão, bloco a bloco (o doc pode ser de versão anterior). */
export function customizationFromDoc(d: Raw | undefined): CustomizationConfig {
  const base = structuredClone(DEFAULT_CUSTOMIZATION);
  if (!d) {
    return base;
  }
  return {
    ...base,
    active: d['active'] === true,
    name: { ...base.name, ...(d['name'] ?? {}) },
    image: { ...base.image, ...(d['image'] ?? {}) },
    price: { ...base.price, ...(d['price'] ?? {}) },
    production: { ...base.production, ...(d['production'] ?? {}) },
    defectOnlyReturns: d['defectOnlyReturns'] !== false,
  };
}

export type CardErrors = Partial<Record<'name' | 'image' | 'price' | 'production' | 'active', string>>;

/** Mesmas regras da callable, com a mensagem no card certo. */
export function customizationErrors(c: CustomizationConfig): CardErrors {
  const e: CardErrors = {};
  if (!Number.isInteger(c.name.maxChars) || c.name.maxChars < 1 || c.name.maxChars > 20) {
    e.name = 'Máx. caracteres vai de 1 a 20.';
  } else if (c.name.enabled && !c.name.fonts.some((f) => f.enabled)) {
    e.name = 'Ligue ao menos uma fonte.';
  } else if (c.name.enabled && c.name.colors.length === 0) {
    e.name = 'Escolha ao menos uma cor.';
  }
  if (!Number.isInteger(c.image.maxSizeMb) || c.image.maxSizeMb < 1 || c.image.maxSizeMb > 50) {
    e.image = 'Tamanho máximo vai de 1 a 50 MB.';
  } else if (
    !Number.isInteger(c.image.minWidthPx) || !Number.isInteger(c.image.minHeightPx) ||
    c.image.minWidthPx < 100 || c.image.minHeightPx < 100 || c.image.minWidthPx > 10000 || c.image.minHeightPx > 10000
  ) {
    e.image = 'Resolução mínima vai de 100 a 10000 px.';
  } else if (c.image.enabled && c.image.formats.length === 0) {
    e.image = 'Aceite ao menos um formato.';
  } else if (c.image.enabled && !c.image.areas.some((a) => a.enabled)) {
    e.image = 'Ligue ao menos uma área de impressão.';
  }
  const prices = [c.price.nameOnlyCents, c.price.imageOnlyCents, c.price.bothCents];
  if (prices.some((p) => !Number.isInteger(p) || p < 0)) {
    e.price = 'Informe preços válidos.';
  } else if (!Number.isInteger(c.production.leadDays) || c.production.leadDays < 1 || c.production.leadDays > 60) {
    e.production = 'Prazo de produção vai de 1 a 60 dias úteis.';
  }
  if (Object.keys(e).length === 0 && c.active && !c.name.enabled && !c.image.enabled) {
    e.active = 'Nome e imagem desligados: desative a personalização para salvar.';
  }
  return e;
}

/** O que soma ao preço base com tudo o que está ligado (pior caso que o atleta pode montar). */
export function addOnCents(c: CustomizationConfig): number {
  if (c.name.enabled && c.image.enabled) {
    return c.price.bothCents;
  }
  if (c.name.enabled) {
    return c.price.nameOnlyCents;
  }
  return c.image.enabled ? c.price.imageOnlyCents : 0;
}

export function addOnLabel(c: CustomizationConfig): string {
  return c.name.enabled && c.image.enabled ? 'Nome + imagem' : c.name.enabled ? 'Nome' : c.image.enabled ? 'Imagem' : 'Personalização';
}

/** Nome de exemplo cabendo no limite: "ANTUNES" corta em "ANTUN" com máx. 5. */
export function sampleName(maxChars: number): string {
  return 'ANTUNES'.slice(0, Math.max(1, maxChars));
}
