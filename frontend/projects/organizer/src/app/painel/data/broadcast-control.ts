/** Controle da transmissão do torneio — `tournaments/{id}/broadcast/control`.
 *
 *  Gravado pela tela "Transmissão" do painel e lido SEM LOGIN pelo overlay do OBS. Doc ausente =
 *  `DEFAULT_BROADCAST_CONTROL` = exatamente o comportamento de antes do painel existir, então
 *  nenhuma transmissão em andamento muda quando isto entra no ar. */

export type BroadcastGraphicId =
  | 'scoreboard'
  | 'kocBar'
  | 'kocPreRound'
  | 'kocRoundEnd'
  | 'champions'
  | 'donation'
  | 'sponsors';

export const BROADCAST_GRAPHIC_IDS: readonly BroadcastGraphicId[] = [
  'scoreboard',
  'kocBar',
  'kocPreRound',
  'kocRoundEnd',
  'champions',
  'donation',
  'sponsors',
];

export type BroadcastGraphics = Record<BroadcastGraphicId, boolean>;

/** Tela do fim de rodada KOTC. `rodizio` = alterna sozinha (comportamento de antes). */
export type KocRoundEndScreen = 'rodizio' | 'resultado' | 'classificadas';

/** Visual de Grande final. `auto` = segue o matchType da partida. */
export type BroadcastFinalMode = 'auto' | 'on' | 'off';

/** Tarja de entrevista no ar — DESNORMALIZADA: o painel grava o que mostrou no clique, e o
 *  overlay só desenha, sem leitura extra. */
export interface BroadcastInterview {
  name: string;
  photoUrl: string | null;
  partnerName: string | null;
  categoryName: string | null;
  /** Segundos no ar. `null` = fica até "Tirar do ar". */
  durationSec: number | null;
  /** Identidade do comando: `Date.now()` do painel no clique. */
  shownAt: number;
}

/** "Mostrar agora" — carimbos, não estados: o overlay age quando o valor MUDA. */
export interface BroadcastCommands {
  donationNowAt: number;
  sponsorsNowAt: number;
}

export interface BroadcastControl {
  /** Quadra que `/transmissao/:tournamentId` acompanha. */
  courtId: string | null;
  graphics: BroadcastGraphics;
  kocRoundEndScreen: KocRoundEndScreen;
  finalMode: BroadcastFinalMode;
  interview: BroadcastInterview | null;
  commands: BroadcastCommands;
}

export const DEFAULT_BROADCAST_CONTROL: BroadcastControl = {
  courtId: null,
  graphics: {
    scoreboard: true,
    kocBar: true,
    kocPreRound: true,
    kocRoundEnd: true,
    champions: true,
    donation: true,
    sponsors: true,
  },
  kocRoundEndScreen: 'rodizio',
  finalMode: 'auto',
  interview: null,
  commands: { donationNowAt: 0, sponsorsNowAt: 0 },
};

const SCREENS: readonly KocRoundEndScreen[] = ['rodizio', 'resultado', 'classificadas'];
const FINAL_MODES: readonly BroadcastFinalMode[] = ['auto', 'on', 'off'];

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function stamp(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

function interviewFromRaw(raw: unknown): BroadcastInterview | null {
  const d = record(raw);
  const name = text(d['name']);
  const shownAt = stamp(d['shownAt']);
  if (!name || shownAt === 0) return null;
  const dur = d['durationSec'];
  return {
    name,
    photoUrl: text(d['photoUrl']),
    partnerName: text(d['partnerName']),
    categoryName: text(d['categoryName']),
    durationSec: typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
    shownAt,
  };
}

/** Valor desconhecido cai no default DO CAMPO — um campo ruim não derruba o doc inteiro. */
export function broadcastControlFromRaw(raw: unknown): BroadcastControl {
  const d = record(raw);
  const g = record(d['graphics']);
  const c = record(d['commands']);
  const graphics = { ...DEFAULT_BROADCAST_CONTROL.graphics };
  for (const id of BROADCAST_GRAPHIC_IDS) graphics[id] = g[id] !== false;
  const screen = d['kocRoundEndScreen'] as KocRoundEndScreen;
  const mode = d['finalMode'] as BroadcastFinalMode;
  return {
    courtId: text(d['courtId']),
    graphics,
    kocRoundEndScreen: SCREENS.includes(screen) ? screen : 'rodizio',
    finalMode: FINAL_MODES.includes(mode) ? mode : 'auto',
    interview: interviewFromRaw(d['interview']),
    commands: { donationNowAt: stamp(c['donationNowAt']), sponsorsNowAt: stamp(c['sponsorsNowAt']) },
  };
}

/** Tarja no ar segundo o relógio de quem GRAVOU o `shownAt` (o painel). O overlay não usa
 *  isto: ele conta a duração a partir de quando RECEBEU o comando, porque painel e OBS podem
 *  estar em máquinas com relógios diferentes. */
export function interviewOnAirAt(interview: BroadcastInterview | null, nowMs: number): boolean {
  if (!interview) return false;
  if (interview.durationSec == null) return true;
  return nowMs - interview.shownAt < interview.durationSec * 1000;
}

/** "Feminina B · com Bia Lima" — a linha de baixo da tarja e da busca do painel. Montada aqui,
 *  numa string só, porque dois nós de texto no template perdem o espaço. */
export function interviewLineOf(x: { categoryName: string | null; partnerName: string | null }): string | null {
  const parts = [x.categoryName, x.partnerName ? `com ${x.partnerName}` : null].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** `auto` devolve `null` (segue o matchType); `on`/`off` forçam. */
export function finalPrefOf(mode: BroadcastFinalMode): boolean | null {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return null;
}
