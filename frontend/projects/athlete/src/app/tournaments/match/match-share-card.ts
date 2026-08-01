/** Desenho do card de placar compartilhável. Fica separado do componente porque é código de
 *  canvas puro — sem Angular, sem Firestore — e porque o formato do card é a parte que mais
 *  tende a mudar.
 *
 *  Formato 1080×1920 (9:16): é a proporção do Instagram Stories e do status do WhatsApp, os dois
 *  destinos reais do botão. Não existe link nem QR no card: o compartilhamento é só a imagem. */

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

export interface ShareCardData {
  /** "Semifinal · Open Goiânia Beach" */
  kicker: string;
  nameA: string;
  nameB: string;
  /** "1–1" em sets. */
  score: string;
  /** "3º set 10–6" ou "21-18 · 19-21 · 15-12". */
  detail: string | null;
  live: boolean;
  /** "Encerrada" / "Ao vivo" / horário — o selo do topo. */
  statusLabel: string;
  categoryName: string | null;
}

const ORANGE = '#ff6a1a';
const ORANGE_SOFT = '#ff8a3d';
const INK = '#0b0b0c';
const WHITE = '#f4f4f5';
const LIVE = '#ff3b30';

const DISPLAY = '"Space Grotesk", "Inter", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export function drawShareCard(ctx: CanvasRenderingContext2D, data: ShareCardData): void {
  const w = SHARE_CARD_WIDTH;
  const h = SHARE_CARD_HEIGHT;
  ctx.clearRect(0, 0, w, h);

  // Fundo: preto com um halo laranja no topo, o mesmo gesto do card de próxima partida.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const halo = ctx.createRadialGradient(w / 2, h * 0.12, 40, w / 2, h * 0.12, h * 0.62);
  halo.addColorStop(0, 'rgba(255, 106, 26, 0.42)');
  halo.addColorStop(1, 'rgba(255, 106, 26, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 3;
  roundRect(ctx, 36, 36, w - 72, h - 72, 56);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawWordmark(ctx, w / 2, 200);
  drawStatusPill(ctx, w / 2, 300, data);

  ctx.fillStyle = 'rgba(244, 244, 245, 0.62)';
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText(truncate(ctx, data.kicker.toUpperCase(), w - 200), w / 2, 430);

  // Miolo (duplas + placar) mantido junto: com o placar lá embaixo o card abria um vazio de
  // ~500px no meio. Cada nome pode ocupar duas linhas antes de encolher a fonte.
  const nameBottomA = drawTeamName(ctx, data.nameA, w / 2, 640, w - 160);
  ctx.fillStyle = 'rgba(244, 244, 245, 0.45)';
  ctx.font = `500 30px ${MONO}`;
  ctx.fillText('VS', w / 2, nameBottomA + 74);
  const nameBottomB = drawTeamName(ctx, data.nameB, w / 2, nameBottomA + 176, w - 160);

  // Ancorado no nome de baixo: com nomes de duas linhas o placar desce junto, sem colisão.
  drawScore(ctx, w / 2, nameBottomB + 300, data);

  if (data.categoryName) {
    ctx.fillStyle = 'rgba(244, 244, 245, 0.5)';
    ctx.font = `500 26px ${MONO}`;
    ctx.fillText(truncate(ctx, data.categoryName.toUpperCase(), w - 200), w / 2, 1560);
  }

  ctx.fillStyle = 'rgba(244, 244, 245, 0.42)';
  ctx.font = `500 26px ${MONO}`;
  ctx.fillText('ACOMPANHE NO NEXAGO', w / 2, 1790);
}

function drawWordmark(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
  ctx.font = `700 58px ${DISPLAY}`;
  const nexa = 'nexa';
  const go = 'GO';
  const totalWidth = ctx.measureText(nexa).width + ctx.measureText(go).width;
  const startX = cx - totalWidth / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = WHITE;
  ctx.fillText(nexa, startX, y);
  ctx.fillStyle = ORANGE;
  ctx.fillText(go, startX + ctx.measureText(nexa).width, y);
  ctx.textAlign = 'center';
}

function drawStatusPill(ctx: CanvasRenderingContext2D, cx: number, y: number, data: ShareCardData): void {
  const label = data.statusLabel.toUpperCase();
  ctx.font = `700 24px ${MONO}`;
  const textWidth = ctx.measureText(label).width;
  const dotSpace = data.live ? 34 : 0;
  const paddingX = 30;
  const pillWidth = textWidth + dotSpace + paddingX * 2;
  const pillHeight = 56;
  const x = cx - pillWidth / 2;

  ctx.fillStyle = data.live ? LIVE : 'rgba(255, 255, 255, 0.1)';
  roundRect(ctx, x, y - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();

  const textStart = x + paddingX + dotSpace;
  if (data.live) {
    ctx.beginPath();
    ctx.arc(x + paddingX + 9, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  ctx.fillStyle = data.live ? '#fff' : 'rgba(244, 244, 245, 0.8)';
  ctx.textAlign = 'left';
  ctx.fillText(label, textStart, y + 9);
  ctx.textAlign = 'center';
}

/** Desenha o nome com quebra em até 2 linhas; devolve o Y da última linha. */
function drawTeamName(ctx: CanvasRenderingContext2D, name: string, cx: number, y: number, maxWidth: number): number {
  let fontSize = 78;
  let lines = wrapText(ctx, name, maxWidth, `700 ${fontSize}px ${DISPLAY}`, 2);
  // Nome que não coube em duas linhas ganha corpo menor antes de ser truncado.
  while (lines.overflow && fontSize > 46) {
    fontSize -= 8;
    lines = wrapText(ctx, name, maxWidth, `700 ${fontSize}px ${DISPLAY}`, 2);
  }

  ctx.font = `700 ${fontSize}px ${DISPLAY}`;
  ctx.fillStyle = WHITE;
  const lineHeight = fontSize * 1.16;
  lines.lines.forEach((line, i) => ctx.fillText(line, cx, y + i * lineHeight));
  return y + (lines.lines.length - 1) * lineHeight;
}

function drawScore(ctx: CanvasRenderingContext2D, cx: number, y: number, data: ShareCardData): void {
  ctx.font = `800 232px ${DISPLAY}`;
  const gradient = ctx.createLinearGradient(cx - 240, y - 180, cx + 240, y);
  gradient.addColorStop(0, ORANGE);
  gradient.addColorStop(1, ORANGE_SOFT);
  ctx.fillStyle = gradient;
  ctx.fillText(data.score, cx, y);

  if (data.detail) {
    ctx.fillStyle = 'rgba(244, 244, 245, 0.78)';
    ctx.font = `500 38px ${MONO}`;
    ctx.fillText(truncate(ctx, data.detail, SHARE_CARD_WIDTH - 180), cx, y + 92);
  }
}

interface WrapResult {
  lines: string[];
  overflow: boolean;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string, maxLines: number): WrapResult {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  const consumed = lines.join(' ');
  const overflow = consumed.length < text.trim().length || lines.some((l) => ctx.measureText(l).width > maxWidth);
  return { lines: lines.length > 0 ? lines : [text], overflow };
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
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
