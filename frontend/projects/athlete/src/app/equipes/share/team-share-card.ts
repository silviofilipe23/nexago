import QRCode, { type BitMatrix } from 'qrcode';
import { SHARE_POSTER_HEIGHT, SHARE_POSTER_WIDTH, loadBrandMark, loadImage, loadShareFonts, mono, sora, truncate } from '../../tournaments/share-canvas';
import {
  TEAM_SHARE_PORTAL_HOST,
  teamShareFollowLabel,
  teamShareKicker,
  teamShareMemberHue,
  teamShareOriginLine,
  teamShareRankLabel,
  teamShareThousands,
  type TeamShareCardData,
  type TeamShareCardStyle,
  type TeamShareMember,
  type TeamShareStage,
} from './team-share-data';
import { layoutFitText, type TextRun } from './team-share-text';

/**
 * Arte 9:16 de compartilhar a equipe — porta dos canvas "Card Perfil da Equipe" e "Card Perfil
 * da Dupla" como o app desenha (`presentation/team_profile/share/team_share_card.dart` +
 * `team_share_card_atoms.dart`, PR #1002).
 *
 * O app desenha em 360×640 e captura em 3×; aqui o canvas é 1080×1920 e o desenho roda com
 * `scale(3)`, então toda medida abaixo é a MESMA do widget Flutter — quem mexer num lado acha o
 * número igual no outro.
 *
 * Seis composições: Perfil, Elenco/Ficha e Ranking, cada uma para dupla e para equipe (trio pra
 * cima). Todo nome passa por `layoutFitText` (encolhe, quebra e corta com reticências) ou por
 * `truncate`: encolher sozinho não garante encaixe.
 */

export const TEAM_SHARE_CARD_WIDTH = SHARE_POSTER_WIDTH;
export const TEAM_SHARE_CARD_HEIGHT = SHARE_POSTER_HEIGHT;

const S = TEAM_SHARE_CARD_WIDTH / 360;
const W = 360;
const H = 640;
const PAD = 28;
const CONTENT_W = W - PAD * 2;
const FOOTER_TOP = H - PAD - 50;

const C = {
  bg: '#050505',
  surface: '#131316',
  ink: '#0a0a0a',
  text: '#f4f4f5',
  mute: 'rgba(244, 244, 245, 0.62)',
  dim: 'rgba(244, 244, 245, 0.4)',
  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: 'rgba(255, 255, 255, 0.16)',
  green: '#2bd17e',
  red: '#ff3b30',
  brand: '#ff6a1a',
  // Tinta sobre o laranja, nas opacidades do canvas.
  inkMute: 'rgba(10, 10, 10, 0.62)',
  inkSoft: 'rgba(10, 10, 10, 0.4)',
  inkGhost: 'rgba(10, 10, 10, 0.08)',
} as const;

// ── Tipografia ────────────────────────────────────────────────────────────

interface TextStyle {
  family: 'sora' | 'mono';
  size: number;
  weight: number;
  color: string;
  /** Espaçamento entre letras em unidades da base (o `letterSpacing` do Flutter). */
  tracking: number;
  /** Multiplicador de altura de linha (o `height` do Flutter). */
  height: number;
  /** Reparte a sobra da linha meio a meio, como o `line-height` do CSS, em vez de na proporção
   *  do ascent/descent (o padrão do Flutter). */
  evenLeading?: boolean;
}

/** Rótulo em mono caixa alta (os "RANKING", "PONTOS" do canvas). */
function label(size: number, color: string = C.mute, em = 0.14): TextStyle {
  return { family: 'mono', size, weight: 700, color, tracking: size * em, height: 1.2 };
}

/** Número/nome em Sora 800 apertado. */
function display(size: number, opts: { color?: string; em?: number; height?: number; weight?: number } = {}): TextStyle {
  return { family: 'sora', size, weight: opts.weight ?? 800, color: opts.color ?? C.text, tracking: size * (opts.em ?? -0.04), height: opts.height ?? 0.95 };
}

/** Linha de origem ("FORTALEZA · CE · DESDE 2024"). */
function originStyle(color: string, size = 8.7): TextStyle {
  return { family: 'mono', size, weight: 500, color, tracking: size * 0.1, height: 1.2 };
}

function withSize(style: TextStyle, size: number): TextStyle {
  return { ...style, size, tracking: (style.tracking / style.size) * size };
}

function apply(ctx: CanvasRenderingContext2D, style: TextStyle): void {
  ctx.font = style.family === 'sora' ? sora(style.weight, style.size) : mono(style.weight, style.size);
  // Medida e desenho usam o mesmo espaçamento: navegador sem `letterSpacing` ignora nos dois e o
  // texto só sai um pouco mais largo — continua cabendo, porque o corte mede com ele.
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${style.tracking}px`;
  ctx.fillStyle = style.color;
  ctx.textBaseline = 'alphabetic';
}

function measure(ctx: CanvasRenderingContext2D, text: string, style: TextStyle): number {
  apply(ctx, style);
  return ctx.measureText(text).width;
}

/** Onde cai a linha de base numa caixa de `size × height`: o Flutter reparte a sobra na
 *  proporção do ascent/descent da fonte. */
function baselineOffset(ctx: CanvasRenderingContext2D, style: TextStyle): number {
  apply(ctx, style);
  const m = ctx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  if (!Number.isFinite(asc) || !Number.isFinite(desc) || asc + desc <= 0) return lineHeight(style) * 0.8;
  if (style.evenLeading) return (lineHeight(style) - asc - desc) / 2 + asc;
  return (lineHeight(style) * asc) / (asc + desc);
}

function lineHeight(style: TextStyle): number {
  return style.size * style.height;
}

type Align = 'left' | 'center' | 'right';

/** Uma linha de texto cuja caixa começa em `top`; `x` é a borda esquerda, o centro ou a borda
 *  direita, conforme `align`. */
function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, style: TextStyle, align: Align = 'left'): void {
  const base = top + baselineOffset(ctx, style);
  apply(ctx, style);
  ctx.textAlign = align;
  ctx.fillText(text, x, base);
  ctx.textAlign = 'left';
}

/** Texto de uma linha cortado com reticências em `maxWidth` (`maxLines: 1` + ellipsis). */
function drawTruncated(ctx: CanvasRenderingContext2D, text: string, x: number, top: number, style: TextStyle, maxWidth: number, align: Align = 'left'): void {
  apply(ctx, style);
  drawText(ctx, truncate(ctx, text, maxWidth), x, top, style, align);
}

/** O `FittedBox(scaleDown)`: encolhe a linha inteira (letras e espaçamento) até caber. */
function drawFitted(ctx: CanvasRenderingContext2D, runs: readonly TextRun[], x: number, top: number, style: TextStyle, maxWidth: number, extra?: { text: string; style: TextStyle }): void {
  const text = runs.map((r) => r.text).join('');
  const mainW = measure(ctx, text, style);
  const extraW = extra ? measure(ctx, extra.text, extra.style) : 0;
  const scale = Math.min(1, maxWidth / Math.max(1, mainW + extraW));
  ctx.save();
  ctx.translate(x, top);
  ctx.scale(scale, scale);
  const base = baselineOffset(ctx, style);
  apply(ctx, style);
  let cx = 0;
  for (const run of runs) {
    ctx.fillStyle = run.color;
    ctx.fillText(run.text, cx, base);
    cx += ctx.measureText(run.text).width;
  }
  if (extra) {
    apply(ctx, extra.style);
    ctx.fillText(extra.text, mainW, base);
  }
  ctx.restore();
}

/**
 * Nome que encolhe até caber e quebra em até `maxLines` (o `TeamShareFitText`). Devolve a altura
 * ocupada. `align: 'center'` centra cada linha em `x`.
 */
function drawFitName(
  ctx: CanvasRenderingContext2D,
  runs: readonly TextRun[],
  x: number,
  top: number,
  style: TextStyle,
  opts: { sizes: readonly number[]; maxWidth: number; maxLines?: number; align?: 'left' | 'center'; balance?: boolean },
): number {
  const layout = layoutFitText(runs, (text, size) => measure(ctx, text, withSize(style, size)), {
    sizes: opts.sizes,
    maxWidth: opts.maxWidth,
    maxLines: opts.maxLines ?? 2,
    balance: opts.balance ?? true,
    ellipsisColor: style.color,
  });
  const s = withSize(style, layout.size);
  const lh = lineHeight(s);
  const base = baselineOffset(ctx, s);
  layout.lines.forEach((line, i) => {
    const lineW = measure(ctx, line.text, s);
    const startX = opts.align === 'center' ? x - lineW / 2 : x;
    let prefix = '';
    for (const run of line.runs) {
      const runX = startX + (prefix ? measure(ctx, prefix, s) : 0);
      apply(ctx, { ...s, color: run.color });
      ctx.textAlign = 'left';
      ctx.fillText(run.text, runX, top + i * lh + base);
      prefix += run.text;
    }
  });
  return layout.lines.length * lh;
}

// ── Pintura ───────────────────────────────────────────────────────────────

function hsl(hue: number, s: number, l: number, a = 1): string {
  return `hsla(${(((hue % 360) + 360) % 360).toFixed(2)}, ${s * 100}%, ${l * 100}%, ${a})`;
}

/** `LinearGradient(begin: Alignment(ax0, ay0), end: Alignment(ax1, ay1))` sobre um retângulo. */
function alignedGradient(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, from: [number, number], to: [number, number]): CanvasGradient {
  const at = ([ax, ay]: [number, number]): [number, number] => [x + ((ax + 1) / 2) * w, y + ((ay + 1) / 2) * h];
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  return ctx.createLinearGradient(x0, y0, x1, y1);
}

/** Listras diagonais finas (o `repeating-linear-gradient(135deg…)` do canvas), já recortadas
 *  por quem chama. */
function drawStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, gap: number, width = 0.7): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let sx = -h; sx < w; sx += gap) {
    ctx.moveTo(x + sx, y + h);
    ctx.lineTo(x + sx + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Foto preenchendo o retângulo sem distorcer (`BoxFit.cover`). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** Matiz e brilho atrás do conteúdo (`radial-gradient` do canvas). */
function drawGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string, transparent: string): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.7, transparent);
  g.addColorStop(1, transparent);
  ctx.fillStyle = g;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
}

/** Esmaece a base das fotos no fundo. */
function drawPhotoFade(ctx: CanvasRenderingContext2D, top: number, height: number, stop = 0.88): void {
  const g = ctx.createLinearGradient(0, top, 0, top + height);
  g.addColorStop(0, 'rgba(5, 5, 5, 0)');
  g.addColorStop(stop, C.bg);
  g.addColorStop(1, C.bg);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, height);
}

// ── Átomos ────────────────────────────────────────────────────────────────

interface Painter {
  ctx: CanvasRenderingContext2D;
  data: TeamShareCardData;
  photos: ReadonlyMap<string, HTMLImageElement | null>;
  logo: HTMLImageElement | null;
  qr: BitMatrix | null;
}

function photoOf(p: Painter, member: TeamShareMember): HTMLImageElement | null {
  return member.avatarUrl ? (p.photos.get(member.avatarUrl) ?? null) : null;
}

/** Marca + "nexaGO" (o GO laranja; tinta escura no fundo laranja). */
function drawWordmark(p: Painter, x: number, rowTop: number, rowH: number, onOrange: boolean): void {
  const { ctx } = p;
  const fg = onOrange ? C.ink : C.text;
  let tx = x;
  if (p.logo) {
    const top = rowTop + (rowH - 19) / 2;
    // A marca é laranja: no fundo laranja ela sumiria, então vira tinta.
    ctx.drawImage(onOrange ? tinted(p.logo, C.ink) : p.logo, x, top, 19, 19);
    tx = x + 19 + 6;
  }
  const style = display(12.5, { color: fg, em: -0.03, height: 1 });
  const top = rowTop + (rowH - lineHeight(style)) / 2;
  drawText(ctx, 'nexa', tx, top, style);
  drawText(ctx, 'GO', tx + measure(ctx, 'nexa', style), top, { ...style, color: onOrange ? fg : C.brand });
}

const tintCache = new Map<string, HTMLCanvasElement>();

function tinted(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const key = `${img.src}|${color}`;
  const cached = tintCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 128;
  canvas.height = img.naturalHeight || 128;
  const c = canvas.getContext('2d');
  if (c) {
    c.drawImage(img, 0, 0, canvas.width, canvas.height);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  tintCache.set(key, canvas);
  return canvas;
}

/** Linha de cima: marca à esquerda, `trailing` (de altura `trailingH`) à direita. */
function drawTopBar(p: Painter, top: number, trailingH: number, trailing: (right: number, top: number) => void, onOrange = false): number {
  const rowH = Math.max(19, trailingH);
  drawWordmark(p, PAD, top, rowH, onOrange);
  trailing(W - PAD, top + (rowH - trailingH) / 2);
  return rowH;
}

/** Selo escuro translúcido do topo das fotos ("5 ATLETAS"). */
function drawPill(p: Painter, right: number, top: number, text: string): void {
  const { ctx } = p;
  const style = label(8, C.text, 0.12);
  const w = measure(ctx, text, style) + 8.7 * 2;
  ctx.beginPath();
  ctx.roundRect(right - w, top, w, 19.3, 9.65);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  drawText(ctx, text, right - w + 8.7, top + (19.3 - lineHeight(style)) / 2, style);
}

/** Escudo: a equipe não tem logo, então são as iniciais num quadrado com o matiz dela (no
 *  fundo laranja, preto com as iniciais laranja). */
function drawCrest(p: Painter, x: number, y: number, size: number, onOrange = false): void {
  const { ctx, data } = p;
  const radius = size * 0.26;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  if (onOrange) {
    ctx.fillStyle = C.ink;
    ctx.fill();
  } else {
    const g = alignedGradient(ctx, x, y, size, size, [-0.5, -1], [0.5, 1]);
    g.addColorStop(0, hsl(data.hue, 0.4, 0.3));
    g.addColorStop(1, hsl(data.hue + 20, 0.3, 0.13));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    drawStripes(ctx, x, y, size, size, 'rgba(255, 255, 255, 0.12)', 7.3);
  }
  ctx.restore();
  if (!onOrange) {
    ctx.beginPath();
    ctx.roundRect(x + 0.35, y + 0.35, size - 0.7, size - 0.7, radius - 0.35);
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  const style = display(size * 0.3, { color: onOrange ? C.brand : C.text, em: -0.03, height: 1 });
  const maxW = size - size * 0.16;
  const textW = measure(ctx, data.monogram, style);
  const scale = Math.min(1, maxW / Math.max(1, textW));
  const s = withSize(style, style.size * scale);
  drawText(ctx, data.monogram, x + size / 2, y + (size - lineHeight(s)) / 2, s, 'center');
}

/** Avatar redondo: foto ou iniciais num degradê do matiz do atleta. */
function drawAvatar(p: Painter, member: TeamShareMember, hue: number, x: number, y: number, size: number, ring: string = C.bg): void {
  const { ctx } = p;
  const bw = Math.max(1, size * 0.045);
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  const r = size / 2 - bw;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const img = photoOf(p, member);
  if (img) {
    drawCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, hsl(hue, 0.18, 0.23));
    g.addColorStop(1, hsl(hue, 0.15, 0.12));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const style = display(size * 0.34, { color: 'rgba(244, 244, 245, 0.92)', em: -0.02, height: 1, weight: 700 });
    drawText(ctx, member.initials, cx, cy - lineHeight(style) / 2, style, 'center');
  }
  ctx.restore();
}

/** Elenco em linha, sobreposto (o da esquerda por cima). Devolve a largura. */
function drawRosterRow(p: Painter, x: number, y: number, size: number, ring: string = C.bg, max = 8): number {
  const list = p.data.members.slice(0, max);
  const step = size * 0.78;
  for (let i = list.length - 1; i >= 0; i--) drawAvatar(p, list[i]!, teamShareMemberHue(p.data.hue, i), x + step * i, y, size, ring);
  return rosterRowWidth(list.length, size);
}

function rosterRowWidth(count: number, size: number): number {
  return count === 0 ? 0 : size + size * 0.78 * (count - 1);
}

interface Stat {
  label: string;
  value: string;
  suffix?: string;
}

/** Um número com o rótulo em cima ("RANKING / 3º"). Devolve a altura. */
function drawStat(p: Painter, stat: Stat, x: number, y: number, width: number, size = 25): number {
  const { ctx } = p;
  const labelStyle = label(7.3);
  drawTruncated(ctx, stat.label, x, y, labelStyle, width);
  const valueTop = y + lineHeight(labelStyle) + 3.3;
  const style = display(size);
  drawFitted(ctx, [{ text: stat.value, color: style.color }], x, valueTop, style, width, stat.suffix ? { text: stat.suffix, style: display(size * 0.42, { color: C.dim }) } : undefined);
  return statHeight(size);
}

function statHeight(size: number): number {
  return lineHeight(label(7.3)) + 3.3 + lineHeight(display(size));
}

/** Faixa de números entre duas linhas (cards de perfil). Devolve a altura. */
function drawStatStrip(p: Painter, stats: readonly Stat[], y: number, size = 25): number {
  const { ctx } = p;
  const h = 0.5 + 14.7 + statHeight(size) + 14.7 + 0.5;
  ctx.fillStyle = C.line;
  ctx.fillRect(PAD, y, CONTENT_W, 0.5);
  ctx.fillRect(PAD, y + h - 0.5, CONTENT_W, 0.5);
  const colW = (CONTENT_W - 10 * (stats.length - 1)) / stats.length;
  stats.forEach((stat, i) => drawStat(p, stat, PAD + i * (colW + 10), y + 0.5 + 14.7, colW, size));
  return h;
}

/** Três blocos (o primeiro laranja): RANKING · PONTOS · APROV. Devolve a altura. */
function drawStatBlocks(p: Painter, y: number): number {
  const { ctx, data } = p;
  const blocks: [string, string][] = [
    ['RANKING', teamShareRankLabel(data)],
    ['PONTOS', teamShareThousands(data.points)],
    ['APROV.', `${data.winRatePercent}%`],
  ];
  const content = lineHeight(label(7)) + 3.3 + 21.3;
  const rowH = content + 9.3 * 2 + 1;
  const blockW = (CONTENT_W - 6.7 * 2) / 3;
  blocks.forEach(([title, value], i) => {
    const x = PAD + i * (blockW + 6.7);
    // O laranja não tem borda: sai meio ponto mais baixo e centrado na linha, como no app.
    const border = i === 0 ? 0 : 0.5;
    const h = content + 9.3 * 2 + border * 2;
    const top = y + (rowH - h) / 2;
    ctx.beginPath();
    ctx.roundRect(x, top, blockW, h, 9.3);
    ctx.fillStyle = i === 0 ? C.brand : C.surface;
    ctx.fill();
    if (border) {
      ctx.beginPath();
      ctx.roundRect(x + 0.25, top + 0.25, blockW - 0.5, h - 0.5, 9.05);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    const inner = 10 + border;
    const labelTop = top + 9.3 + border;
    drawText(ctx, title, x + inner, labelTop, label(7, i === 0 ? 'rgba(10, 10, 10, 0.65)' : C.mute));
    const style = display(21.3, { color: i === 0 ? C.ink : C.text, height: 1 });
    drawFitted(ctx, [{ text: value, color: style.color }], x + inner, labelTop + lineHeight(label(7)) + 3.3, style, blockW - inner * 2);
  });
  return rowH;
}

/** Últimos jogos: V verde, D vermelho. Devolve a largura. */
function drawForm(p: Painter, form: readonly boolean[], x: number, y: number, size = 18): number {
  const { ctx } = p;
  form.forEach((won, i) => {
    const bx = x + i * (size + 3.3);
    ctx.beginPath();
    ctx.roundRect(bx, y, size, size, size * 0.26);
    ctx.fillStyle = won ? 'rgba(43, 209, 126, 0.14)' : 'rgba(255, 59, 48, 0.14)';
    ctx.fill();
    const style: TextStyle = { family: 'mono', size: size * 0.42, weight: 700, color: won ? C.green : C.red, tracking: 0, height: 1 };
    drawText(ctx, won ? 'V' : 'D', bx + size / 2, y + (size - lineHeight(style)) / 2, style, 'center');
  });
  return formWidth(form.length, size);
}

function formWidth(count: number, size: number): number {
  return count === 0 ? 0 : count * size + (count - 1) * 3.3;
}

/** QR do perfil da equipe num quadrado claro. Um path só com todos os módulos: preenchidos um a
 *  um, a borda de cada quadrado sairia como fresta clara entre vizinhos. */
function drawQr(p: Painter, x: number, y: number, size = 50): void {
  const { ctx, qr } = p;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.15);
  ctx.fillStyle = C.text;
  ctx.fill();
  if (!qr) return;
  const inset = size * 0.09;
  const cell = (size - inset * 2) / qr.size;
  const path = new Path2D();
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.data[r * qr.size + c]) path.rect(x + inset + c * cell, y + inset + r * cell, cell, cell);
    }
  }
  ctx.fillStyle = C.ink;
  ctx.fill(path);
}

/** Rodapé dos cards escuros: "SIGA A EQUIPE / atleta.nexago.com.br" + QR. */
function drawFooter(p: Painter): void {
  const { ctx, data } = p;
  const follow = label(6.7, C.mute, 0.1);
  const link = display(10.7, { em: -0.02, height: 1.2, weight: 700 });
  const colH = lineHeight(follow) + 2 + lineHeight(link);
  const top = FOOTER_TOP + 50 - colH;
  const colW = CONTENT_W - 8 - 50;
  drawText(ctx, teamShareFollowLabel(data), PAD, top, follow);
  drawTruncated(ctx, TEAM_SHARE_PORTAL_HOST, PAD, top + lineHeight(follow) + 2, link, colW);
  drawQr(p, W - PAD - 50, FOOTER_TOP);
}

/** Uma foto de atleta no mosaico: a foto, ou as iniciais grandes e apagadas sobre o matiz dele.
 *  `initialsY` é o `Alignment.y` das iniciais (-1 topo, 0 centro). */
function drawPhotoTile(p: Painter, member: TeamShareMember, hue: number, x: number, y: number, w: number, h: number, initialsSize = 53, initialsY = 0): void {
  const { ctx } = p;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const img = photoOf(p, member);
  if (img) {
    drawCover(ctx, img, x, y, w, h);
  } else {
    const g = alignedGradient(ctx, x, y, w, h, [-0.35, -1], [0.35, 1]);
    g.addColorStop(0, hsl(hue, 0.28, 0.26));
    g.addColorStop(1, hsl(hue + 18, 0.22, 0.1));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    drawStripes(ctx, x, y, w, h, 'rgba(255, 255, 255, 0.08)', 9.3);
    const style = display(initialsSize, { color: 'rgba(255, 255, 255, 0.18)', height: 1 });
    const top = y + ((h - lineHeight(style)) * (1 + initialsY)) / 2;
    drawText(ctx, member.initials, x + w / 2, top, style, 'center');
  }
  ctx.restore();
}

/** Lista "ÚLTIMAS ETAPAS" do card escuro do ranking. Devolve a altura. */
function drawStages(p: Painter, stages: readonly TeamShareStage[], x: number, y: number, width: number): number {
  const { ctx } = p;
  const head = label(7);
  drawText(ctx, 'ÚLTIMAS ETAPAS', x, y, head);
  let cy = y + lineHeight(head);
  const nameStyle = display(11.3, { em: -0.02, height: 1.2, weight: 600 });
  for (const stage of stages) {
    cy += 6;
    const resultStyle = display(12.7, { em: 0, height: 1.2, color: stage.result === '1º' ? C.brand : C.mute });
    const rowH = Math.max(lineHeight(nameStyle), lineHeight(resultStyle));
    const resultW = measure(ctx, stage.result, resultStyle);
    drawText(ctx, stage.result, x + width, cy + (rowH - lineHeight(resultStyle)) / 2, resultStyle, 'right');
    drawTruncated(ctx, stage.name, x, cy + (rowH - lineHeight(nameStyle)) / 2, nameStyle, width - 8 - resultW);
    cy += rowH;
  }
  return cy - y;
}

function stagesHeight(count: number): number {
  return lineHeight(label(7)) + count * (6 + lineHeight(display(12.7, { height: 1.2 })));
}

/** Fundo laranja com as listras e o número gigante apagado atrás. */
function drawOrangeBackdrop(p: Painter, ghost: string): void {
  const { ctx } = p;
  // 158deg do canvas.
  const g = alignedGradient(ctx, 0, 0, W, H, [-0.37, -1], [0.37, 1]);
  g.addColorStop(0, '#ff7a28');
  g.addColorStop(0.42, C.brand);
  g.addColorStop(1, '#e5560e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawStripes(ctx, 0, 0, W, H, 'rgba(10, 10, 10, 0.1)', 19.3);
  drawText(ctx, ghost, W + 13, 50, display(253, { color: C.inkGhost, em: -0.07, height: 0.8 }), 'right');
}

/**
 * O card escuro de baixo do estilo ranking: números, últimas etapas e a linha final (elenco ou
 * sequência + link). Fica colado no pé do card.
 */
function drawDarkPanel(p: Painter, leading: { width: number; height: number; draw: (x: number, y: number) => void }): void {
  const { ctx, data } = p;
  const inner = 16;
  const x = PAD + inner;
  const width = CONTENT_W - inner * 2;
  const statsH = statHeight(21.3);
  const follow = label(6.3, C.mute, 0.08);
  const link = display(9.3, { em: -0.02, height: 1.2, weight: 700 });
  const linkColH = lineHeight(follow) + 1.3 + lineHeight(link);
  const rowH = Math.max(leading.height, linkColH);
  const stagesH = data.stages.length > 0 ? 13 + 0.5 + 13 + stagesHeight(data.stages.length) : 0;
  const h = inner + statsH + stagesH + 13 + 0.5 + 13 + rowH + inner;
  const top = H - PAD - h;

  ctx.save();
  // Sombra em pixels do aparelho: `shadowBlur`/`shadowOffset` ignoram o `scale(3)`.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 2 * (27 * 0.57735 + 0.5) * S;
  ctx.shadowOffsetY = 13 * S;
  ctx.beginPath();
  ctx.roundRect(PAD, top, CONTENT_W, h, 12);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.restore();

  let y = top + inner;
  const colW = (width - 20) / 3;
  const stats: Stat[] = [
    { label: 'PONTOS', value: teamShareThousands(data.points) },
    { label: 'APROV.', value: `${data.winRatePercent}`, suffix: '%' },
    { label: 'TÍTULOS', value: `${data.titles}` },
  ];
  stats.forEach((stat, i) => drawStat(p, stat, x + i * (colW + 10), y, colW, 21.3));
  y += statsH;

  const divider = () => {
    y += 13;
    ctx.fillStyle = C.line;
    ctx.fillRect(x, y, width, 0.5);
    y += 0.5 + 13;
  };
  if (data.stages.length > 0) {
    divider();
    y += drawStages(p, data.stages, x, y, width);
  }
  divider();

  leading.draw(x, y + (rowH - leading.height) / 2);
  const right = x + width;
  const colTop = y + (rowH - linkColH) / 2;
  const colW2 = width - leading.width - 10;
  drawTruncated(ctx, teamShareFollowLabel(data), right, colTop, follow, colW2, 'right');
  drawTruncated(ctx, TEAM_SHARE_PORTAL_HOST, right, colTop + lineHeight(follow) + 1.3, link, colW2, 'right');
}

/** Nome da dupla com a barra laranja (ou apagada, no fundo laranja). */
function duoNameRuns(data: TeamShareCardData, color: string, slash: string): TextRun[] {
  const runs: TextRun[] = [];
  data.members.slice(0, 2).forEach((m, i) => {
    if (i > 0) runs.push({ text: ' / ', color: slash });
    runs.push({ text: m.name, color });
  });
  return runs;
}

// ── Equipe · A · Escudo ───────────────────────────────────────────────────

function drawTeamCrestCard(p: Painter): void {
  const { ctx, data } = p;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawGlow(ctx, 180, 141, 252, hsl(data.hue, 0.6, 0.4, 0.35), hsl(data.hue, 0.6, 0.4, 0));

  const kicker = label(8);
  let y = PAD;
  y += drawTopBar(p, y, lineHeight(kicker), (right, top) => drawText(ctx, teamShareKicker(data), right, top, kicker, 'right'));
  y += 43;
  drawCrest(p, W / 2 - 50, y, 100);
  y += 100 + 14.7;
  y += drawFitName(ctx, [{ text: data.name, color: C.text }], W / 2, y, display(41.3, { em: -0.045, height: 0.94 }), {
    sizes: [41.3, 36.7, 33.3, 30, 26.7],
    maxWidth: 300,
    align: 'center',
  });
  const origin = teamShareOriginLine(data);
  if (origin) {
    y += 8;
    const style = originStyle(C.mute, 9.3);
    drawTruncated(ctx, origin, W / 2, y, style, CONTENT_W, 'center');
    y += lineHeight(style);
  }
  y += 30;
  y += drawStatStrip(p, [
    { label: 'RANKING', value: teamShareRankLabel(data) },
    { label: 'PONTOS', value: teamShareThousands(data.points) },
    { label: 'TÍTULOS', value: `${data.titles}` },
  ], y);
  y += 18.7;
  const roster = label(7.3);
  drawText(ctx, `ELENCO · ${data.members.length} ATLETAS`, PAD, y, roster);
  y += lineHeight(roster) + 8.7;
  drawRosterRow(p, PAD, y, 41.3);
  drawFooter(p);
}

// ── Equipe · B · Elenco ───────────────────────────────────────────────────

function drawTeamRosterCard(p: Painter): void {
  const { ctx, data } = p;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawMosaic(p, 393);
  drawPhotoFade(ctx, 187, 213);
  drawTopBar(p, 24, 19.3, (right, top) => drawPill(p, right, top, `${data.members.length} ATLETAS`));

  const nameX = PAD + 50 + 11.3;
  const nameW = CONTENT_W - 50 - 11.3;
  const nameStyle = display(30.7, { height: 0.95 });
  const sizes = [30.7, 27.3, 25.3, 22.7];
  // A altura do nome decide onde o escudo centra: mede antes de desenhar.
  const nameLayout = layoutFitText([{ text: data.name, color: C.text }], (t, s) => measure(ctx, t, withSize(nameStyle, s)), {
    sizes,
    maxWidth: nameW,
    maxLines: 2,
    balance: true,
    ellipsisColor: C.text,
  });
  const loc = originStyle(C.mute);
  const colH = nameLayout.lines.length * lineHeight(withSize(nameStyle, nameLayout.size)) + (data.location ? 4 + lineHeight(loc) : 0);
  const rowH = Math.max(50, colH);
  const top = 333;
  drawCrest(p, PAD, top + (rowH - 50) / 2, 50);
  let y = top + (rowH - colH) / 2;
  y += drawFitName(ctx, [{ text: data.name, color: C.text }], nameX, y, nameStyle, { sizes, maxWidth: nameW });
  if (data.location) drawTruncated(ctx, data.location.toUpperCase(), nameX, y + 4, loc, nameW);
  drawStatBlocks(p, top + rowH + 18.7);
  drawFooter(p);
}

/** Fotos do elenco em grade: três colunas a partir de sete atletas, duas abaixo disso. A última
 *  linha incompleta estica para não sobrar buraco. */
function drawMosaic(p: Painter, height: number): void {
  const { ctx, data } = p;
  const members = data.members;
  if (members.length === 0) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, height);
    return;
  }
  const cols = members.length > 6 ? 3 : 2;
  const rows: number[][] = [];
  for (let i = 0; i < members.length; i += cols) rows.push(members.slice(i, i + cols).map((_, j) => i + j));
  const rowH = (height - 2 * (rows.length - 1)) / rows.length;
  const initialsSize = cols === 3 || rows.length > 2 ? 30 : 40;
  rows.forEach((row, r) => {
    const tileW = (W - 2 * (row.length - 1)) / row.length;
    row.forEach((index, c) => {
      // A última linha fica atrás do nome: as iniciais sobem.
      const initialsY = r > 0 && r === rows.length - 1 ? -0.4 : 0;
      drawPhotoTile(p, members[index]!, teamShareMemberHue(data.hue, index), c * (tileW + 2), r * (rowH + 2), tileW, rowH, initialsSize, initialsY);
    });
  });
}

// ── Dupla · A · Lado a lado ───────────────────────────────────────────────

function drawDuoSplitCard(p: Painter): void {
  const { ctx, data } = p;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const pair = data.members.slice(0, 2);
  const tileW = (W - 2 * (pair.length - 1)) / Math.max(1, pair.length);
  pair.forEach((m, i) => drawPhotoTile(p, m, teamShareMemberHue(data.hue, i), i * (tileW + 2), 0, tileW, 373));
  drawPhotoFade(ctx, 173, 207, 0.86);
  if (data.sportLabel) drawTopBar(p, 24, 19.3, (right, top) => drawPill(p, right, top, data.sportLabel.toUpperCase()));
  else drawTopBar(p, 24, 0, () => undefined);

  let y = 300;
  const kicker = label(8.7, C.brand);
  drawText(ctx, teamShareKicker(data), PAD, y, kicker);
  y += lineHeight(kicker) + 6;
  y += drawFitName(ctx, duoNameRuns(data, C.text, C.brand), PAD, y, display(40, { em: -0.045, height: 0.92 }), {
    sizes: [40, 36, 32, 28.7, 25.3],
    maxWidth: CONTENT_W,
  });
  const origin = teamShareOriginLine(data);
  if (origin) {
    y += 7.3;
    const style = originStyle(C.mute);
    drawTruncated(ctx, origin, PAD, y, style, CONTENT_W);
    y += lineHeight(style);
  }
  drawStatBlocks(p, y + 18.7);
  drawFooter(p);
}

// ── Dupla · B · Ficha ─────────────────────────────────────────────────────

function drawDuoSheetCard(p: Painter): void {
  const { ctx, data } = p;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const pair = data.members.slice(0, 2);
  pair.forEach((_, i) => {
    const hue = teamShareMemberHue(data.hue, i);
    drawGlow(ctx, i === 0 ? 90 : 270, 141, 190, hsl(hue, 0.6, 0.4, 0.28), hsl(hue, 0.6, 0.4, 0));
  });

  const kicker = label(8);
  let y = PAD;
  y += drawTopBar(p, y, lineHeight(kicker), (right, top) => drawText(ctx, teamShareKicker(data), right, top, kicker, 'right'));
  y += 40;

  const colW = pair.length === 2 ? (CONTENT_W - 8) / 2 : CONTENT_W;
  let tallest = 0;
  pair.forEach((member, i) => {
    tallest = Math.max(tallest, drawSheetPlayer(p, member, teamShareMemberHue(data.hue, i), PAD + i * (colW + 8), y, colW));
  });
  if (pair.length === 2) {
    const cy = y + 43.3;
    ctx.beginPath();
    ctx.arc(W / 2, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = C.brand;
    ctx.fill();
    const plus = display(13.3, { color: C.ink, em: 0, height: 1 });
    drawText(ctx, '+', W / 2, cy - lineHeight(plus) / 2, plus, 'center');
  }
  y += tallest;

  const origin = teamShareOriginLine(data);
  if (origin) {
    y += 23.3;
    const style = originStyle(C.mute);
    drawTruncated(ctx, origin, W / 2, y, style, CONTENT_W, 'center');
    y += lineHeight(style);
  }
  y += 20;
  y += drawStatStrip(p, [
    { label: 'RANKING', value: teamShareRankLabel(data) },
    { label: 'JOGOS', value: `${data.games}` },
    { label: 'VITÓRIAS', value: `${data.wins}` },
    { label: 'TÍTULOS', value: `${data.titles}` },
  ], y, 24);
  if (data.form.length > 0) {
    y += 16.7;
    const head = label(7.3);
    const formW = formWidth(data.form.length, 18);
    drawTruncated(ctx, data.form.length === 1 ? 'ÚLTIMO JOGO' : `ÚLTIMOS ${data.form.length} JOGOS`, PAD, y + (18 - lineHeight(head)) / 2, head, CONTENT_W - formW - 8);
    drawForm(p, data.form, W - PAD - formW, y);
  }
  drawFooter(p);
}

/** Foto, nome (até duas linhas) e o ranking individual. Devolve a altura. */
function drawSheetPlayer(p: Painter, member: TeamShareMember, hue: number, x: number, y: number, width: number): number {
  const { ctx } = p;
  const size = 86.7;
  drawAvatar(p, member, hue, x + (width - size) / 2, y, size, C.lineStrong);
  let cy = y + size + 8.7;
  cy += drawFitName(ctx, [{ text: member.name, color: C.text }], x + width / 2, cy, display(17.3, { em: -0.035, height: 1 }), {
    sizes: [17.3],
    maxWidth: width,
    align: 'center',
    balance: false,
  });
  if (member.detail) {
    cy += 3.3;
    const style = label(7.3);
    drawTruncated(ctx, member.detail, x + width / 2, cy, style, width, 'center');
    cy += lineHeight(style);
  }
  return cy - y;
}

// ── C · Ranking (equipe e dupla) ──────────────────────────────────────────

function drawRankingCard(p: Painter): void {
  const { ctx, data } = p;
  const rank = teamShareRankLabel(data);
  drawOrangeBackdrop(p, rank);

  let y = PAD;
  if (data.isDuo) {
    const n = Math.min(2, data.members.length);
    y += drawTopBar(p, y, 36.7, (right, top) => drawRosterRow(p, right - rosterRowWidth(n, 36.7), top, 36.7, C.ink, 2), true);
  } else {
    y += drawTopBar(p, y, 40, (right, top) => drawCrest(p, right - 40, top, 40, true), true);
  }
  y += 36.7;
  const rankingStyle = label(9.3, C.inkMute, 0.16);
  // Recorte comprido encolhe em vez de quebrar, como no app.
  drawFitted(ctx, [{ text: data.rankingLabel, color: rankingStyle.color }], PAD, y, rankingStyle, CONTENT_W);
  y += lineHeight(rankingStyle) + 4;
  // A Sora tem descent alto: com `height: .82` repartido na proporção do Flutter, a posição sobe
  // ~13 pontos e cobre o rótulo de cima. A sobra meio a meio é a do canvas do designer (CSS).
  const big: TextStyle = { ...display(106.7, { color: C.ink, em: -0.06, height: 0.82 }), evenLeading: true };
  drawFitted(ctx, [{ text: rank, color: C.ink }], PAD, y, big, CONTENT_W);
  y += lineHeight(big) + 12;
  y += drawFitName(
    ctx,
    data.isDuo ? duoNameRuns(data, C.ink, C.inkSoft) : [{ text: data.name, color: C.ink }],
    PAD,
    y,
    display(data.isDuo ? 36 : 37.3, { color: C.ink, em: -0.045, height: 0.92 }),
    { sizes: [37.3, 33.3, 30.7, 27.3, 24], maxWidth: 296 },
  );
  const subline = [data.location, data.sportLabel]
    .filter((s) => s.length > 0)
    .join(' · ')
    .toUpperCase();
  if (subline) drawTruncated(ctx, subline, PAD, y + 6.7, label(8.7, C.inkMute, 0.1), CONTENT_W);

  if (data.isDuo) {
    drawDarkPanel(p, { width: formWidth(data.form.length, 16), height: data.form.length > 0 ? 16 : 0, draw: (x, top) => drawForm(p, data.form, x, top, 16) });
  } else {
    const n = Math.min(6, data.members.length);
    drawDarkPanel(p, { width: rosterRowWidth(n, 26.7), height: n > 0 ? 26.7 : 0, draw: (x, top) => drawRosterRow(p, x, top, 26.7, C.ink, 6) });
  }
}

// ── Entrada ───────────────────────────────────────────────────────────────

/** Desenha o card. Assíncrono porque espera fontes, fotos e a marca antes do primeiro traço —
 *  depois disso o desenho é síncrono e atômico. Foto que não carrega (ou não libera CORS) cai
 *  nas iniciais; nunca quebra a arte. */
export async function drawTeamShareCard(ctx: CanvasRenderingContext2D, data: TeamShareCardData, style: TeamShareCardStyle): Promise<void> {
  await loadShareFonts([sora(800, 41), sora(800, 12), sora(700, 10), sora(600, 11), mono(700, 8), mono(500, 9)]);
  const urls = [...new Set(data.members.map((m) => m.avatarUrl).filter((u): u is string => u != null))];
  const photos = new Map<string, HTMLImageElement | null>();
  const pending = Promise.all(urls.map(async (url) => photos.set(url, await loadImage(url))));
  const logo = await loadBrandMark();
  await pending;
  let qr: BitMatrix | null = null;
  try {
    qr = QRCode.create(data.link, { errorCorrectionLevel: 'M' }).modules;
  } catch {
    qr = null;
  }

  const p: Painter = { ctx, data, photos, logo, qr };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, TEAM_SHARE_CARD_WIDTH, TEAM_SHARE_CARD_HEIGHT);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  switch (style === 'ranking' && data.rank == null ? 'profile' : style) {
    case 'profile':
      if (data.isDuo) drawDuoSplitCard(p);
      else drawTeamCrestCard(p);
      break;
    case 'roster':
      if (data.isDuo) drawDuoSheetCard(p);
      else drawTeamRosterCard(p);
      break;
    case 'ranking':
      drawRankingCard(p);
      break;
  }
  ctx.restore();
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
