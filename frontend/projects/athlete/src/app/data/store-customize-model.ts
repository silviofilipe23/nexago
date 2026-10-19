/**
 * Loja · Personalizar (web 02b): nome, imagem, preço e prévia.
 *
 * Regras em `docs/business-rules/loja-personalizar.md`, espelhadas no app — mudar aqui é mudar lá.
 * O servidor (`addStoreCustomItemToCart`) revalida tudo; aqui é o retorno na hora. Tudo puro.
 */
import { formatCentsBRL } from './cashback-model';
import type {
  StoreCustomArea,
  StoreCustomization,
  StoreNamePlacement,
  StorePhoto,
  StorePhotoView,
  StoreProduct,
} from './store-showcase-model';

// ── Nome ───────────────────────────────────────────────────────────

/** Letras (com acento), números, espaço, ponto e hífen — o mesmo `NAME_RE` do servidor. */
const NAME_CHAR = /[\p{Lu}0-9 .-]/u;

export type NameProblem = 'empty' | 'chars' | 'length' | 'blocked' | 'disabled';

export interface NameInput {
  value: string;
  /** Algum caractere fora da regra foi barrado: o campo treme e o hint fica vermelho. */
  rejected: boolean;
}

/**
 * O que o campo faz a cada tecla: maiúsculas, sem espaço no começo nem duplo, só caracteres
 * válidos, até `maxChars`. O espaço do fim fica enquanto digita (é o da próxima palavra) e sai
 * no `finalizeName`.
 */
export function sanitizeNameInput(raw: string, maxChars: number): NameInput {
  const upper = raw.toUpperCase().replace(/\s/g, ' ');
  let rejected = false;
  let value = '';
  for (const ch of upper) {
    if (!NAME_CHAR.test(ch)) {
      rejected = true;
      continue;
    }
    if (ch === ' ' && (value === '' || value.endsWith(' '))) continue;
    value += ch;
  }
  return { value: [...value].slice(0, Math.max(0, maxChars)).join(''), rejected };
}

/** Igual ao `normalizeCustomName` do servidor. */
export function finalizeName(value: string): string {
  return value.toUpperCase().replace(/\s+/g, ' ').trim();
}

export function nameLength(value: string): number {
  return [...finalizeName(value)].length;
}

/** "7 de 12 caracteres · letras, números e espaço" (app: "7 de 12 · …"). */
export function nameHint(length: number, maxChars: number, channel: 'web' | 'app' = 'web'): string {
  return channel === 'web'
    ? `${length} de ${maxChars} caracteres · letras, números e espaço`
    : `${length} de ${maxChars} · letras, números e espaço`;
}

/** Laranja a partir de `max − 2`. */
export function nameHintWarns(length: number, maxChars: number): boolean {
  return length >= maxChars - 2;
}

export function nameProblemMessage(problem: NameProblem): string {
  switch (problem) {
    case 'blocked':
      return 'Esse nome não pode ser usado';
    case 'chars':
      return 'Só letras, números e espaço';
    case 'length':
      return 'Nome maior que o permitido';
    case 'empty':
      return 'Escreva o nome';
    case 'disabled':
      return 'Esse produto não aceita nome no momento';
  }
}

export function nameStepTitle(placement: StoreNamePlacement): string {
  switch (placement) {
    case 'frente':
      return 'Nome na frente';
    case 'manga':
      return 'Nome na manga';
    default:
      return 'Nome nas costas';
  }
}

/** Lado da peça onde o nome fica (a manga aparece na frente). */
export function nameSide(placement: StoreNamePlacement): StorePhotoView {
  return placement === 'costas_superior' || placement === 'costas_inferior' ? 'costas' : 'frente';
}

export const FONT_LABELS: Readonly<Record<string, string>> = { bloco: 'Bloco', classica: 'Clássica', mono: 'Mono' };

export function fontLabel(fontId: string): string {
  return FONT_LABELS[fontId] ?? fontId;
}

// ── Cor do nome (contraste WCAG) ──────────────────────────────────

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A cor da config que mais contrasta com a peça; peça sem cor conhecida → a 1ª. */
export function defaultNameColor(colors: readonly string[], garmentHex: string | null): string | null {
  if (colors.length === 0) return null;
  if (!garmentHex || luminance(garmentHex) === null) return colors[0]!;
  let best = colors[0]!;
  let bestRatio = -1;
  for (const c of colors) {
    const r = contrastRatio(c, garmentHex) ?? -1;
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}

// ── Preço ──────────────────────────────────────────────────────────

/** Igual ao `customExtraCents` do servidor: juntos saem pelo preço de ambos. */
export function customExtraCents(price: StoreCustomization['price'], hasName: boolean, hasImage: boolean): number {
  if (hasName && hasImage) return price.bothCents;
  if (hasName) return price.nameOnlyCents;
  if (hasImage) return price.imageOnlyCents;
  return 0;
}

/** "+ R$ 14,90 sozinho" / "+ R$ 19,90 sozinha". */
export function soloPriceLabel(cents: number, gender: 'm' | 'f'): string {
  return `+ ${formatCentsBRL(cents)} ${gender === 'm' ? 'sozinho' : 'sozinha'}`;
}

/** "R$ 129,90 + R$ 24,90 de personalização"; sem adicional, vazio. */
export function priceBreakdown(baseCents: number, extraCents: number): string {
  return extraCents > 0 ? `${formatCentsBRL(baseCents)} + ${formatCentsBRL(extraCents)} de personalização` : '';
}

// ── Imagem ─────────────────────────────────────────────────────────

/** dpi efetivo a partir do qual a imagem é "boa qualidade" (o `GOOD_DPI` do servidor). */
export const GOOD_DPI = 300;

const FORMAT_BY_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
};

const FORMAT_BY_EXT: Readonly<Record<string, string>> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', svg: 'svg' };

export const CONTENT_TYPE_BY_FORMAT: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
};

/** Formato pelo tipo do arquivo; sem tipo (alguns navegadores com SVG), pela extensão. */
export function imageFormat(file: { type: string; name: string }): string | null {
  const byType = FORMAT_BY_TYPE[file.type.toLowerCase()];
  if (byType) return byType;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return file.type === '' ? (FORMAT_BY_EXT[ext] ?? null) : null;
}

/** ['png','jpg','svg'] → "PNG, JPG ou SVG". */
export function formatsLabel(formats: readonly string[]): string {
  const up = formats.map((f) => f.toUpperCase());
  return up.length <= 1 ? (up[0] ?? '') : `${up.slice(0, -1).join(', ')} ou ${up[up.length - 1]}`;
}

function mb(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** "PNG, JPG ou SVG até 10 MB · mínimo 1000 × 1000 px · use só imagens suas ou com autorização". */
export function imageRulesLabel(image: StoreCustomization['image']): string {
  const parts = [`${formatsLabel(image.formats)} até ${mb(image.maxSizeMb)} MB`];
  if (image.minWidthPx > 0 || image.minHeightPx > 0) parts.push(`mínimo ${image.minWidthPx} × ${image.minHeightPx} px`);
  parts.push('use só imagens suas ou com autorização');
  return parts.join(' · ');
}

export interface ImageDims {
  widthPx: number;
  heightPx: number;
}

/**
 * Antes de subir: formato, peso e resolução (SVG não tem mínimo). Devolve o texto do card
 * vermelho, ou `null` quando pode subir.
 */
export function imageFileProblem(
  file: { type: string; name: string; size: number },
  dims: ImageDims | null,
  image: StoreCustomization['image'],
): string | null {
  const format = imageFormat(file);
  if (format === null || !image.formats.includes(format)) return `Formato não aceito · use ${formatsLabel(image.formats)}`;
  if (file.size > image.maxSizeMb * 1024 * 1024) return `Arquivo maior que ${mb(image.maxSizeMb)} MB`;
  if (format === 'svg') return null;
  if (dims === null) return 'Não deu pra ler essa imagem · tente outro arquivo';
  if (dims.widthPx < image.minWidthPx || dims.heightPx < image.minHeightPx) {
    return `Imagem pequena demais · mínimo ${image.minWidthPx} × ${image.minHeightPx} px`;
  }
  return null;
}

/** dpi efetivo pelo lado mais fraco; SVG (sem dimensão em px) é vetor: sempre bom. */
export function effectiveDpi(dims: ImageDims | null, area: Pick<StoreCustomArea, 'widthCm' | 'heightCm'>): number {
  if (dims === null) return Number.POSITIVE_INFINITY;
  return Math.min(dims.widthPx / (area.widthCm / 2.54), dims.heightPx / (area.heightCm / 2.54));
}

export type ImageQuality = 'good' | 'warn';

export function imageQuality(dpi: number): ImageQuality {
  return dpi >= GOOD_DPI ? 'good' : 'warn';
}

/** "Boa qualidade · 2400 × 2400 px" / "Pode ficar levemente borrada no tamanho Centro da frente". */
export function imageQualityLabel(quality: ImageQuality, dims: ImageDims | null, area: StoreCustomArea): string {
  if (quality === 'warn') return `Pode ficar levemente borrada no tamanho ${area.name}`;
  return dims ? `Boa qualidade · ${dims.widthPx} × ${dims.heightPx} px` : 'Boa qualidade · vetor';
}

/** Título do passo pela área escolhida: só a manga sai da frente. */
export function imageStepTitle(area: StoreCustomArea | null): string {
  return area?.id === 'manga' ? 'Imagem na manga' : 'Imagem na frente';
}

/** "9 × 9 cm". */
export function areaSizeLabel(area: StoreCustomArea): string {
  const cm = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${cm(area.widthCm)} × ${cm(area.heightCm)} cm`;
}

// ── Ajuste fino (transform relativo à área) ───────────────────────

/** `x, y` = centro da imagem na área (0–1); `scale` = largura da imagem ÷ largura da área. */
export interface ImageTransform {
  x: number;
  y: number;
  scale: number;
}

export const MIN_IMAGE_SCALE = 0.1;

/** Altura da imagem em fração da altura da área, para um `scale`. */
export function imageHeightFraction(scale: number, aspect: number, area: Pick<StoreCustomArea, 'widthCm' | 'heightCm'>): number {
  return (scale * area.widthCm) / (aspect * area.heightCm);
}

/** Maior `scale` com a imagem inteira dentro da área (proporção travada). */
export function maxImageScale(aspect: number, area: Pick<StoreCustomArea, 'widthCm' | 'heightCm'>): number {
  return Math.min(1, (aspect * area.heightCm) / area.widthCm);
}

/**
 * Prende a imagem dentro da área: `scale` entre 0,1 e o que cabe, centro sem deixar borda pra fora.
 * `aspect` = largura ÷ altura da imagem.
 */
export function clampTransform(
  t: ImageTransform,
  aspect: number,
  area: Pick<StoreCustomArea, 'widthCm' | 'heightCm'>,
): ImageTransform {
  const max = maxImageScale(aspect, area);
  const scale = Math.min(max, Math.max(Math.min(MIN_IMAGE_SCALE, max), t.scale));
  const halfW = scale / 2;
  const halfH = imageHeightFraction(scale, aspect, area) / 2;
  const clamp = (v: number, half: number) => Math.min(1 - half, Math.max(half, v));
  return { x: clamp(t.x, halfW), y: clamp(t.y, halfH), scale };
}

/** Imagem nova ou área nova: centralizada, no maior tamanho que cabe. */
export function fitTransform(aspect: number, area: Pick<StoreCustomArea, 'widthCm' | 'heightCm'>): ImageTransform {
  return clampTransform({ x: 0.5, y: 0.5, scale: 1 }, aspect, area);
}

// ── Prévia ─────────────────────────────────────────────────────────

/** Peça de referência da prévia, em cm. */
export const GARMENT_CM = { width: 60, height: 70 } as const;

export interface PreviewBox {
  /** Centro e tamanho em fração do quadro (0–1). */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const AREA_CENTERS: Readonly<Record<string, readonly [number, number]>> = {
  // Esquerdo de quem veste = direita de quem olha.
  peito_esquerdo: [0.68, 0.3],
  centro_frente: [0.5, 0.45],
  manga: [0.88, 0.24],
};

export function areaPreviewBox(area: StoreCustomArea): PreviewBox {
  const [cx, cy] = AREA_CENTERS[area.id] ?? [0.5, 0.4];
  return {
    cx,
    cy,
    w: Math.min(1, area.widthCm / GARMENT_CM.width),
    h: Math.min(1, area.heightCm / GARMENT_CM.height),
  };
}

const NAME_CENTERS: Readonly<Record<StoreNamePlacement, readonly [number, number]>> = {
  costas_superior: [0.5, 0.24],
  costas_inferior: [0.5, 0.62],
  frente: [0.5, 0.3],
  manga: [0.88, 0.24],
};

/** Faixa do nome: 60% da largura do quadro (a manga é estreita: 18%). */
export function namePreviewBox(placement: StoreNamePlacement): PreviewBox {
  const [cx, cy] = NAME_CENTERS[placement];
  return { cx, cy, w: placement === 'manga' ? 0.18 : 0.6, h: 0.15 };
}

/**
 * Tamanho da fonte do nome em fração da largura do quadro: 8,8% até caber numa linha da faixa.
 * 0,85 em por letra cobre a fonte mais larga (Bloco 800 com espaçamento).
 */
export function nameFontFraction(length: number, bandWidth: number): number {
  return Math.min(0.088 * (bandWidth / 0.6), (bandWidth * 0.95) / (Math.max(1, length) * 0.85));
}

/**
 * Foto da cor e do lado; senão a do lado sem cor; senão a do lado em OUTRA cor (a peça cadastrada
 * só com fotos de uma cor — a tela avisa a cor com `previewPhotoNote`); nenhuma do lado → `null`
 * (fundo listrado na cor da peça).
 */
export function previewPhoto(p: StoreProduct, colorValueId: string | null, side: StorePhotoView): StorePhoto | null {
  const ofSide = p.photos.filter((ph) => ph.view === side);
  return (
    ofSide.find((ph) => colorValueId !== null && ph.colorValueId === colorValueId) ??
    ofSide.find((ph) => ph.colorValueId === null) ??
    ofSide[0] ??
    null
  );
}

/** "Foto em Preto · a sua sai em Branco areia" quando a prévia usa a foto de outra cor; senão `null`. */
export function previewPhotoNote(p: StoreProduct, colorValueId: string | null, side: StorePhotoView): string | null {
  const ph = previewPhoto(p, colorValueId, side);
  if (!ph || colorValueId === null || ph.colorValueId === null || ph.colorValueId === colorValueId) return null;
  const label = (id: string) =>
    p.axes.flatMap((a) => a.values).find((v) => v.id === id)?.label ?? id;
  return `Foto em ${label(ph.colorValueId)} · a sua sai em ${label(colorValueId)}`;
}

// ── Nota de produção ──────────────────────────────────────────────

export interface ProductionNote {
  before: string;
  days: string;
  after: string;
}

/** "Feito sob demanda: fica pronto em **5 dias úteis** depois que a arte é aprovada. …" */
export function productionNote(c: Pick<StoreCustomization, 'leadDays' | 'defectOnlyReturns'>): ProductionNote {
  return {
    before: 'Feito sob demanda: fica pronto em ',
    days: `${c.leadDays} ${c.leadDays === 1 ? 'dia útil' : 'dias úteis'}`,
    after:
      ' depois que a arte é aprovada.' + (c.defectOnlyReturns ? ' Personalizados só têm troca em caso de defeito.' : ''),
  };
}

/** Tem pelo menos uma opção que o cliente mostra. */
export function hasCustomOptions(c: StoreCustomization | null): c is StoreCustomization {
  return c !== null && (c.name.enabled || c.image.enabled);
}
