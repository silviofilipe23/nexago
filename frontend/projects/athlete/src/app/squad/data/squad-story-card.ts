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
} from '../../tournaments/share-canvas';

/**
 * Card pro story do embaixador (1080×1920, como os outros cards do portal): o código grande, o
 * desconto de quem usa e o QR que já leva `&via=qr`. A arte é só daqui; o ferramental vem de
 * `tournaments/share-canvas.ts`.
 */
export interface SquadStoryData {
  code: string;
  /** "até 10% OFF na primeira inscrição". */
  offer: string;
  name: string;
  tierLabel: string;
  /** PNG do QR (data URL). Sem ele o card sai só com o código. */
  qrPng: string | null;
  linkLabel: string;
}

const W = SHARE_POSTER_WIDTH;
const H = SHARE_POSTER_HEIGHT;
const CX = W / 2;
const PAD = 80;

export async function drawSquadStoryCard(canvas: HTMLCanvasElement, data: SquadStoryData): Promise<void> {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await loadShareFonts([sora(800, 96), mono(700, 28), sora(600, 40)]);
  const [mark, qr] = await Promise.all([loadBrandMark(), data.qrPng ? loadImage(data.qrPng) : Promise.resolve(null)]);

  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(0, 0, 40, 0, 0, 1500);
  glow.addColorStop(0, hexA(ORANGE, 0.34));
  glow.addColorStop(0.6, hexA(ORANGE, 0.05));
  glow.addColorStop(1, hexA(ORANGE, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Marca.
  let x = PAD;
  if (mark) {
    ctx.drawImage(mark, PAD, 112, 64, 64);
    x += 82;
  }
  drawWordmark(ctx, x, 164, 52);
  ctx.font = mono(700, 24);
  ctx.fillStyle = ORANGE;
  ctx.textAlign = 'left';
  tracked(ctx, 'SQUAD', W - PAD - 118, 158, 6, 'left');

  // Chamada.
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = sora(800, 96);
  ctx.fillText('Bora pra areia?', PAD, 400);
  ctx.fillStyle = MUTE;
  ctx.font = sora(600, 44);
  ctx.fillText('Use meu código na sua inscrição.', PAD, 476);

  // Código.
  const boxY = 560;
  const boxH = 250;
  ctx.fillStyle = ORANGE;
  roundRect(ctx, PAD, boxY, W - PAD * 2, boxH, 36);
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'center';
  const size = fitFont(ctx, data.code, W - PAD * 2 - 80, 170, 72, (s) => sora(800, s), 4);
  ctx.fillText(data.code, CX, boxY + boxH / 2 + size * 0.36);

  ctx.fillStyle = INK;
  ctx.font = sora(700, 46);
  ctx.fillText(truncate(ctx, data.offer, W - PAD * 2), CX, boxY + boxH + 92);

  // QR.
  const qrSize = 520;
  const qrY = 1020;
  if (qr) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, CX - qrSize / 2 - 24, qrY - 24, qrSize + 48, qrSize + 48, 32);
    ctx.fill();
    ctx.drawImage(qr, CX - qrSize / 2, qrY, qrSize, qrSize);
  }

  // Rodapé.
  // O link vai como é: maiúscula quebraria o `?squad=` (o parâmetro diferencia caixa).
  ctx.fillStyle = DIM;
  ctx.font = mono(700, 30);
  ctx.fillText(truncate(ctx, data.linkLabel, W - PAD * 2), CX, H - 170);
  ctx.fillStyle = MUTE;
  ctx.font = sora(600, 36);
  ctx.fillText(truncate(ctx, `${data.name} · ${data.tierLabel}`, W - PAD * 2), CX, H - 104);
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

export function squadStoryFileName(code: string): string {
  return `nexago-squad-${code.toLowerCase()}.png`;
}
