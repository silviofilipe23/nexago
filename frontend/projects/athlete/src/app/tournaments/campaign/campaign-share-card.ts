import {
  DIM,
  INK,
  MUTE,
  ORANGE,
  drawWordmark,
  fitFont,
  hexA,
  inter,
  loadImage,
  loadShareFonts,
  mono,
  sora,
  tracked,
  truncate,
} from '../share-canvas';
import { CAMPAIGN_ROWS_COMFORT, type CampaignPlacement, type CampaignRow, type CampaignShareData } from './campaign-share';

/**
 * Desenho do card de CAMPANHA — a campanha inteira do atleta num torneio, nas quatro variantes
 * dos protótipos: campeão, vice, terceiro e eliminado.
 *
 * Arquivo próprio, como os outros três cards do portal: medir, cortar, carregar foto e a paleta
 * base vêm de `../share-canvas.ts`; o desenho abaixo é só desta arte. Juntar os desenhos faria
 * uma mudança de layout aqui respingar no pôster de partida.
 *
 * 1080×1920 (9:16) — Instagram Stories e status do WhatsApp, os destinos reais da folha nativa.
 * Sem link e sem QR: o compartilhamento é só a imagem.
 *
 * O CAMPEÃO inverte o card: fundo laranja, tinta preta. Os outros três são quase-preto com o
 * título na cor da colocação. O painel da trajetória é escuro nas quatro.
 */

export const CAMPAIGN_CARD_WIDTH = 1080;
export const CAMPAIGN_CARD_HEIGHT = 1920;

const W = CAMPAIGN_CARD_WIDTH;
const H = CAMPAIGN_CARD_HEIGHT;
/** Margem lateral, a mesma do pôster de partida. */
const M = 72;

const LOGO_SRC = '/brand/logo.png';
const LOGO_SIZE = 60;
const LOGO_TOP = 85;
const LOGO_GAP = 18;

const WIN_GREEN = '#2bd17e';
const LOSS_RED = '#ff3b30';

interface CampaignSkin {
  bg: string;
  /** Tinta do bloco de cima (fora do painel). */
  ink: string;
  mute: string;
  dim: string;
  /** Cor do título gigante. */
  title: string;
  /** Halo radial no canto superior direito. */
  halo: string;
  /** Selo de colocação; `null` quando o próprio título já diz tudo. */
  badge: string | null;
  badgeBg: string;
  badgeInk: string;
  wordmarkNexa: string;
  wordmarkGo: string;
  /** Placa arredondada atrás da marca. `null` quando a marca já contrasta com o fundo.
   *
   *  Existe por um motivo concreto: `/brand/logo.png` é um "N" LARANJA, e no card do campeão —
   *  fundo laranja — ele simplesmente desaparecia. A placa preta é o mesmo tratamento do
   *  protótipo. Nos cards escuros a marca contrasta sozinha e a placa fica de fora. */
  markPlate: string | null;
  /** Aro das fotos. */
  ring: string;
}

const SKINS: Record<CampaignPlacement, CampaignSkin> = {
  champion: {
    bg: ORANGE,
    ink: '#0a0a0a',
    mute: 'rgba(10, 10, 10, 0.66)',
    dim: 'rgba(10, 10, 10, 0.5)',
    title: '#0a0a0a',
    halo: 'rgba(255, 255, 255, 0.16)',
    badge: null,
    badgeBg: '#0a0a0a',
    badgeInk: ORANGE,
    wordmarkNexa: '#0a0a0a',
    wordmarkGo: '#0a0a0a',
    markPlate: '#0a0a0a',
    ring: 'rgba(10, 10, 10, 0.28)',
  },
  'runner-up': {
    bg: '#0a0a0a',
    ink: INK,
    mute: MUTE,
    dim: DIM,
    title: '#c8cdd4',
    halo: 'rgba(200, 205, 212, 0.14)',
    badge: '2º LUGAR',
    badgeBg: 'rgba(200, 205, 212, 0.16)',
    badgeInk: '#e6eaef',
    wordmarkNexa: INK,
    wordmarkGo: ORANGE,
    markPlate: null,
    ring: 'rgba(255, 255, 255, 0.18)',
  },
  third: {
    bg: '#0a0a0a',
    ink: INK,
    mute: MUTE,
    dim: DIM,
    title: '#c88a4f',
    halo: 'rgba(200, 138, 79, 0.16)',
    badge: '3º LUGAR',
    badgeBg: 'rgba(200, 138, 79, 0.18)',
    badgeInk: '#e8b98a',
    wordmarkNexa: INK,
    wordmarkGo: ORANGE,
    markPlate: null,
    ring: 'rgba(255, 255, 255, 0.18)',
  },
  none: {
    bg: '#0a0a0a',
    ink: INK,
    mute: MUTE,
    dim: DIM,
    title: ORANGE,
    halo: 'rgba(255, 106, 26, 0.16)',
    badge: null,
    badgeBg: 'rgba(255, 106, 26, 0.18)',
    badgeInk: '#ffb184',
    wordmarkNexa: INK,
    wordmarkGo: ORANGE,
    markPlate: null,
    ring: 'rgba(255, 255, 255, 0.18)',
  },
};

const TITLES: Record<CampaignPlacement, string> = {
  champion: 'CAMPEÃO',
  'runner-up': 'VICE-CAMPEÃO',
  third: 'TERCEIRO',
  none: 'CAMPANHA',
};

// ——— Painel da trajetória ———
// O painel é ancorado no RODAPÉ e cresce pra cima: é o que faz os quatro protótipos funcionarem
// com número diferente de jogos — com 4 linhas sobra respiro no meio, com 6 ele encosta no bloco
// de cima.
const PANEL_BOTTOM = 1672;
const PANEL_PAD_X = 34;
const PANEL_HEAD_H = 96;
const PANEL_PAD_BOTTOM = 26;
const ROW_PITCH_COMFORT = 130;
/** O piso do degrau 2 do transbordo: acima de `CAMPAIGN_ROWS_COMFORT` linhas o passo aperta. */
const ROW_PITCH_TIGHT = 104;

/** Onde termina o bloco de cima: centro das fotos + o disco externo que `drawAvatar` desenha
 *  (`r + 9`). O painel cresce pra cima e NÃO pode passar daqui. */
export const CAMPAIGN_HERO_BOTTOM = 556 + 95;

/** Respiro mínimo entre as fotos e o topo do painel. */
export const CAMPAIGN_PANEL_GAP = 24;

export interface CampaignPanelLayout {
  top: number;
  height: number;
  pitch: number;
}

/**
 * Geometria do painel para um número de linhas — função pura, sem canvas, exportada para ser
 * verificável.
 *
 * O painel é ancorado no rodapé e cresce pra cima, então cada linha a mais empurra o topo em
 * direção às fotos do atleta. `campaign-share-card.spec.ts` percorre 1..`CAMPAIGN_ROWS_MAX` e
 * falha se o topo invadir `CAMPAIGN_HERO_BOTTOM` — é o que amarra `CAMPAIGN_ROWS_COMFORT` e
 * `CAMPAIGN_ROWS_MAX` (`campaign-share.ts`) a esta geometria em vez de deixar os dois números
 * soltos. A primeira versão trazia 7 e 9, e nos dois casos o painel passava por cima das fotos.
 */
export function campaignPanelLayoutOf(rowCount: number): CampaignPanelLayout {
  const pitch = rowCount <= CAMPAIGN_ROWS_COMFORT ? ROW_PITCH_COMFORT : ROW_PITCH_TIGHT;
  const height = PANEL_HEAD_H + rowCount * pitch + PANEL_PAD_BOTTOM;
  return { top: PANEL_BOTTOM - height, height, pitch };
}

/**
 * Placeholder das fotos: neutros escuros, como nos quatro protótipos — NÃO o gradiente colorido
 * de `.duo-avatar` que o pôster de partida usa.
 *
 * Dois motivos. No card do CAMPEÃO o fundo é laranja, e o gradiente laranja→magenta do portal
 * brigava com ele. E nos quatro o retrato não deve competir com o título, que é o elemento
 * principal desta arte — coisa que não vale no pôster de partida, onde as fotos SÃO o assunto.
 */
const AVATAR_GRAD: [string, string][] = [
  ['#2b3b50', '#18222f'],
  ['#3d3a34', '#26241f'],
];

/** Iniciais sobre o placeholder neutro: cinza claro, não branco puro. */
const AVATAR_INITIAL_INK = '#c9ced6';

/** Foto circular com aro; sem foto, iniciais sobre o gradiente do avatar dos cards. */
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  initial: string,
  index: number,
  x: number,
  y: number,
  r: number,
  skin: CampaignSkin,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r + 9, 0, Math.PI * 2);
  ctx.fillStyle = skin.bg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.strokeStyle = skin.ring;
  ctx.lineWidth = 5;
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
    ctx.fillStyle = AVATAR_INITIAL_INK;
    ctx.font = sora(700, r * 0.62);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, x, y + r * 0.04);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** Pill arredondada com texto centrado. Devolve a largura ocupada. */
function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  left: number,
  cy: number,
  padX: number,
  h: number,
  bg: string,
  fg: string,
): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.beginPath();
  ctx.roundRect(left, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padX, cy + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, skin: CampaignSkin): void {
  ctx.fillStyle = skin.bg;
  ctx.fillRect(0, 0, W, H);

  // Halo no canto superior direito — o disco claro dos protótipos.
  const glow = ctx.createRadialGradient(W - 60, 200, 60, W - 60, 200, 640);
  glow.addColorStop(0, skin.halo);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 900);
}

/** Marca + wordmark à esquerda, intervalo de datas à direita. Sem a marca (asset que falhou), o
 *  wordmark volta pra margem em vez de deixar o buraco dela — mesma regra do pôster de partida. */
function drawHeader(ctx: CanvasRenderingContext2D, data: CampaignShareData, logo: HTMLImageElement | null, skin: CampaignSkin): void {
  if (logo) {
    if (skin.markPlate) {
      ctx.beginPath();
      ctx.roundRect(M - 8, LOGO_TOP - 8, LOGO_SIZE + 16, LOGO_SIZE + 16, 18);
      ctx.fillStyle = skin.markPlate;
      ctx.fill();
    }
    ctx.drawImage(logo, M, LOGO_TOP, LOGO_SIZE, LOGO_SIZE);
  }
  drawWordmark(ctx, logo ? M + LOGO_SIZE + LOGO_GAP : M, 138, 60, skin.wordmarkNexa, skin.wordmarkGo);

  if (data.dateRangeLabel) {
    ctx.font = mono(500, 24);
    ctx.fillStyle = skin.dim;
    const text = data.dateRangeLabel.toUpperCase();
    const spacing = 6;
    const width = ctx.measureText(text).width + spacing * ([...text].length - 1);
    tracked(ctx, text, W - M - width, 128, spacing, 'left');
  }
}

/** Kicker, título gigante, nome da dupla, fotos e cartel. */
function drawHero(ctx: CanvasRenderingContext2D, data: CampaignShareData, photos: Map<string, HTMLImageElement | null>, skin: CampaignSkin): void {
  // Kicker + selo de colocação
  ctx.font = mono(500, 26);
  ctx.fillStyle = skin.mute;
  const kicker = data.categoryLine.toUpperCase();
  const kickerSpacing = 8;
  tracked(ctx, truncate(ctx, kicker, W - M * 2 - 220), M, 212, kickerSpacing, 'left');
  if (skin.badge) {
    const kickerW = ctx.measureText(kicker).width + kickerSpacing * ([...kicker].length - 1);
    drawPill(ctx, skin.badge, mono(700, 22), M + kickerW + 26, 203, 20, 44, skin.badgeBg, skin.badgeInk);
  }

  // Título: o maior elemento do card. `fitFont` encolhe, `truncate` garante o encaixe — sozinho
  // o `fitFont` para no piso e devolve o texto inteiro, vazando a margem.
  fitFont(ctx, TITLES[data.placement], W - M * 2, 168, 96, (s) => sora(800, s), 4);
  ctx.fillStyle = skin.title;
  ctx.textAlign = 'left';
  ctx.fillText(truncate(ctx, TITLES[data.placement], W - M * 2), M, 334);

  // Nome da dupla
  fitFont(ctx, data.teamName, W - M * 2, 58, 34, (s) => sora(800, s), 2);
  ctx.fillStyle = skin.ink;
  ctx.fillText(truncate(ctx, data.teamName, W - M * 2), M, 424);

  // Fotos sobrepostas + cartel
  const r = 86;
  const cy = 556;
  const cx1 = M + r;
  const cx2 = cx1 + r * 1.5;
  // O segundo desenha por cima: é a sobreposição dos protótipos.
  data.players.forEach((p, i) => {
    const img = p.photo ? (photos.get(p.photo) ?? null) : null;
    drawAvatar(ctx, img, p.initial, i, i === 0 ? cx1 : cx2, cy, r, skin);
  });

  ctx.font = mono(700, 34);
  ctx.fillStyle = skin.mute;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${data.wins}V · ${data.losses}D`, cx2 + r + 44, cy + 2);
  ctx.textBaseline = 'alphabetic';
}

function drawRow(ctx: CanvasRenderingContext2D, row: CampaignRow, cy: number, left: number, right: number): void {
  // Selo V/D — quadrado arredondado, o marcador dos protótipos.
  const badgeSize = 46;
  const badgeX = left;
  ctx.beginPath();
  ctx.roundRect(badgeX, cy - badgeSize / 2, badgeSize, badgeSize, 13);
  if (row.kind === 'match') {
    ctx.fillStyle = row.outcome === 'win' ? WIN_GREEN : LOSS_RED;
    ctx.fill();
    ctx.font = sora(800, 24);
    ctx.fillStyle = row.outcome === 'win' ? '#08331f' : '#3a0906';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.outcome === 'win' ? 'V' : 'D', badgeX + badgeSize / 2, cy + 1);
    ctx.textBaseline = 'alphabetic';
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
  }

  const textLeft = badgeX + badgeSize + 26;
  // A coluna da direita é medida primeiro: é ela que limita a largura do nome do adversário.
  const rightText = row.kind === 'match' ? row.setScore : `${row.wins}V ${row.losses}D`;
  ctx.font = row.kind === 'match' ? mono(800, 46) : mono(700, 32);
  const rightW = ctx.measureText(rightText).width;
  const subText = row.kind === 'match' ? row.partials.join('  ') : `${row.games} jogos`;
  ctx.font = mono(500, 22);
  const subW = ctx.measureText(subText).width;
  const textRight = right - Math.max(rightW, subW) - 30;

  ctx.textAlign = 'left';
  ctx.font = mono(500, 20);
  ctx.fillStyle = DIM;
  tracked(ctx, row.phaseLabel.toUpperCase(), textLeft, cy - 14, 4, 'left');

  ctx.font = sora(700, 32);
  ctx.fillStyle = INK;
  const name = row.kind === 'match' ? row.opponentName : 'Fase de grupos';
  ctx.fillText(truncate(ctx, name, Math.max(120, textRight - textLeft)), textLeft, cy + 26);

  ctx.textAlign = 'right';
  ctx.font = row.kind === 'match' ? mono(800, 46) : mono(700, 32);
  ctx.fillStyle = INK;
  ctx.fillText(rightText, right, cy + 2);
  ctx.font = mono(500, 22);
  ctx.fillStyle = DIM;
  ctx.fillText(subText, right, cy + 34);
  ctx.textAlign = 'left';
}

/** O painel escuro, ancorado no rodapé e crescendo pra cima. Devolve o topo dele — o desenho de
 *  cima não pode invadir esse espaço. */
function drawPanel(ctx: CanvasRenderingContext2D, data: CampaignShareData): number {
  const rows = data.trajectory.rows;
  const { top, height, pitch } = campaignPanelLayoutOf(rows.length);
  const left = M + PANEL_PAD_X;
  const right = W - M - PANEL_PAD_X;

  ctx.beginPath();
  ctx.roundRect(M, top, W - M * 2, height, 34);
  ctx.fillStyle = 'rgba(13, 13, 13, 0.96)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Cabeçalho do painel: total de jogos à esquerda, saldo de sets à direita. O corte, quando
  // existe, é declarado aqui — nunca silencioso.
  const games = data.wins + data.losses;
  const headLeft =
    data.trajectory.hiddenCount > 0 ? `TRAJETÓRIA · ${games} JOGOS · +${data.trajectory.hiddenCount} FORA` : `TRAJETÓRIA · ${games} JOGOS`;
  ctx.font = mono(700, 24);
  ctx.fillStyle = ORANGE;
  tracked(ctx, headLeft, left, top + 58, 5, 'left');

  const headRight = `SETS ${data.setsWon}–${data.setsLost}`;
  ctx.font = mono(500, 24);
  ctx.fillStyle = DIM;
  const spacing = 5;
  const rightW = ctx.measureText(headRight).width + spacing * ([...headRight].length - 1);
  tracked(ctx, headRight, right - rightW, top + 58, spacing, 'left');

  rows.forEach((row, i) => {
    const cy = top + PANEL_HEAD_H + pitch * i + pitch / 2;
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(left, cy - pitch / 2);
      ctx.lineTo(right, cy - pitch / 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    drawRow(ctx, row, cy, left, right);
  });

  return top;
}

function drawFooter(ctx: CanvasRenderingContext2D, data: CampaignShareData, skin: CampaignSkin): void {
  ctx.beginPath();
  ctx.moveTo(M, 1742);
  ctx.lineTo(W - M, 1742);
  ctx.strokeStyle = hexA('#ffffff', 0.1);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
  fitFont(ctx, data.tournamentName, W - M * 2 - 260, 34, 24, (s) => sora(700, s), 2);
  ctx.fillStyle = skin.ink;
  ctx.fillText(truncate(ctx, data.tournamentName, W - M * 2 - 260), M, 1806);

  const sub = [data.locationName, data.winRateLabel].filter((p): p is string => p != null && p.length > 0).join(' · ');
  if (sub) {
    ctx.font = inter(400, 26);
    ctx.fillStyle = skin.mute;
    ctx.fillText(truncate(ctx, sub, W - M * 2 - 260), M, 1850);
  }

  ctx.font = mono(500, 22);
  ctx.fillStyle = skin.dim;
  const cta = 'BAIXE O APP';
  const spacing = 5;
  const ctaW = ctx.measureText(cta).width + spacing * ([...cta].length - 1);
  tracked(ctx, cta, W - M - ctaW, 1802, spacing, 'left');

  ctx.font = sora(800, 30);
  const siteW = ctx.measureText('nexago.app').width;
  ctx.fillStyle = skin.ink;
  ctx.fillText('nexago.app', W - M - siteW, 1850);
}

/** Desenha o card completo. Assíncrono porque espera fontes e fotos antes do primeiro traço —
 *  depois disso o desenho é síncrono e atômico. */
export async function drawCampaignShareCard(ctx: CanvasRenderingContext2D, data: CampaignShareData): Promise<void> {
  await loadShareFonts([
    sora(800, 168),
    sora(800, 60),
    sora(800, 58),
    sora(700, 34),
    sora(700, 32),
    mono(800, 46),
    mono(700, 34),
    mono(500, 24),
    inter(400, 26),
  ]);

  const urls = [...new Set(data.players.map((p) => p.photo).filter((p): p is string => p != null))];
  const photos = new Map<string, HTMLImageElement | null>();
  const pending = Promise.all(urls.map(async (url) => photos.set(url, await loadImage(url))));
  const logo = await loadImage(LOGO_SRC);
  await pending;

  const skin = SKINS[data.placement];

  ctx.clearRect(0, 0, W, H);
  drawBackdrop(ctx, skin);
  drawHeader(ctx, data, logo, skin);
  drawHero(ctx, data, photos, skin);
  drawPanel(ctx, data);
  drawFooter(ctx, data, skin);
}
