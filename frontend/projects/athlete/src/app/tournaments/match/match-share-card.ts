import { DIM, INK, MUTE, ORANGE, drawWordmark, fitFont, hexA, inter, loadImage, loadShareFonts, mono, sora, tracked, truncate } from '../share-canvas';

/** Desenho do pôster de compartilhamento — porta do SharePoster do site da Copa VH para o
 *  portal do atleta. Fica separado do componente porque é código de canvas puro — sem Angular,
 *  sem Firestore — e porque o formato do card é a parte que mais tende a mudar.
 *
 *  Medir, cortar, carregar foto e a paleta base vêm de `../share-canvas.ts`, compartilhados com
 *  os outros cards do portal. O desenho abaixo é só desta arte.
 *
 *  Formato 1080×1920 (9:16): é a proporção do Instagram Stories e do status do WhatsApp, os dois
 *  destinos reais do botão. Não existe link nem QR no card: o compartilhamento é só a imagem.
 *
 *  Duas composições, como na Copa VH:
 *  - partida encerrada → arte de resultado (fotos gigantes do vencedor, placar, parciais);
 *  - agendada/ao vivo → arte de confronto (as duas duplas, VS no meio).
 *  Final e 3º lugar ganham paleta própria (ouro/bronze); o resto usa o laranja da marca. */

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;

const W = SHARE_CARD_WIDTH;
const H = SHARE_CARD_HEIGHT;
const CX = W / 2;

export interface SharePlayer {
  initial: string;
  photo: string | null;
}

export interface ShareTeam {
  name: string;
  players: [SharePlayer, SharePlayer];
}

export type ShareStage = 'final' | 'third' | 'game';

export interface ShareCardData {
  tournamentName: string | null;
  /** "Semifinal" / "Grupo A · rodada 2" — vira o selo quando a fase não tem paleta própria. */
  phaseLabel: string;
  categoryName: string | null;
  stage: ShareStage;
  live: boolean;
  finished: boolean;
  teamA: ShareTeam;
  teamB: ShareTeam;
  winner: 'A' | 'B' | null;
  /** Sets já fechados. */
  sets: { a: number; b: number }[];
  setWins: [number, number];
  /** "1–0 · 2º set 14-11" — só ao vivo. */
  liveLine: string | null;
  /** "MELHOR DE 3" / "SET ÚNICO". */
  formatLine: string;
  /** "Sáb 02/08 · 17:30 · Quadra 1" — rodapé. */
  dateLine: string | null;
}

const LIVE = '#ff3b30';

/** Marca do cabeçalho: quadrada, centrada na altura das maiúsculas do wordmark
 *  (topo em 92, baseline em 138). */
const LOGO_SRC = '/brand/logo.png';
const LOGO_SIZE = 60;
const LOGO_TOP = 85;
const LOGO_GAP = 18;

interface Metal {
  main: string;
  hi: string;
  onBadge: string;
  badge: string;
  crown: string;
  winLabel: string;
  loseLabel: string;
  markDone: string;
  markPending: string;
}

const METAL: Record<ShareStage, Metal> = {
  final: {
    main: '#f2c14e',
    hi: '#ffe9a8',
    onBadge: '#241a00',
    badge: '🏆 FINAL',
    crown: '👑',
    winLabel: 'CAMPEÕES',
    loseLabel: 'VICE-CAMPEÕES',
    markDone: 'CAMPEÕES',
    markPending: 'FINAL',
  },
  third: {
    main: '#d08a5a',
    hi: '#f3c9a8',
    onBadge: '#2a1608',
    badge: '🥉 3º LUGAR',
    crown: '🥉',
    winLabel: '3º LUGAR',
    loseLabel: '4º LUGAR',
    markDone: 'BRONZE',
    markPending: 'BRONZE',
  },
  game: {
    main: '#ff6a1a',
    hi: '#ff8a4a',
    onBadge: '#0a0a0a',
    badge: '', // calculado a partir da fase da partida
    crown: '🏐',
    winLabel: 'VITÓRIA',
    loseLabel: 'ADVERSÁRIOS',
    markDone: 'VITÓRIA',
    markPending: 'NEXAGO',
  },
};

// Mesmos gradientes dos avatares dos cards (.duo-avatar / :nth-child(2)).
const AVATAR_GRAD: [string, string][] = [
  ['#ff6a1a', '#c2185b'],
  ['#2bd17e', '#1e7a4d'],
];

function metalGradient(ctx: CanvasRenderingContext2D, m: Metal, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, m.hi);
  g.addColorStop(1, m.main);
  return g;
}

/** Foto circular com aro; sem foto, iniciais sobre o gradiente do avatar dos cards. */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  initial: string,
  index: number,
  x: number,
  y: number,
  r: number,
  ring: string | CanvasGradient,
  ringWidth: number,
): void {
  ctx.save();
  // respiro escuro entre o aro e a foto
  ctx.beginPath();
  ctx.arc(x, y, r + ringWidth + 6, 0, Math.PI * 2);
  ctx.fillStyle = '#050505';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r + ringWidth / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  } else {
    const [c1, c2] = AVATAR_GRAD[index % 2]!;
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = sora(700, r * 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x, y + r * 0.04);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** Dupla: duas fotos sobrepostas centradas em (cx, cy). */
function drawPair(
  ctx: CanvasRenderingContext2D,
  team: ShareTeam,
  photos: Map<string, HTMLImageElement | null>,
  cx: number,
  cy: number,
  r: number,
  ring: string | CanvasGradient,
  ringWidth: number,
): void {
  const off = r * 0.88;
  team.players.forEach((p, i) => {
    const img = p.photo ? (photos.get(p.photo) ?? null) : null;
    drawAvatar(ctx, img, p.initial, i, cx + (i === 0 ? -off : off), cy, r, ring, ringWidth);
  });
}

/** Pill arredondada com texto centrado. */
function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  cx: number,
  cy: number,
  padX: number,
  h: number,
  bg: string | CanvasGradient,
  fg: string,
  stroke?: string,
): void {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 2);
  ctx.textBaseline = 'alphabetic';
}

function drawBackdrop(ctx: CanvasRenderingContext2D, m: Metal, mark: string, finished: boolean): void {
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // banho metálico descendo do topo
  const wash = ctx.createLinearGradient(0, 0, 0, H * 0.45);
  wash.addColorStop(0, hexA(m.main, 0.13));
  wash.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H * 0.45);

  // brilho radial atrás das fotos
  const glow = ctx.createRadialGradient(CX, 800, 80, CX, 800, 660);
  glow.addColorStop(0, hexA(m.main, finished ? 0.22 : 0.14));
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // calor laranja da marca no rodapé
  const foot = ctx.createRadialGradient(CX, H + 160, 60, CX, H + 160, 700);
  foot.addColorStop(0, 'rgba(255, 106, 26, 0.14)');
  foot.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, H - 700, W, 700);

  // linhas diagonais: marcação de quadra sobre a areia
  ctx.save();
  ctx.translate(CX, H / 2);
  ctx.rotate(-0.42);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
  ctx.lineWidth = 2;
  for (let i = -13; i <= 13; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 115, -1400);
    ctx.lineTo(i * 115, 1400);
    ctx.stroke();
  }
  ctx.restore();

  // marca d'água vertical vazada na borda direita — assinatura do pôster
  ctx.save();
  ctx.translate(W - 74, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = sora(800, 210);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = hexA(m.main, 0.1);
  ctx.lineWidth = 3;
  ctx.strokeText(mark, 0, 0);
  ctx.restore();

  if (finished) {
    const sparks: [number, number, number, number][] = [
      [150, 470, 44, 0.8],
      [910, 400, 30, 0.55],
      [120, 1130, 26, 0.45],
      [950, 1210, 40, 0.75],
      [225, 1555, 24, 0.4],
      [845, 285, 22, 0.5],
    ];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [x, y, size, alpha] of sparks) {
      ctx.font = `${size}px sans-serif`;
      ctx.fillStyle = hexA(m.main, alpha);
      ctx.fillText('✦', x, y);
    }
    ctx.textBaseline = 'alphabetic';
  }
}

/** Cabeçalho: marca + wordmark, alinhados à margem de 72.
 *  Sem a marca (falha ao carregar o asset) o wordmark volta pra margem, em vez
 *  de deixar o buraco dela — a mesma regra vale no app. */
function drawHeader(ctx: CanvasRenderingContext2D, tournamentName: string | null, logo: HTMLImageElement | null): void {
  if (logo) ctx.drawImage(logo, 72, LOGO_TOP, LOGO_SIZE, LOGO_SIZE);
  drawWordmark(ctx, logo ? 72 + LOGO_SIZE + LOGO_GAP : 72, 138, 64);
  if (tournamentName) {
    ctx.font = mono(500, 22);
    ctx.fillStyle = DIM;
    tracked(ctx, truncate(ctx, tournamentName.toUpperCase(), W - 300), 72, 186, 5, 'left');
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, dateLine: string | null): void {
  ctx.font = mono(500, 26);
  ctx.fillStyle = DIM;
  tracked(ctx, (dateLine ?? 'Acompanhe no nexaGO').toUpperCase(), CX, 1766, 6);

  // lockup pequeno centrado no pé
  const size = 40;
  ctx.font = sora(800, size);
  const wordW = ctx.measureText('nexaGO').width;
  drawWordmark(ctx, CX - wordW / 2, 1848, size);
}

function drawResult(ctx: CanvasRenderingContext2D, data: ShareCardData, photos: Map<string, HTMLImageElement | null>, m: Metal): void {
  const featured = data.winner === 'B' ? data.teamB : data.teamA;
  const other = featured === data.teamA ? data.teamB : data.teamA;
  const featSide: 'A' | 'B' = featured === data.teamA ? 'A' : 'B';

  const singleSet = data.sets.length === 1;
  // set único: os próprios pontos são o placar da arte (21 × 18); melhor de 3: sets vencidos
  const big = singleSet
    ? { win: featSide === 'A' ? data.sets[0]!.a : data.sets[0]!.b, lose: featSide === 'A' ? data.sets[0]!.b : data.sets[0]!.a }
    : { win: featSide === 'A' ? data.setWins[0] : data.setWins[1], lose: featSide === 'A' ? data.setWins[1] : data.setWins[0] };

  // coroa/medalha + fotos gigantes da dupla vencedora
  ctx.font = '80px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(m.crown, CX, 588);
  drawPair(ctx, featured, photos, CX, 800, 185, metalGradient(ctx, m, CX - 340, 615, CX + 340, 985), 8);

  // nome da dupla em destaque
  // `fitFont` encolhe até o piso e devolve o texto inteiro do jeito que estiver — quem garante o
  // encaixe é o `truncate`, medindo já com a fonte ajustada. Sem ele, dupla de nome longo vaza a borda.
  fitFont(ctx, featured.name, 930, 96, 56, (s) => sora(800, s));
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(truncate(ctx, featured.name, 930), CX, 1108);

  // rótulo em degradê metálico
  ctx.font = sora(800, 46);
  ctx.fillStyle = metalGradient(ctx, m, CX - 240, 1150, CX + 240, 1195);
  tracked(ctx, m.winLabel, CX, 1188, 16);

  // placar gigante
  const scoreY = 1408;
  ctx.font = mono(800, 215);
  const winTxt = String(big.win);
  const loseTxt = String(big.lose);
  const winW = ctx.measureText(winTxt).width;
  const loseW = ctx.measureText(loseTxt).width;
  ctx.font = mono(400, 88);
  const xW = ctx.measureText('×').width;
  const gap = 56;
  let x = CX - (winW + gap + xW + gap + loseW) / 2;
  ctx.textAlign = 'left';
  ctx.font = mono(800, 215);
  ctx.fillStyle = metalGradient(ctx, m, x, scoreY - 190, x + winW, scoreY);
  ctx.fillText(winTxt, x, scoreY);
  x += winW + gap;
  ctx.font = mono(400, 88);
  ctx.fillStyle = DIM;
  ctx.fillText('×', x, scoreY - 52);
  x += xW + gap;
  ctx.font = mono(800, 215);
  ctx.fillStyle = 'rgba(244, 244, 245, 0.26)';
  ctx.fillText(loseTxt, x, scoreY);

  // parciais (melhor de 3): pills na perspectiva da dupla em destaque
  if (!singleSet && data.sets.length > 0) {
    ctx.font = mono(700, 36);
    const texts = data.sets.map((s) => (featSide === 'A' ? `${s.a}·${s.b}` : `${s.b}·${s.a}`));
    const widths = texts.map((t) => ctx.measureText(t).width + 64);
    const totalW = widths.reduce((a, b) => a + b, 0) + (texts.length - 1) * 20;
    let px = CX - totalW / 2;
    texts.forEach((t, i) => {
      drawPill(ctx, t, mono(700, 36), px + widths[i]! / 2, 1508, 32, 72, 'rgba(27, 27, 31, 0.92)', INK, 'rgba(255, 255, 255, 0.1)');
      px += widths[i]! + 20;
    });
  }

  // a outra dupla (vice, 4º lugar ou adversários)
  const rowY = singleSet ? 1560 : 1638;
  ctx.font = mono(500, 24);
  ctx.fillStyle = DIM;
  tracked(ctx, m.loseLabel, CX, rowY, 8);
  const nameSize = fitFont(ctx, other.name, 560, 40, 28, (s) => inter(600, s));
  // corta antes de medir: a linha é centrada a partir da largura do nome, então o texto que
  // realmente vai ser desenhado tem de ser o mesmo que entra na conta do `rowW`.
  const otherName = truncate(ctx, other.name, 560);
  const r = 42;
  const pairW = r * 2 + r * 1.3;
  const rowW = pairW + 26 + ctx.measureText(otherName).width;
  const startX = CX - rowW / 2;
  drawPair(ctx, other, photos, startX + pairW / 2, rowY + 62, r, 'rgba(255, 255, 255, 0.25)', 3);
  ctx.font = inter(600, nameSize);
  ctx.fillStyle = MUTE;
  ctx.textAlign = 'left';
  ctx.fillText(otherName, startX + pairW + 26, rowY + 62 + nameSize * 0.34);
}

function drawMatchup(ctx: CanvasRenderingContext2D, data: ShareCardData, photos: Map<string, HTMLImageElement | null>, m: Metal): void {
  if (data.live) {
    ctx.save();
    ctx.shadowColor = 'rgba(255, 59, 48, 0.55)';
    ctx.shadowBlur = 30;
    drawPill(ctx, '● AO VIVO', mono(700, 26), CX, 516, 34, 64, LIVE, '#fff');
    ctx.restore();
  }

  const drawTeam = (team: ShareTeam, photoCy: number, nameY: number) => {
    drawPair(ctx, team, photos, CX, photoCy, 150, metalGradient(ctx, m, CX - 280, photoCy - 150, CX + 280, photoCy + 150), 7);
    fitFont(ctx, team.name, 930, 84, 52, (s) => sora(800, s), 4);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(truncate(ctx, team.name, 930), CX, nameY);
  };

  drawTeam(data.teamA, 712, 952);
  drawTeam(data.teamB, 1300, 1540);

  // divisor VS
  const vsY = 1082;
  ctx.strokeStyle = hexA(m.main, 0.35);
  ctx.lineWidth = 2;
  for (const [x0, x1] of [
    [150, CX - 110],
    [CX + 110, 930],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, vsY);
    ctx.lineTo(x1, vsY);
    ctx.stroke();
  }
  ctx.font = mono(800, 74);
  ctx.fillStyle = metalGradient(ctx, m, CX - 60, vsY - 60, CX + 60, vsY + 30);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VS', CX, vsY);
  ctx.textBaseline = 'alphabetic';

  // ao vivo, o placar do momento vale mais que o formato do jogo
  ctx.font = mono(500, 26);
  ctx.fillStyle = data.live && data.liveLine ? MUTE : DIM;
  tracked(ctx, (data.live && data.liveLine ? data.liveLine : data.formatLine).toUpperCase(), CX, 1652, 6);
}

/** Desenha o pôster completo. Assíncrono porque espera fontes e fotos dos atletas antes do
 *  primeiro traço — depois disso o desenho em si é síncrono e atômico. */
export async function drawShareCard(ctx: CanvasRenderingContext2D, data: ShareCardData): Promise<void> {
  await loadShareFonts([sora(800, 210), sora(800, 96), sora(800, 64), sora(800, 46), mono(800, 215), mono(700, 36), mono(500, 26), inter(600, 40)]);

  const urls = [...new Set([...data.teamA.players, ...data.teamB.players].map((p) => p.photo).filter((p): p is string => p != null))];
  const photos = new Map<string, HTMLImageElement | null>();
  const pending = Promise.all(urls.map(async (url) => photos.set(url, await loadImage(url))));
  const logo = await loadImage(LOGO_SRC);
  await pending;

  const m = METAL[data.stage];

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, m, data.finished ? m.markDone : m.markPending, data.finished);
  drawHeader(ctx, data.tournamentName, logo);

  // selo da fase
  const badge = m.badge || `🏐 ${data.phaseLabel.toUpperCase()}`;
  ctx.save();
  ctx.shadowColor = hexA(m.main, 0.5);
  ctx.shadowBlur = 46;
  ctx.font = sora(700, 40);
  drawPill(ctx, truncate(ctx, badge, 820), sora(700, 40), CX, 330, 50, 92, metalGradient(ctx, m, CX - 160, 284, CX + 160, 376), m.onBadge);
  ctx.restore();

  if (data.categoryName) {
    ctx.font = mono(700, 30);
    ctx.fillStyle = MUTE;
    tracked(ctx, truncate(ctx, data.categoryName.toUpperCase(), W - 260), CX, 438, 9);
  }

  if (data.finished && data.winner) drawResult(ctx, data, photos, m);
  else drawMatchup(ctx, data, photos, m);

  drawFooter(ctx, data.dateLine);
}
