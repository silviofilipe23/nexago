import { DIM, INK, MUTE, ORANGE, drawWordmark, hexA, loadBrandMark, loadShareFonts, mono, sora, tracked, truncate } from '../share-canvas';
import type { PredictionShareData, PredictionShareRow } from './predictions-share';

/**
 * Desenho do card de compartilhamento do ranking de palpites.
 *
 * Canvas puro — sem Angular, sem Firestore — no mesmo molde de `../match/match-share-card.ts`,
 * inclusive o formato 1080×1920 (9:16), que é a proporção do Instagram Stories e do status do
 * WhatsApp, os destinos reais da folha nativa.
 *
 * SEM AVATARES, de propósito. O protótipo não usa, e isso elimina a parte frágil dos outros dois
 * compartilhamentos do produto: carregar foto com CORS antes de capturar, sob pena de o canvas
 * ficar "tainted" e o `toBlob` falhar, ou de os círculos saírem em branco.
 */

export const PREDICTIONS_CARD_WIDTH = 1080;
export const PREDICTIONS_CARD_HEIGHT = 1920;

const W = PREDICTIONS_CARD_WIDTH;
const H = PREDICTIONS_CARD_HEIGHT;
const CX = W / 2;
const PAD = 84;
const ROW_W = W - PAD * 2;
const ROW_H = 200;
const ROW_GAP = 28;
/** Respiro extra antes da linha de quem está fora do pódio: é um salto de posição. */
const ME_GAP = 72;

/** Faixa vertical onde a pilha de linhas pode viver, entre o cabeçalho e o rodapé. A pilha é
 *  centrada aqui dentro: com uma, três ou quatro linhas o card continua equilibrado, em vez de
 *  ficar com todo o peso em cima e um vazio embaixo. */
const STACK_TOP = 460;
const STACK_BOTTOM = 1630;

/** Ouro, prata e bronze do pódio — mesma família de metais do pôster de partida. */
const MEDALS = ['#f2c14e', '#c8ccd4', '#d08a5a'] as const;

function drawBackdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // Brilho laranja atrás do pódio: dá profundidade sem competir com o conteúdo.
  const glow = ctx.createRadialGradient(CX, 700, 40, CX, 700, 900);
  glow.addColorStop(0, hexA(ORANGE, 0.22));
  glow.addColorStop(1, hexA(ORANGE, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const halo = ctx.createRadialGradient(CX, 1780, 20, CX, 1780, 620);
  halo.addColorStop(0, hexA(ORANGE, 0.1));
  halo.addColorStop(1, hexA(ORANGE, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
}

/** Badge circular da posição. Pódio ganha metal; fora dele, o laranja da marca. */
function drawRankBadge(ctx: CanvasRenderingContext2D, rank: number, cx: number, cy: number): void {
  const medal = MEDALS[rank - 1];
  const radius = 54;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = medal ?? hexA(ORANGE, 0.22);
  ctx.fill();
  if (!medal) {
    ctx.strokeStyle = hexA(ORANGE, 0.65);
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const label = medal ? String(rank) : `#${rank}`;
  ctx.font = sora(800, medal ? 52 : 40);
  ctx.fillStyle = medal ? '#1a1205' : ORANGE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 2);
  ctx.textBaseline = 'alphabetic';
}

function drawRow(ctx: CanvasRenderingContext2D, row: PredictionShareRow, y: number): void {
  const highlight = row.isMe;

  ctx.beginPath();
  ctx.roundRect(PAD, y, ROW_W, ROW_H, 34);
  ctx.fillStyle = highlight ? hexA(ORANGE, 0.16) : 'rgba(255, 255, 255, 0.045)';
  ctx.fill();
  ctx.strokeStyle = highlight ? hexA(ORANGE, 0.55) : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = highlight ? 3 : 2;
  ctx.stroke();

  const cy = y + ROW_H / 2;
  drawRankBadge(ctx, row.rank, PAD + 106, cy);

  // Pontos primeiro: a largura deles define o espaço que sobra para o nome.
  ctx.font = sora(800, 64);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = highlight ? ORANGE : INK;
  const scoreText = String(row.score);
  const scoreRight = W - PAD - 56;
  ctx.fillText(scoreText, scoreRight, cy - 6);
  const scoreW = ctx.measureText(scoreText).width;

  // "pts" sob o número, como no ranking da tela — sem isso o número solto fica ambíguo.
  ctx.font = mono(500, 22);
  ctx.fillStyle = DIM;
  ctx.fillText('PTS', scoreRight, cy + 36);

  const nameX = PAD + 190;
  const suffix = highlight ? ' · você' : '';
  ctx.font = mono(500, 30);
  const suffixW = suffix ? ctx.measureText(suffix).width : 0;
  const nameMax = scoreRight - Math.max(scoreW, 60) - 48 - nameX - suffixW;

  ctx.textAlign = 'left';
  ctx.font = sora(700, 52);
  ctx.fillStyle = INK;
  const name = truncate(ctx, row.name, nameMax);
  ctx.fillText(name, nameX, cy + 2);

  if (suffix) {
    const nameW = ctx.measureText(name).width;
    ctx.font = mono(500, 30);
    ctx.fillStyle = hexA(ORANGE, 0.9);
    ctx.fillText(suffix, nameX + nameW + 8, cy + 3);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/** Altura da marca no cabeçalho e o respiro até o lettering. */
const MARK_SIZE = 64;
const MARK_GAP = 20;

function drawHeader(ctx: CanvasRenderingContext2D, data: PredictionShareData, mark: HTMLImageElement | null): void {
  let x = PAD;
  if (mark) {
    // Alinhada pela altura de caixa alta do lettering, não pela linha de base: encostada na
    // base o "N" ficaria pendurado abaixo do texto.
    ctx.drawImage(mark, x, 150 - MARK_SIZE + 8, MARK_SIZE, MARK_SIZE);
    x += MARK_SIZE + MARK_GAP;
  }
  drawWordmark(ctx, x, 150, 64);

  const eyebrow = data.tournamentName ? `PALPITES · ${data.tournamentName.toUpperCase()}` : 'PALPITES';
  ctx.font = mono(500, 24);
  ctx.fillStyle = DIM;
  tracked(ctx, truncate(ctx, eyebrow, ROW_W), PAD, 208, 5, 'left');

  ctx.font = sora(800, 88);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText('Ranking de palpites', PAD, 330);

  if (data.totalPlayers > 0) {
    ctx.font = mono(500, 30);
    ctx.fillStyle = MUTE;
    const label = data.totalPlayers === 1 ? '1 PARTICIPANTE' : `${data.totalPlayers} PARTICIPANTES`;
    tracked(ctx, label, PAD, 392, 6, 'left');
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, data: PredictionShareData): void {

  const size = 40;
  ctx.font = sora(800, size);
  const wordW = ctx.measureText('nexaGO').width;
  drawWordmark(ctx, CX - wordW / 2, 1858, size);
}

/**
 * Desenha o card completo. Assíncrono só por causa das fontes: sem esperar `document.fonts.load`,
 * o primeiro traço sai na fonte de fallback e o card fica com outra cara.
 */
export async function drawPredictionsShareCard(ctx: CanvasRenderingContext2D, data: PredictionShareData): Promise<void> {
  const fontSpecs = [sora(800, 88), sora(800, 64), sora(800, 52), sora(700, 52), sora(700, 44), sora(700, 30), mono(700, 26), mono(500, 30), mono(500, 22)];
  const [, mark] = await Promise.all([loadShareFonts(fontSpecs), loadBrandMark()]);

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx);
  drawHeader(ctx, data, mark);

  const rows = data.top.length;
  const stackH =
    (rows > 0 ? rows * ROW_H + (rows - 1) * ROW_GAP : 0) + (data.me ? ME_GAP + ROW_H : 0);
  let y = STACK_TOP + Math.max(0, (STACK_BOTTOM - STACK_TOP - stackH) / 2);

  for (const row of data.top) {
    drawRow(ctx, row, y);
    y += ROW_H + ROW_GAP;
  }

  if (data.me) {
    y += ME_GAP - ROW_GAP;
    // Alpha alto de propósito: a 1080px de largura reduzidos a ~370 na tela, um tracejado a 0.1
    // simplesmente some.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 16]);
    ctx.beginPath();
    ctx.moveTo(PAD + 40, y - ME_GAP / 2);
    ctx.lineTo(W - PAD - 40, y - ME_GAP / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    drawRow(ctx, data.me, y);
  }

  drawFooter(ctx, data);
}
