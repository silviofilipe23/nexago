import {
  DIM,
  INK,
  MUTE,
  ORANGE,
  SHARE_POSTER_HEIGHT,
  SHARE_POSTER_WIDTH,
  drawWordmark,
  fitFont,
  hexA,
  loadBrandMark,
  loadImage,
  loadShareFonts,
  mono,
  sora,
  tracked,
  truncate,
} from '../share-canvas';
import { registrationShareAthleteLine, shortAthleteName, type RegistrationShareData } from './registration-share';

/**
 * Desenho do card de inscrição confirmada — porta do ticket do app
 * (`nexago_app/.../tournament_registration_share_card.dart`) para o portal.
 *
 * Formato 1080×1920 (9:16) como os outros dois cards do portal. O ticket do app tem proporção
 * ~1:1.75, então cabe no 9:16 sem esticar: o que muda é a folga, não o desenho.
 *
 * Duas variantes, decididas pelos dados:
 * - dupla → dois avatares sobrepostos, selo "DUPLA CONFIRMADA";
 * - equipe nomeada (trio a quinteto) → leque de até cinco avatares, selo "EQUIPE CONFIRMADA" e o
 *   nome da equipe em destaque acima da linha de atletas.
 */

export const REGISTRATION_CARD_WIDTH = SHARE_POSTER_WIDTH;
export const REGISTRATION_CARD_HEIGHT = SHARE_POSTER_HEIGHT;

const W = REGISTRATION_CARD_WIDTH;
const H = REGISTRATION_CARD_HEIGHT;
const CX = W / 2;
const PAD = 72;

const SURFACE = '#0b0b0c';
const CUTOUT = '#050505';

/** Linha do picote — separa o "canhoto" (dupla + frase) dos dados do torneio. */
const DIVIDER_Y = 1152;

/** Marca do cabeçalho, alinhada pela altura de caixa alta do lettering. */
const MARK_SIZE = 64;
const MARK_GAP = 18;
const HEAD_BASELINE = 138;

/** Preenchimentos dos avatares sem foto — laranja da marca, hover e pressed, alternados. */
const AVATAR_FILLS = [ORANGE, '#ff8a4a', '#e5560e'] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function drawBackdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  // Brilho laranja atrás dos avatares — o mesmo `RadialGradient` do ticket do app.
  const glow = ctx.createRadialGradient(CX, 430, 40, CX, 430, 1080);
  glow.addColorStop(0, hexA(ORANGE, 0.24));
  glow.addColorStop(0.42, hexA(ORANGE, 0.08));
  glow.addColorStop(1, hexA(ORANGE, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, DIVIDER_Y);
}

function drawPill(ctx: CanvasRenderingContext2D, text: string, right: number, cy: number): void {
  ctx.font = mono(800, 30);
  const spacing = 2.4;
  const textW = [...text].reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * (text.length - 1);
  const padX = 32;
  const h = 62;
  const w = textW + padX * 2;

  ctx.beginPath();
  ctx.roundRect(right - w, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = ORANGE;
  ctx.fill();

  ctx.fillStyle = '#0a0a0a';
  ctx.textBaseline = 'middle';
  tracked(ctx, text, right - w + padX, cy + 1, spacing, 'left');
  ctx.textBaseline = 'alphabetic';
}

function drawHeader(ctx: CanvasRenderingContext2D, data: RegistrationShareData, mark: HTMLImageElement | null): void {
  let x = PAD;
  if (mark) {
    ctx.drawImage(mark, x, HEAD_BASELINE - MARK_SIZE + 8, MARK_SIZE, MARK_SIZE);
    x += MARK_SIZE + MARK_GAP;
  }
  drawWordmark(ctx, x, HEAD_BASELINE, 64);
  drawPill(ctx, data.slotLabel.toUpperCase(), W - PAD, HEAD_BASELINE - 22);
}

/** Foto circular com aro claro; sem foto, iniciais sobre o laranja da marca. */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  initials: string,
  index: number,
  cx: number,
  cy: number,
  r: number,
  elevated: boolean,
): void {
  const ring = Math.max(4, r * 0.06);

  ctx.save();
  if (elevated) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = r * 0.34;
    ctx.shadowOffsetX = -r * 0.12;
    ctx.shadowOffsetY = r * 0.14;
  }
  // Aro sólido desenhado como disco cheio: com a sombra ligada, um `stroke` vazaria o borrão para
  // dentro do círculo e sujaria a foto.
  ctx.beginPath();
  ctx.arc(cx, cy, r + ring, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    // `cover`: recorta o lado maior em vez de achatar o rosto.
    const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = AVATAR_FILLS[index % AVATAR_FILLS.length]!;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = mono(800, r * 0.56);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, cx, cy + r * 0.03);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** Leque de avatares centrado em `cy`. O raio encolhe conforme o elenco cresce para o leque
 *  caber sempre na mesma faixa — um quinteto não pode transbordar a largura do card. */
function drawAvatarFan(
  ctx: CanvasRenderingContext2D,
  data: RegistrationShareData,
  photos: Map<string, HTMLImageElement | null>,
  cy: number,
): void {
  const athletes = data.athletes;
  if (athletes.length === 0) return;

  const MAX_SPAN = 880;
  const STEP_RATIO = 1.63;
  const r = Math.min(155, Math.floor(MAX_SPAN / (2 + (athletes.length - 1) * STEP_RATIO)));
  const step = r * STEP_RATIO;
  const startX = CX - (step * (athletes.length - 1)) / 2;

  athletes.forEach((athlete, i) => {
    const img = athlete.photo ? (photos.get(athlete.photo) ?? null) : null;
    drawAvatar(ctx, img, initialsOf(athlete.name), i, startX + step * i, cy, r, i > 0);
  });
}

/** Picote: tracejado de ponta a ponta com um entalhe redondo em cada borda. */
function drawTicketDivider(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(154, 154, 163, 0.42)';
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(96, DIVIDER_Y);
  ctx.lineTo(W - 96, DIVIDER_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = CUTOUT;
  for (const x of [0, W]) {
    ctx.beginPath();
    ctx.arc(x, DIVIDER_Y, 40, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFieldLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  ctx.font = mono(500, 28);
  ctx.fillStyle = MUTE;
  tracked(ctx, label, x, y, 4, 'left');
}

/** Alfinete do local — desenhado à mão porque emoji sai com a cor do sistema, não com a do card. */
function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const r = size * 0.36;
  const cy = y - size * 0.62;
  ctx.fillStyle = hexA('#9a9aa3', 0.9);
  ctx.beginPath();
  ctx.arc(x, cy, r, Math.PI, 0);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(x, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** Elenco na linha: nomes inteiros quando cabem, senão `Maria A.`, e só então corta. Um quinteto
 *  de nomes compostos nunca cabe inteiro — encurtar é melhor que reticências no segundo nome. */
function fitAthleteLine(ctx: CanvasRenderingContext2D, names: readonly string[], maxWidth: number): string {
  const full = registrationShareAthleteLine(names);
  if (ctx.measureText(full).width <= maxWidth) return full;
  return truncate(ctx, registrationShareAthleteLine(names.map(shortAthleteName)), maxWidth);
}

function drawStub(ctx: CanvasRenderingContext2D, data: RegistrationShareData, photos: Map<string, HTMLImageElement | null>): void {
  const isTeam = data.teamName != null || data.athletes.length > 2;
  drawAvatarFan(ctx, data, photos, 462);

  ctx.textAlign = 'center';
  ctx.font = mono(700, 30);
  ctx.fillStyle = ORANGE;
  tracked(ctx, isTeam ? 'EQUIPE CONFIRMADA' : 'DUPLA CONFIRMADA', CX, 700, 9);

  // As duas linhas saem no MESMO corpo — medidas em separado, a frase mais longa mandaria a
  // outra para um tamanho diferente e a frase ficaria escalonada. `desafio confirmado.` é a linha
  // mais larga do catálogo e é ela que define o piso útil aqui.
  const headlineMax = W - PAD * 2 - 24;
  const headlineSize = Math.min(
    fitFont(ctx, data.headline.line1, headlineMax, 108, 62, (s) => sora(800, s)),
    fitFont(ctx, data.headline.line2, headlineMax, 108, 62, (s) => sora(800, s)),
  );
  ctx.font = sora(800, headlineSize);
  ctx.fillStyle = INK;
  ctx.fillText(data.headline.line1, CX, 818);
  ctx.fillText(data.headline.line2, CX, 818 + Math.round(headlineSize * 1.15));

  const teamName = data.teamName?.trim();
  const names = data.athletes.map((a) => a.name).filter((n) => n.trim().length > 0);
  const maxLineW = W - PAD * 2;

  if (teamName) {
    fitFont(ctx, teamName, maxLineW, 56, 34, (s) => sora(800, s));
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(truncate(ctx, teamName, maxLineW), CX, 1024);

    ctx.font = mono(500, 30);
    ctx.fillStyle = MUTE;
    ctx.fillText(fitAthleteLine(ctx, names, maxLineW), CX, 1078);
  } else {
    const line = registrationShareAthleteLine(names);
    fitFont(ctx, line, maxLineW, 48, 30, (s) => sora(700, s));
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(truncate(ctx, line, maxLineW), CX, 1040);
  }

  ctx.textAlign = 'left';
}

function drawTail(ctx: CanvasRenderingContext2D, data: RegistrationShareData): void {
  drawFieldLabel(ctx, 'TORNEIO', PAD, 1272);

  // `fitFont` sozinho não garante o encaixe: ele para no piso e devolve o texto do jeito que
  // estiver. Nome longo de campeonato vazava o card por fora da borda direita — o `truncate`
  // depois dele é o que fecha a conta.
  const tailW = W - PAD * 2;
  fitFont(ctx, data.tournamentName, tailW, 64, 38, (s) => sora(800, s));
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText(truncate(ctx, data.tournamentName, tailW), PAD, 1348);

  const colTwoX = CX + 24;
  const colOneW = CX - PAD - 40;
  const colTwoW = W - PAD - colTwoX;
  drawFieldLabel(ctx, 'QUANDO', PAD, 1478);
  drawFieldLabel(ctx, 'CATEGORIA', colTwoX, 1478);

  const dateText = data.dateLabel || '—';
  const categoryText = data.categoryName || '—';
  // As duas colunas saem no mesmo corpo, senão a linha fica escalonada.
  const valueSize = Math.min(
    fitFont(ctx, dateText, colOneW, 50, 34, (s) => sora(800, s)),
    fitFont(ctx, categoryText, colTwoW, 50, 34, (s) => sora(800, s)),
  );
  ctx.font = sora(800, valueSize);
  ctx.fillStyle = INK;
  ctx.fillText(truncate(ctx, dateText, colOneW), PAD, 1548);
  ctx.fillText(truncate(ctx, categoryText, colTwoW), colTwoX, 1548);

  if (data.locationLine.trim().length > 0) {
    drawPin(ctx, PAD + 14, 1668, 40);
    const locationW = tailW - 46;
    fitFont(ctx, data.locationLine, locationW, 34, 26, (s) => sora(500, s));
    ctx.fillStyle = MUTE;
    ctx.fillText(truncate(ctx, data.locationLine, locationW), PAD + 46, 1668);
  }

  ctx.font = mono(600, 26);
  ctx.fillStyle = DIM;
  tracked(ctx, data.footerLabel, CX, 1812, 6);
}

/** Desenha o card completo. Assíncrono porque espera fontes e fotos dos atletas antes do primeiro
 *  traço — depois disso o desenho é síncrono e atômico. */
export async function drawRegistrationShareCard(ctx: CanvasRenderingContext2D, data: RegistrationShareData): Promise<void> {
  await loadShareFonts([sora(800, 108), sora(800, 64), sora(800, 56), sora(800, 50), sora(700, 48), sora(500, 34), mono(800, 30), mono(700, 30), mono(600, 26), mono(500, 30), mono(500, 28)]);

  const urls = [...new Set(data.athletes.map((a) => a.photo).filter((p): p is string => p != null && p.length > 0))];
  const photos = new Map<string, HTMLImageElement | null>();
  const pending = Promise.all(urls.map(async (url) => photos.set(url, await loadImage(url))));
  const mark = await loadBrandMark();
  await pending;

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx);
  drawHeader(ctx, data, mark);
  drawStub(ctx, data, photos);
  drawTicketDivider(ctx);
  drawTail(ctx, data);
}
