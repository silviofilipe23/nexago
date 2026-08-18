/**
 * Ferramental comum dos cards compartilháveis do portal (pôster de partida, ranking de palpites,
 * inscrição confirmada).
 *
 * Só o que é infraestrutura de desenho mora aqui — medir, cortar, carregar imagem, a paleta base e
 * o lockup da marca. A ARTE de cada card continua no arquivo dele: é a parte que muda sozinha, e
 * juntar os desenhos faria uma mudança de layout num card respingar nos outros.
 *
 * Todos os cards são 1080×1920 (9:16), a proporção do Instagram Stories e do status do WhatsApp —
 * os destinos reais da folha nativa.
 */

export const SHARE_POSTER_WIDTH = 1080;
export const SHARE_POSTER_HEIGHT = 1920;

export const INK = '#f4f4f5';
export const MUTE = 'rgba(244, 244, 245, 0.6)';
export const DIM = 'rgba(244, 244, 245, 0.38)';
export const ORANGE = '#ff6a1a';

export const mono = (weight: number, size: number) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
export const sora = (weight: number, size: number) => `${weight} ${size}px "Sora", system-ui, sans-serif`;
export const inter = (weight: number, size: number) => `${weight} ${size}px "Inter", system-ui, sans-serif`;

export function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Texto com espaçamento manual entre letras (canvas não tem letter-spacing confiável). */
export function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' = 'center',
): void {
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cur = align === 'center' ? x - total / 2 : x;
  chars.forEach((c, i) => {
    ctx.fillText(c, cur, y);
    cur += widths[i]! + spacing;
  });
  ctx.textAlign = prev;
}

/** Reduz a fonte até o texto caber. Deixa `ctx.font` ajustada e devolve o tamanho usado.
 *  `step` grande converge rápido em texto solto (nome de dupla); pequeno acha um tamanho mais
 *  justo quando o espaço é apertado. */
export function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  font: (size: number) => string,
  step = 2,
): number {
  let size = start;
  ctx.font = font(size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= step;
    ctx.font = font(size);
  }
  return size;
}

/** Corta com reticências no que passar de `maxWidth`. Mede com a `ctx.font` corrente. */
export function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/** Fotos com `crossOrigin` anônimo: sem isso o canvas fica "tainted" e o `toBlob` do
 *  compartilhamento falha. Foto que não permite CORS resolve `null` e cabe ao desenho cair no
 *  desenho de reserva (iniciais) — nunca quebra a arte. */
const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

export const BRAND_MARK_SRC = '/brand/logo.png';

/** A marca "N" laranja. É do mesmo domínio, então não suja o canvas — diferente de foto de
 *  atleta, que vem do Storage. Falhar em carregar resolve `null` e o cabeçalho cai só no
 *  lettering: a imagem compartilhada nunca deixa de sair por causa da logo. */
export function loadBrandMark(): Promise<HTMLImageElement | null> {
  return loadImage(BRAND_MARK_SRC);
}

/** "nexaGO" com o GO laranja; devolve o X onde o texto terminou.
 *
 *  As cores são parametrizadas porque o card de campanha do CAMPEÃO tem fundo laranja — ali o
 *  "GO" laranja sobre laranja simplesmente sumia. Os padrões são exatamente o que sempre foi
 *  desenhado, então nenhum chamador existente muda. */
export function drawWordmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  size: number,
  nexaColor: string = INK,
  goColor: string = ORANGE,
): number {
  ctx.font = sora(800, size);
  ctx.textAlign = 'left';
  ctx.fillStyle = nexaColor;
  ctx.fillText('nexa', x, baseline);
  const nexaW = ctx.measureText('nexa').width;
  ctx.fillStyle = goColor;
  ctx.fillText('GO', x + nexaW, baseline);
  return x + nexaW + ctx.measureText('GO').width;
}

/** Espera as fontes da marca antes do primeiro traço: sem isso o card sai na fonte de fallback e
 *  fica com outra cara. Falha de carregamento não bloqueia — o desenho segue com o que houver. */
export function loadShareFonts(specs: readonly string[]): Promise<unknown> {
  return Promise.all(specs.map((f) => document.fonts.load(f).catch(() => []))).catch(() => {});
}
