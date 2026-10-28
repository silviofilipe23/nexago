import type {
  InscricoesStory,
  StoryAvatar,
  StoryEntry,
  StoryPage,
  StoryTheme,
} from './inscricoes-story';

/**
 * Arte "duplas inscritas" para o Stories, desenhada em canvas 1080×1920 — o PNG que sai é o
 * próprio canvas da prévia, então o que o organizador vê é o que posta.
 *
 * Medidas do protótipo (`og-screens-share-story.jsx`, artboards 22f–22h). As linhas de base
 * saem das métricas das fontes (Sora: ascent .97 / descent .29; JetBrains Mono: 1.02 / .30),
 * reproduzindo onde o CSS do protótipo põe cada texto.
 */

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const LEFT = 80;
const RIGHT = STORY_WIDTH - 80;
const CONTENT_W = RIGHT - LEFT;

interface Palette {
  bg: string;
  fg: string;
  mu: string;
  /** "GO", "INSCRITAS" e o número da linha. */
  accent: string;
  number: string;
  line: string;
  av: string;
  av2: string;
  avFg: string;
  chipBg: string;
  chipFg: string;
  ctaBg: string;
  ctaFg: string;
  /** Cor chapada da marca "N"; `null` = a marca original (laranja). */
  markTint: string | null;
}

const PALETTES: Record<StoryTheme, Palette> = {
  dark: {
    bg: '#050505',
    fg: '#F4F4F5',
    mu: 'rgba(244, 244, 245, 0.62)',
    accent: '#FF6A1A',
    number: '#FF6A1A',
    line: 'rgba(255, 255, 255, 0.10)',
    av: '#22222A',
    av2: '#2B2B34',
    avFg: '#F4F4F5',
    chipBg: 'rgba(255, 106, 26, 0.14)',
    chipFg: '#FF6A1A',
    ctaBg: '#FF6A1A',
    ctaFg: '#0A0A0A',
    markTint: null,
  },
  orange: {
    bg: '#FF6A1A',
    fg: '#0A0A0A',
    mu: 'rgba(10, 10, 10, 0.66)',
    accent: '#0A0A0A',
    number: 'rgba(10, 10, 10, 0.66)',
    line: 'rgba(10, 10, 10, 0.16)',
    av: '#0A0A0A',
    av2: '#1D1D22',
    avFg: '#F4F4F5',
    chipBg: '#0A0A0A',
    chipFg: '#FF6A1A',
    ctaBg: '#0A0A0A',
    ctaFg: '#FF6A1A',
    // A marca é laranja com o "N" vazado: no fundo laranja ela sumia inteira. Em preto, o "N"
    // aparece no laranja do fundo.
    markTint: '#0A0A0A',
  },
};

const sora = (weight: number, size: number) => `${weight} ${size}px "Sora", system-ui, sans-serif`;
const mono = (weight: number, size: number) =>
  `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;

const SORA_ASCENT = 0.97;
const SORA_LINE = 1.26;
const MONO_ASCENT = 1.02;
const MONO_LINE = 1.32;

/** Linha de base de um texto centrado verticalmente em `centerY` (como o `align-items: center`
 *  do protótipo faz com a caixa de linha). */
function soraBaseline(centerY: number, size: number): number {
  return centerY - (SORA_LINE * size) / 2 + SORA_ASCENT * size;
}

function monoBaseline(centerY: number, size: number): number {
  return centerY - (MONO_LINE * size) / 2 + MONO_ASCENT * size;
}

export interface StoryArtAssets {
  background: HTMLImageElement | null;
  mark: HTMLImageElement | null;
}

const BACKGROUND_SRC = '/brand/story-bg-dark.jpg';
const MARK_SRC = '/brand/logo.png';

/** Imagens do mesmo domínio (não sujam o canvas). Falhar em carregar resolve `null`: a arte sai
 *  sem a textura ou sem a marca, mas sai. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let assetsPromise: Promise<StoryArtAssets> | null = null;

/** Fontes e imagens da arte, carregadas uma vez por sessão. Sem esperar as fontes, o primeiro
 *  desenho sai na fonte de reserva e com outra cara. */
export function loadStoryAssets(): Promise<StoryArtAssets> {
  assetsPromise ??= (async () => {
    const fonts = [sora(700, 36), sora(800, 128), mono(500, 28), mono(700, 28), mono(400, 26)];
    await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => [])));
    const [background, mark] = await Promise.all([loadImage(BACKGROUND_SRC), loadImage(MARK_SRC)]);
    return { background, mark };
  })();
  return assetsPromise;
}

/** Fotos de atleta já carregadas, por URL. */
export type StoryPhotos = ReadonlyMap<string, HTMLImageElement>;

/** Foto que demora mais que isso sai com as iniciais — a arte não fica presa esperando. */
const PHOTO_TIMEOUT_MS = 8000;

const photoCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Foto do Storage: precisa de \`crossOrigin\` — sem ele o canvas fica "sujo" e o PNG não sai.
 *  Bucket sem CORS, foto apagada ou lenta resolve \`null\` e o avatar cai nas iniciais, em
 *  silêncio. A falha também fica no cache: redesenhar a cada ajuste não espera de novo. */
function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  let promise = photoCache.get(url);
  if (!promise) {
    promise = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), PHOTO_TIMEOUT_MS);
      img.onload = () => {
        clearTimeout(timer);
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });
    photoCache.set(url, promise);
  }
  return promise;
}

/** As fotos de uma página (até 8 duplas × 2, ou 3 por equipe), em paralelo. */
export async function loadStoryPhotos(page: StoryPage): Promise<StoryPhotos> {
  const urls = [
    ...new Set(page.entries.flatMap((e) => e.avatars.map((a) => a.photoUrl)).filter((u) => !!u)),
  ] as string[];
  const loaded = await Promise.all(urls.map(async (url) => [url, await loadPhoto(url)] as const));
  return new Map(loaded.filter((pair): pair is [string, HTMLImageElement] => pair[1] !== null));
}

/** Espaçamento entre letras desenhado letra a letra — só para a fonte mono, onde não existe
 *  kerning a perder. `letterSpacing` do canvas ainda não é universal. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  return chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): void {
  ctx.textAlign = 'left';
  let cur = x;
  for (const c of text) {
    ctx.fillText(c, cur, y);
    cur += ctx.measureText(c).width + spacing;
  }
}

/** Corta com reticências até caber — a garantia de encaixe que reduzir a fonte não dá. */
function truncateTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  spacing: number,
): string {
  if (trackedWidth(ctx, text, spacing) <= maxWidth) return text;
  let chars = [...text];
  while (
    chars.length > 1 &&
    trackedWidth(ctx, `${chars.join('').trimEnd()}…`, spacing) > maxWidth
  ) {
    chars = chars.slice(0, -1);
  }
  return `${chars.join('').trimEnd()}…`;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  return truncateTracked(ctx, text, maxWidth, 0);
}

/** Tracking negativo das fontes de display (Sora) onde o navegador suporta — com kerning. */
function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ('letterSpacing' in ctx)
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: StoryTheme,
  p: Palette,
  assets: StoryArtAssets,
): void {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  if (theme === 'dark') {
    const img = assets.background;
    // A textura tem 608px de altura. O degradê do protótipo só fecha em 40% (768px), e o canto
    // laranja da textura vazava como um degrau na borda dela — aqui ele fecha onde ela acaba.
    let opaqueAt = 0.4;
    if (img) {
      const h = (STORY_WIDTH * img.naturalHeight) / img.naturalWidth;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, 0, 0, STORY_WIDTH, h);
      ctx.globalAlpha = 1;
      opaqueAt = Math.min(opaqueAt, h / STORY_HEIGHT);
    }
    const fade = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    fade.addColorStop(0, 'rgba(5, 5, 5, 0.5)');
    fade.addColorStop(Math.min(0.26, opaqueAt * 0.8), 'rgba(5, 5, 5, 0.85)');
    fade.addColorStop(opaqueAt, '#050505');
    fade.addColorStop(1, '#050505');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
    return;
  }
  // `repeating-linear-gradient(-52deg, …05 0 3px, transparent 3px 110px)`: faixas de 3px a cada
  // 110px, perpendiculares ao eixo de -52°.
  ctx.save();
  ctx.translate(STORY_WIDTH / 2, STORY_HEIGHT / 2);
  ctx.rotate((-52 * Math.PI) / 180);
  ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
  const reach = Math.hypot(STORY_WIDTH, STORY_HEIGHT);
  for (let y = -reach; y < reach; y += 110) ctx.fillRect(-reach, y, reach * 2, 3);
  ctx.restore();
}

function tintedMark(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const c = canvas.getContext('2d');
  if (c) {
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  page: StoryPage,
  p: Palette,
  assets: StoryArtAssets,
): void {
  const centerY = 190 + 26;
  let x = LEFT;
  if (assets.mark) {
    ctx.drawImage(p.markTint ? tintedMark(assets.mark, p.markTint) : assets.mark, x, 190, 52, 52);
    x += 52 + 16;
  }
  ctx.font = sora(700, 38);
  ctx.textAlign = 'left';
  setLetterSpacing(ctx, -0.76);
  const baseline = soraBaseline(centerY, 38);
  ctx.fillStyle = p.fg;
  ctx.fillText('nexa', x, baseline);
  ctx.fillStyle = p.accent;
  ctx.fillText('GO', x + ctx.measureText('nexa').width, baseline);
  setLetterSpacing(ctx, 0);

  if (page.total > 1) {
    const label = `${page.index + 1}/${page.total}`;
    ctx.font = mono(700, 26);
    ctx.fillStyle = p.mu;
    drawTracked(
      ctx,
      label,
      RIGHT - trackedWidth(ctx, label, 3.12),
      monoBaseline(centerY, 26),
      3.12,
    );
  }
}

/** Nome do evento, título de duas linhas e a linha da categoria — o bloco que começa em y=310. */
function drawTitleBlock(ctx: CanvasRenderingContext2D, story: InscricoesStory, p: Palette): void {
  // Nome de torneio longo encolhe até 22px (mesma linha de base) e só então é cortado.
  const eventName = story.eventName.toLocaleUpperCase('pt-BR');
  let eventSize = 28;
  ctx.font = mono(500, eventSize);
  while (eventSize > 22 && trackedWidth(ctx, eventName, eventSize * 0.24) > CONTENT_W) {
    eventSize -= 1;
    ctx.font = mono(500, eventSize);
  }
  ctx.fillStyle = p.mu;
  const tracking = eventSize * 0.24;
  drawTracked(
    ctx,
    truncateTracked(ctx, eventName, CONTENT_W, tracking),
    LEFT,
    310 + MONO_ASCENT * 28,
    tracking,
  );

  // line-height .92 em 128px: a caixa de linha (117.76) é menor que a da fonte (161.28), e a
  // linha de base fica 102.4px abaixo do topo de cada linha.
  const titleTop = 310 + MONO_LINE * 28 + 26;
  ctx.font = sora(800, 128);
  ctx.textAlign = 'left';
  setLetterSpacing(ctx, -4.48);
  ctx.fillStyle = p.fg;
  ctx.fillText(story.unitTitle, LEFT, titleTop + 102.4);
  ctx.fillStyle = p.accent;
  ctx.fillText(story.unitVerb, LEFT, titleTop + 117.76 + 102.4);
  setLetterSpacing(ctx, 0);

  const rowTop = titleTop + 117.76 * 2 + 26 + 6;
  const chipH = SORA_LINE * 30 + 24;
  const centerY = rowTop + chipH / 2;

  const details = [story.dateLabel, story.place]
    .filter((v): v is string => !!v?.trim())
    .join(' · ');
  ctx.font = mono(400, 26);
  const detailsW = details ? ctx.measureText(details).width : 0;

  // A categoria tem prioridade, mas não engole a linha: reserva ao menos 260px para data e local.
  ctx.font = sora(700, 30);
  const chipTextMax = details
    ? Math.max(260, CONTENT_W - 48 - 18 - Math.min(detailsW, 260))
    : CONTENT_W - 48;
  const category = truncate(ctx, story.categoryName, chipTextMax);
  const chipW = ctx.measureText(category).width + 48;
  ctx.fillStyle = p.chipBg;
  pill(ctx, LEFT, rowTop, chipW, chipH);
  ctx.fillStyle = p.chipFg;
  ctx.fillText(category, LEFT + 24, rowTop + 12 + SORA_ASCENT * 30);

  if (details) {
    ctx.font = mono(400, 26);
    ctx.fillStyle = p.mu;
    const x = LEFT + chipW + 18;
    ctx.fillText(truncate(ctx, details, RIGHT - x), x, monoBaseline(centerY, 26));
  }
}

const AVATAR_R = 35;
/** Distância entre os centros dos avatares sobrepostos. O protótipo usava 52 (o de cima cobria
 *  22px do outro), o que com foto escondia metade do rosto; com 58 sobram 16px de sobreposição. */
const AVATAR_STEP = 58;

/** Foto recortada no círculo, preenchendo-o (como \`object-fit: cover\`). */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
): void {
  const d = AVATAR_R * 2;
  const scale = Math.max(d / img.naturalWidth, d / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_R, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

/** \`textShift\` desloca as iniciais para a parte visível: o avatar seguinte cobre a direita
 *  deste, e centradas no círculo inteiro elas ficavam cortadas ("CN" virava "CI"). */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  avatar: StoryAvatar,
  fill: string,
  p: Palette,
  photos: StoryPhotos,
  textShift = 0,
): void {
  // Anel de 4px na cor do fundo: separa os avatares sobrepostos (o \`box-shadow\` do protótipo).
  ctx.fillStyle = p.bg;
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_R + 4, 0, Math.PI * 2);
  ctx.fill();
  const photo = avatar.photoUrl ? photos.get(avatar.photoUrl) : undefined;
  if (photo) {
    drawPhoto(ctx, photo, cx, cy);
    return;
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, AVATAR_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = sora(700, 25);
  ctx.fillStyle = p.avFg;
  ctx.textAlign = 'center';
  ctx.fillText(avatar.initials, cx + textShift, soraBaseline(cy, 25));
  ctx.textAlign = 'left';
}

function drawEntry(
  ctx: CanvasRenderingContext2D,
  entry: StoryEntry,
  top: number,
  last: boolean,
  p: Palette,
  photos: StoryPhotos,
): void {
  const centerY = top + 50;
  ctx.font = mono(700, 28);
  ctx.fillStyle = p.number;
  ctx.textAlign = 'left';
  ctx.fillText(String(entry.position).padStart(2, '0'), LEFT, monoBaseline(centerY, 28));

  // 54px do número + 26 de vão; os avatares se sobrepõem (\`AVATAR_STEP\`).
  const avatarsX = LEFT + 54 + 26;
  const avatars: StoryAvatar[] =
    entry.avatars.length > 0 ? entry.avatars : [{ initials: '', photoUrl: null }];
  avatars.forEach((avatar, i) =>
    drawAvatar(
      ctx,
      avatarsX + AVATAR_R + i * AVATAR_STEP,
      centerY,
      avatar,
      i % 2 === 0 ? p.av : p.av2,
      p,
      photos,
      i < avatars.length - 1 ? -8 : 0,
    ),
  );

  const nameX = avatarsX + AVATAR_R * 2 + (avatars.length - 1) * AVATAR_STEP + 26;
  let size = 36;
  ctx.font = sora(700, size);
  setLetterSpacing(ctx, -0.36);
  while (size > 28 && ctx.measureText(entry.label).width > RIGHT - nameX) {
    size -= 2;
    ctx.font = sora(700, size);
  }
  ctx.fillStyle = p.fg;
  ctx.fillText(truncate(ctx, entry.label, RIGHT - nameX), nameX, soraBaseline(centerY, size));
  setLetterSpacing(ctx, 0);

  if (!last) {
    ctx.fillStyle = p.line;
    ctx.fillRect(LEFT, top + 99, CONTENT_W, 1);
  }
}

function drawList(
  ctx: CanvasRenderingContext2D,
  story: InscricoesStory,
  page: StoryPage,
  p: Palette,
  photos: StoryPhotos,
): void {
  if (page.entries.length === 0) {
    ctx.font = sora(700, 44);
    ctx.fillStyle = p.mu;
    ctx.textAlign = 'center';
    ctx.fillText(`Nenhuma ${story.unit} por aqui ainda`, STORY_WIDTH / 2, soraBaseline(1160, 44));
    ctx.textAlign = 'left';
    return;
  }
  page.entries.forEach((entry, i) =>
    drawEntry(ctx, entry, 760 + i * 100, i === page.entries.length - 1, p, photos),
  );
}

function plural(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
}

/** Linha miúda sob o número do rodapé — também explica por que não há "Inscreva-se". */
function footerCaption(story: InscricoesStory): string | null {
  const spots = story.spotsLeft;
  if (spots != null) return spots === 1 ? 'RESTANTE NA CATEGORIA' : 'RESTANTES NA CATEGORIA';
  if (story.closedReason === 'lotada') return 'CATEGORIA LOTADA';
  if (story.closedReason === 'encerradas') return 'INSCRIÇÕES ENCERRADAS';
  return null;
}

function drawFooter(ctx: CanvasRenderingContext2D, story: InscricoesStory, p: Palette): void {
  const top = 1600;
  const spots = story.spotsLeft;
  const caption = footerCaption(story);
  const leftH = caption ? SORA_LINE * 52 + 8 + MONO_LINE * 24 : SORA_LINE * 52;
  const rowH = Math.max(leftH, story.cta ? 96 : 0);
  const centerY = top + rowH / 2;
  const leftTop = centerY - leftH / 2;

  ctx.textAlign = 'left';
  ctx.font = sora(800, 52);
  setLetterSpacing(ctx, -1.04);
  ctx.fillStyle = p.fg;
  ctx.fillText(
    spots != null ? plural(spots, 'vaga') : plural(story.count, story.unit),
    LEFT,
    leftTop + SORA_ASCENT * 52,
  );
  setLetterSpacing(ctx, 0);
  if (caption) {
    ctx.font = mono(400, 24);
    ctx.fillStyle = p.mu;
    drawTracked(ctx, caption, LEFT, leftTop + SORA_LINE * 52 + 8 + MONO_ASCENT * 24, 4.32);
  }

  if (story.cta) {
    ctx.font = sora(800, 34);
    const label = 'Inscreva-se ↑';
    const w = ctx.measureText(label).width + 80;
    ctx.fillStyle = p.ctaBg;
    pill(ctx, RIGHT - w, centerY - 48, w, 96);
    ctx.fillStyle = p.ctaFg;
    ctx.fillText(label, RIGHT - w + 40, soraBaseline(centerY, 34));
  }
}

/** Desenha uma página. Síncrono: quem chama já esperou \`loadStoryAssets()\` e as fotos da
 *  página (\`loadStoryPhotos\`); avatar sem foto no mapa sai com as iniciais. */
export function drawInscricoesStory(
  ctx: CanvasRenderingContext2D,
  story: InscricoesStory,
  page: StoryPage,
  theme: StoryTheme,
  assets: StoryArtAssets,
  photos: StoryPhotos = new Map(),
): void {
  const p = PALETTES[theme];
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx, theme, p, assets);
  drawHeader(ctx, page, p, assets);
  drawTitleBlock(ctx, story, p);
  drawList(ctx, story, page, p, photos);
  drawFooter(ctx, story, p);
  ctx.restore();
}

/** Uma página em PNG, num canvas descartável, já com as fotos dos atletas. */
export async function renderStoryPng(
  story: InscricoesStory,
  page: StoryPage,
  theme: StoryTheme,
  assets: StoryArtAssets,
): Promise<Blob | null> {
  const photos = await loadStoryPhotos(page);
  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawInscricoesStory(ctx, story, page, theme, assets, photos);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
