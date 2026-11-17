import {
  bookingStoryCrewCaption,
  bookingStoryCrewNames,
  bookingStoryHeadline,
  bookingStoryPill,
  bookingStoryThemeHasImage,
  type BookingStory,
  type BookingStoryOptions,
  type BookingStoryPerson,
} from './booking-story';

/**
 * Arte 9:16 do story da reserva, desenhada em canvas 1080×1920 — o PNG que sai é o próprio canvas
 * da prévia, então o que a arena vê é o que posta.
 *
 * Porte do `BookingStoryCard` do app (base 360×640 capturada em 3×): marca + selo no topo (92),
 * o bloco de conteúdo ancorado embaixo (124, fora da caixa de resposta do story) crescendo para
 * cima, e o rodapé (92). As medidas abaixo já estão em 3×.
 */

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const SCALE = 3;
const LEFT = 24 * SCALE;
const RIGHT = STORY_WIDTH - 24 * SCALE;
const CONTENT_W = RIGHT - LEFT;
const TOP = 92 * SCALE;
const BLOCKS_BOTTOM = STORY_HEIGHT - 124 * SCALE;
const FOOTER_BOTTOM = STORY_HEIGHT - 92 * SCALE;
const BLOCK_GAP = 14 * SCALE;

const BRAND = '#FF6A1A';
const BRAND_HOVER = '#FF8A4C';
const DARK_INK = '#F4F4F5';
const LIGHT_INK = '#140A03';
const CANVAS = '#0B0B0C';

const SORA_ASCENT = 0.97;
const MONO_ASCENT = 1.02;

const sora = (weight: number, size: number) => `${weight} ${size}px "Sora", system-ui, sans-serif`;
const mono = (weight: number, size: number) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;

interface Palette {
  light: boolean;
  ink: string;
  sub: string;
  sport: string;
  pillBg: string;
  pillFg: string;
  divider: string;
  avatarBorder: string;
}

function paletteOf(options: BookingStoryOptions): Palette {
  const light = options.theme === 'sand';
  return light
    ? {
        light,
        ink: LIGHT_INK,
        sub: 'rgba(20, 10, 3, 0.72)',
        sport: LIGHT_INK,
        pillBg: LIGHT_INK,
        pillFg: '#E9D3B0',
        divider: 'rgba(20, 10, 3, 0.18)',
        avatarBorder: '#D8B686',
      }
    : {
        light,
        ink: DARK_INK,
        sub: 'rgba(244, 244, 245, 0.78)',
        sport: BRAND_HOVER,
        pillBg: '#22C55E',
        pillFg: '#062514',
        divider: 'rgba(255, 255, 255, 0.16)',
        avatarBorder: CANVAS,
      };
}

export interface BookingStoryAssets {
  mark: HTMLImageElement | null;
}

/** Fotos já carregadas, por URL (capa da arena e avatares). */
export type BookingStoryImages = ReadonlyMap<string, HTMLImageElement>;

const MARK_SRC = '/brand/logo.png';
/** Foto que demora mais que isso fica de fora — a arte não fica presa esperando. */
const PHOTO_TIMEOUT_MS = 8000;

function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), PHOTO_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

let assetsPromise: Promise<BookingStoryAssets> | null = null;

/** Fontes e a marca, uma vez por sessão. Sem esperar as fontes, o primeiro desenho sai na fonte
 *  de reserva e com outra cara. */
export function loadBookingStoryAssets(): Promise<BookingStoryAssets> {
  assetsPromise ??= (async () => {
    const fonts = [sora(800, 174), sora(700, 39), sora(500, 39), mono(800, 78), mono(400, 33), mono(800, 27)];
    await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => [])));
    return { mark: await loadImage(MARK_SRC, false) };
  })();
  return assetsPromise;
}

const photoCache = new Map<string, Promise<HTMLImageElement | null>>();

/** Fotos do Storage precisam de `crossOrigin` — sem ele o canvas fica "sujo" e o PNG não sai.
 *  Bucket sem CORS, foto apagada ou lenta resolve `null` (avatar cai nas iniciais; a capa some
 *  das opções). A falha fica no cache: redesenhar não espera de novo. */
export function loadBookingStoryPhoto(url: string): Promise<HTMLImageElement | null> {
  let promise = photoCache.get(url);
  if (!promise) {
    promise = loadImage(url, true);
    photoCache.set(url, promise);
  }
  return promise;
}

/** As fotos dos jogadores que aparecem na arte (no máximo 4 avatares). */
export async function loadBookingStoryCrewPhotos(crew: readonly BookingStoryPerson[]): Promise<BookingStoryImages> {
  const urls = [...new Set(crew.slice(0, MAX_AVATARS).map((p) => p.photoUrl).filter((u): u is string => !!u))];
  const loaded = await Promise.all(urls.map(async (url) => [url, await loadBookingStoryPhoto(url)] as const));
  return new Map(loaded.filter((pair): pair is [string, HTMLImageElement] => pair[1] !== null));
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Corta com reticências até caber (mede com a `ctx.font` e o espaçamento correntes). */
export function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join('').trimEnd()}…`).width > maxWidth) {
    chars = chars.slice(0, -1);
  }
  return `${chars.join('').trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Imagem preenchendo a área (como `object-fit: cover`). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Fundo sempre opaco: começa chapado e só depois vêm brilho/foto (PNG transparente some no
 *  Instagram — armadilha vista no app). */
function drawBackground(ctx: CanvasRenderingContext2D, options: BookingStoryOptions, backdrop: HTMLImageElement | null): void {
  ctx.fillStyle = CANVAS;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  if (bookingStoryThemeHasImage(options.theme)) {
    if (backdrop) drawCover(ctx, backdrop, 0, 0, STORY_WIDTH, STORY_HEIGHT);
    // Escurece topo e base para o texto ler sobre qualquer foto. O bloco de texto começa por
    // volta de 39% da altura: com foto clara (céu, areia), o escurecimento precisa já estar
    // forte ali, senão o título branco e a modalidade laranja somem.
    const scrim = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    scrim.addColorStop(0, 'rgba(5, 5, 5, 0.55)');
    scrim.addColorStop(0.2, 'rgba(5, 5, 5, 0)');
    scrim.addColorStop(0.28, 'rgba(5, 5, 5, 0.05)');
    scrim.addColorStop(0.42, 'rgba(5, 5, 5, 0.62)');
    scrim.addColorStop(0.6, 'rgba(5, 5, 5, 0.85)');
    scrim.addColorStop(1, 'rgba(5, 5, 5, 0.94)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
    return;
  }
  switch (options.theme) {
    case 'ember': {
      const glow = ctx.createRadialGradient(864, 192, 0, 864, 192, STORY_WIDTH * 1.4);
      glow.addColorStop(0, BRAND);
      glow.addColorStop(0.45, '#7A2A05');
      glow.addColorStop(1, '#120703');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
      return;
    }
    case 'night': {
      const glow = ctx.createRadialGradient(540, 538, 0, 540, 538, 810);
      glow.addColorStop(0, 'rgba(255, 106, 26, 0.28)');
      glow.addColorStop(0.7, 'rgba(255, 106, 26, 0)');
      glow.addColorStop(1, 'rgba(255, 106, 26, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
      return;
    }
    case 'sand': {
      const sand = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
      sand.addColorStop(0, '#E9D3B0');
      sand.addColorStop(1, '#C99A62');
      ctx.fillStyle = sand;
      ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
      return;
    }
  }
}

/** Marca + "nexaGO" à esquerda, selo à direita, na linha y=92. */
function drawHeader(ctx: CanvasRenderingContext2D, story: BookingStory, p: Palette, assets: BookingStoryAssets): void {
  const size = 18 * SCALE;
  const centerY = TOP + size / 2;
  let x = LEFT;
  if (assets.mark) {
    ctx.drawImage(assets.mark, x, TOP, size, size);
    x += size + 6 * SCALE;
  }
  ctx.font = sora(800, size);
  setLetterSpacing(ctx, -0.36 * SCALE);
  const baseline = centerY + (SORA_ASCENT - 0.5) * size * 0.9;
  ctx.fillStyle = p.ink;
  ctx.fillText('nexa', x, baseline);
  const nexaW = ctx.measureText('nexa').width;
  ctx.fillStyle = p.light ? p.ink : BRAND;
  ctx.fillText('GO', x + nexaW, baseline);
  const wordmarkEnd = x + nexaW + ctx.measureText('GO').width;
  setLetterSpacing(ctx, 0);

  const label = bookingStoryPill(story.moment);
  const font = 9 * SCALE;
  ctx.font = mono(800, font);
  setLetterSpacing(ctx, 1.08 * SCALE);
  const maxTextW = RIGHT - wordmarkEnd - 12 * SCALE - 18 * SCALE;
  const text = truncateToWidth(ctx, label, maxTextW);
  const textW = ctx.measureText(text).width;
  const padX = 9 * SCALE;
  const h = font + 10 * SCALE;
  const w = textW + padX * 2;
  ctx.fillStyle = p.pillBg;
  roundRect(ctx, RIGHT - w, centerY - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = p.pillFg;
  ctx.fillText(text, RIGHT - w + padX, centerY + font * 0.36);
  setLetterSpacing(ctx, 0);
}

/** Um bloco do conteúdo: a altura vem antes, para empilhar de baixo para cima. */
interface Block {
  height: number;
  draw: (top: number) => void;
}

function sportBlock(ctx: CanvasRenderingContext2D, label: string, p: Palette): Block {
  const size = 10 * SCALE;
  return {
    height: size * 1.32,
    draw: (top) => {
      ctx.font = mono(400, size);
      setLetterSpacing(ctx, 1.6 * SCALE);
      ctx.fillStyle = p.sport;
      ctx.fillText(truncateToWidth(ctx, label, CONTENT_W), LEFT, top + MONO_ASCENT * size);
      setLetterSpacing(ctx, 0);
    },
  };
}

function headlineBlock(ctx: CanvasRenderingContext2D, story: BookingStory, p: Palette): Block {
  const size = 58 * SCALE;
  const line = size * 0.92;
  const [first, second] = bookingStoryHeadline(story.moment);
  return {
    height: line * 2,
    draw: (top) => {
      ctx.font = sora(800, size);
      setLetterSpacing(ctx, -2.32 * SCALE);
      ctx.fillStyle = p.ink;
      // line-height .92: a linha de base fica ~0.8em abaixo do topo de cada linha.
      ctx.fillText(first, LEFT, top + size * 0.8);
      ctx.fillText(second, LEFT, top + line + size * 0.8);
      setLetterSpacing(ctx, 0);
    },
  };
}

function timeBlock(ctx: CanvasRenderingContext2D, story: BookingStory, p: Palette): Block {
  const size = 26 * SCALE;
  const small = 11 * SCALE;
  return {
    height: size * 1.2,
    draw: (top) => {
      const baseline = top + size * 0.98;
      ctx.font = mono(800, size);
      setLetterSpacing(ctx, -0.52 * SCALE);
      ctx.fillStyle = p.ink;
      const time = truncateToWidth(ctx, story.timeRange, CONTENT_W);
      ctx.fillText(time, LEFT, baseline);
      const x = LEFT + ctx.measureText(time).width + 10 * SCALE;
      ctx.font = mono(400, small);
      setLetterSpacing(ctx, 1.1 * SCALE);
      ctx.fillStyle = p.sub;
      if (RIGHT - x > small * 2) ctx.fillText(truncateToWidth(ctx, story.dateLabel, RIGHT - x), x, baseline);
      setLetterSpacing(ctx, 0);
    },
  };
}

const PIN = new Map<string, Path2D>();
function pinPaths(): Path2D[] {
  if (!PIN.has('body')) {
    PIN.set('body', new Path2D('M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'));
    PIN.set('dot', new Path2D('M15 10a3 3 0 1 1-6 0a3 3 0 0 1 6 0'));
  }
  return [PIN.get('body')!, PIN.get('dot')!];
}

/** Pino + arena (negrito) · quadra. Nome longo: a quadra desce para a segunda linha. */
function arenaBlock(ctx: CanvasRenderingContext2D, story: BookingStory, p: Palette): Block {
  const size = 13 * SCALE;
  const lineH = size * 1.35;
  const iconW = 14 * SCALE;
  const textX = LEFT + iconW + 6 * SCALE;
  const maxW = RIGHT - textX;

  ctx.font = sora(700, size);
  const arenaW = ctx.measureText(story.arenaName).width;
  ctx.font = sora(500, size);
  const courtText = story.courtName ? `  ·  ${story.courtName}` : '';
  const oneLine = arenaW + ctx.measureText(courtText).width <= maxW;
  const twoLines = !!courtText && !oneLine;

  return {
    height: lineH * (twoLines ? 2 : 1),
    draw: (top) => {
      const baseline = top + (lineH - size) / 2 + SORA_ASCENT * size * 0.95;
      ctx.save();
      ctx.translate(LEFT, top + (lineH - iconW) / 2);
      ctx.scale(iconW / 24, iconW / 24);
      ctx.strokeStyle = p.sub;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const path of pinPaths()) ctx.stroke(path);
      ctx.restore();

      ctx.font = sora(700, size);
      ctx.fillStyle = p.ink;
      const arena = truncateToWidth(ctx, story.arenaName, maxW);
      ctx.fillText(arena, textX, baseline);
      if (!courtText) return;
      ctx.font = sora(500, size);
      ctx.fillStyle = p.sub;
      if (oneLine) {
        ctx.font = sora(700, size);
        const arenaDrawnW = ctx.measureText(arena).width;
        ctx.font = sora(500, size);
        ctx.fillText(courtText, textX + arenaDrawnW, baseline);
        return;
      }
      ctx.fillText(truncateToWidth(ctx, story.courtName, maxW), textX, baseline + lineH);
    },
  };
}

const MAX_AVATARS = 4;
const AVATAR = 30 * SCALE;
const AVATAR_STEP = 21 * SCALE;
const AVATAR_HUES = [25, 130, 280, 330];

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  person: BookingStoryPerson,
  x: number,
  y: number,
  hue: number,
  p: Palette,
  photos: BookingStoryImages,
  textShift: number,
): void {
  const r = AVATAR / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.fillStyle = p.avatarBorder;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  const inner = r - 2 * SCALE;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.clip();
  const photo = person.photoUrl ? photos.get(person.photoUrl) : undefined;
  if (photo) {
    drawCover(ctx, photo, cx - inner, cy - inner, inner * 2, inner * 2);
  } else {
    const g = ctx.createLinearGradient(cx - inner, cy - inner, cx + inner, cy + inner);
    g.addColorStop(0, `hsl(${hue}, 60%, 45%)`);
    g.addColorStop(1, `hsl(${(hue + 30) % 360}, 60%, 28%)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
    const size = AVATAR / 3;
    ctx.font = sora(700, size);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(person.initials, cx + textShift, cy + size * 0.36);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** Linha divisória, avatares sobrepostos e "Ana, Enzo e Lia / 3 na quadra". */
function crewBlock(ctx: CanvasRenderingContext2D, story: BookingStory, p: Palette, photos: BookingStoryImages): Block {
  const pad = 12 * SCALE;
  const shown = story.crew.slice(0, MAX_AVATARS);
  return {
    height: pad + AVATAR,
    draw: (top) => {
      ctx.fillStyle = p.divider;
      ctx.fillRect(LEFT, top, CONTENT_W, SCALE);
      const y = top + pad;
      // O avatar seguinte cobre a direita deste: as iniciais vão para a parte que aparece.
      const covered = AVATAR - AVATAR_STEP;
      shown.forEach((person, i) =>
        drawAvatar(
          ctx,
          person,
          LEFT + i * AVATAR_STEP,
          y,
          AVATAR_HUES[i % AVATAR_HUES.length],
          p,
          photos,
          i < shown.length - 1 ? -covered / 2 : 0,
        ),
      );
      const x = LEFT + AVATAR + AVATAR_STEP * (shown.length - 1) + 10 * SCALE;
      const size = 12.5 * SCALE;
      const maxW = RIGHT - x;
      ctx.font = sora(700, size);
      ctx.fillStyle = p.ink;
      ctx.fillText(truncateToWidth(ctx, bookingStoryCrewNames(story.crew), maxW), x, y + AVATAR / 2 - size * 0.22);
      ctx.font = sora(500, size);
      ctx.fillStyle = p.sub;
      ctx.fillText(
        truncateToWidth(ctx, bookingStoryCrewCaption(story.crew.length, story.moment), maxW),
        x,
        y + AVATAR / 2 + size * 0.98,
      );
    },
  };
}

function drawFooter(ctx: CanvasRenderingContext2D, p: Palette): void {
  const size = 9 * SCALE;
  const baseline = FOOTER_BOTTOM - size * 0.3;
  ctx.font = mono(400, size);
  setLetterSpacing(ctx, 1.08 * SCALE);
  ctx.fillStyle = p.sub;
  const stamp = '#VAMOSNEXA';
  const stampW = ctx.measureText(stamp).width;
  ctx.fillText(stamp, RIGHT - stampW, baseline);
  ctx.fillText(truncateToWidth(ctx, 'RESERVE TAMBÉM · NEXAGO.COM.BR', RIGHT - stampW - 8 * SCALE - LEFT), LEFT, baseline);
  setLetterSpacing(ctx, 0);
}

/** Desenha a arte. Síncrono: quem chama já esperou `loadBookingStoryAssets()`, a capa e as fotos
 *  (`loadBookingStoryCrewPhotos`); o que não estiver carregado cai no fallback (iniciais, fundo
 *  chapado). */
export function drawBookingStory(
  ctx: CanvasRenderingContext2D,
  story: BookingStory,
  options: BookingStoryOptions,
  assets: BookingStoryAssets,
  /** `backdrop`: a imagem do fundo `cover`/`photo` (ignorada nos fundos sem imagem). */
  images: { backdrop: HTMLImageElement | null; photos: BookingStoryImages },
): void {
  const p = paletteOf(options);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  drawBackground(ctx, options, images.backdrop);
  drawHeader(ctx, story, p, assets);

  const blocks: Block[] = [];
  if (options.showSport && story.sportLabel) blocks.push(sportBlock(ctx, story.sportLabel, p));
  blocks.push(headlineBlock(ctx, story, p), timeBlock(ctx, story, p), arenaBlock(ctx, story, p));
  if (options.showCrew && story.crew.length > 0) blocks.push(crewBlock(ctx, story, p, images.photos));

  const total = blocks.reduce((sum, b) => sum + b.height, 0) + BLOCK_GAP * (blocks.length - 1);
  let top = BLOCKS_BOTTOM - total;
  for (const block of blocks) {
    block.draw(top);
    top += block.height + BLOCK_GAP;
  }
  drawFooter(ctx, p);
  ctx.restore();
}

/** Canvas → PNG. `null` quando o navegador recusa (canvas "sujo" por foto sem CORS). */
export function bookingStoryPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
