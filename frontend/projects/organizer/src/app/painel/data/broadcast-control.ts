import { DEFAULT_BROADCAST_TELAS, telasFromRaw, type BroadcastTelas } from './broadcast-telas';
import { DEFAULT_BROADCAST_BOLAO, bolaoFromRaw, type BroadcastBolao } from './broadcast-bolao';
import { DEFAULT_BROADCAST_EVENTOS, eventosFromRaw, type BroadcastEventos } from './broadcast-eventos';
import { DEFAULT_BROADCAST_CHAVE, chaveFromRaw, type BroadcastChave } from './broadcast-chave';
import { DEFAULT_BROADCAST_GRUPO, grupoFromRaw, type BroadcastGrupo } from './broadcast-grupo';
import { DEFAULT_BROADCAST_INTERVALO, intervaloFromRaw, type BroadcastIntervalo } from './broadcast-intervalo';
import { DEFAULT_BROADCAST_GRADE, gradeFromRaw, type BroadcastGrade } from './broadcast-grade';
import { DEFAULT_BROADCAST_MULTI, multiFromRaw, type BroadcastMulti } from './broadcast-multi';
import { DEFAULT_BROADCAST_RANKING, rankingFromRaw, type BroadcastRanking } from './broadcast-ranking';
import { DEFAULT_BROADCAST_PREJOGO, prejogoFromRaw, type BroadcastPrejogo } from './broadcast-prejogo';

/** Controle da transmissão do torneio — `tournaments/{id}/broadcast/control`.
 *
 *  Gravado pela tela "Transmissão" do painel e lido SEM LOGIN pelo overlay do OBS. Doc ausente =
 *  `DEFAULT_BROADCAST_CONTROL` = exatamente o comportamento de antes do painel existir, então
 *  nenhuma transmissão em andamento muda quando isto entra no ar. */

export type BroadcastGraphicId =
  | 'scoreboard'
  | 'decisivo'
  | 'kocBar'
  | 'kocPreRound'
  | 'kocRoundEnd'
  | 'champions'
  | 'donation'
  | 'sponsors';

export const BROADCAST_GRAPHIC_IDS: readonly BroadcastGraphicId[] = [
  'scoreboard',
  'decisivo',
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

export type InterviewKind = 'atleta' | 'dupla' | 'equipe';

export interface InterviewPerson {
  name: string;
  photoUrl: string | null;
}

/** "Ranking 12º". Par vira mapa porque o Firestore não aceita array dentro de array. */
export interface InterviewChip {
  label: string;
  value: string;
}

export interface InterviewCampaignRow {
  /** `V`/`D` num duelo; `1º`, `2º`… numa rodada KOTC, que não tem um adversário só. */
  mark: string;
  won: boolean;
  opponent: string;
  phase: string;
  score: string;
}

/** Quem conduz a entrevista — "Repórter · Carla Mendes" abaixo do card. */
export interface InterviewReporter {
  role: string;
  name: string;
}

export interface InterviewCampaign {
  title: string;
  /** "5V · 1D" */
  summary: string;
  /** Ordem cronológica; só as últimas `INTERVIEW_CAMPAIGN_MAX` cabem no ar. */
  rows: InterviewCampaignRow[];
}

/** Tarja de entrevista no ar — DESNORMALIZADA: o painel grava o card inteiro no clique, e o
 *  overlay só desenha, sem leitura extra.
 *
 *  Os seis primeiros campos são a v1 (01/10) e continuam sempre preenchidos: um overlay que
 *  ainda não foi atualizado segue desenhando a tarja antiga com eles. O resto é a v2. */
export interface BroadcastInterview {
  name: string;
  photoUrl: string | null;
  partnerName: string | null;
  categoryName: string | null;
  /** Segundos no ar. `null` = fica até "Tirar do ar". */
  durationSec: number | null;
  /** Identidade do COMANDO: `Date.now()` do painel no clique. Ligar uma chave da tarja já no ar
   *  regrava o card com o mesmo carimbo, e a duração não reinicia. */
  shownAt: number;
  kind: InterviewKind;
  /** Identidade do ENTREVISTADO. Mudou com a tarja no ar = troca animada. */
  key: string;
  /** Atleta: 1 nome. Dupla: os 2. Equipe: o nome da equipe. */
  names: string[];
  photos: (string | null)[];
  /** Elenco da equipe (só `equipe`). */
  members: InterviewPerson[];
  badge: string;
  context: string | null;
  subtitle: string | null;
  /** Posição no ranking geral; 1–3 pinta o card de pódio. */
  rankingPos: number | null;
  chips: InterviewChip[];
  campaign: InterviewCampaign | null;
  showCampaign: boolean;
  /** Pergunta da pauta no ar; `null` = pauta fora. */
  question: string | null;
  reporter: InterviewReporter | null;
}

/** Tetos do que cabe no canvas 1920×1080. */
export const INTERVIEW_MEMBERS_MAX = 6;
export const INTERVIEW_CHIPS_MAX = 4;
export const INTERVIEW_CAMPAIGN_MAX = 6;
/** Três linhas da caixa da pauta (Inter 24px em 1180px). */
export const INTERVIEW_QUESTION_MAX = 200;

export const INTERVIEW_BADGES: Record<InterviewKind, string> = {
  atleta: 'ATLETA',
  dupla: 'DUPLA',
  equipe: 'EQUIPE',
};

type InterviewV1 = Pick<
  BroadcastInterview,
  'name' | 'photoUrl' | 'partnerName' | 'categoryName' | 'durationSec' | 'shownAt'
>;

/** A tarja v1 vista com os olhos da v2: um atleta, a categoria no contexto e o parceiro no
 *  subtítulo. Fonte única desse default — o parser usa, e os specs montam fixture com ela. */
export function interviewWithDefaults(v1: InterviewV1 & Partial<BroadcastInterview>): BroadcastInterview {
  return {
    kind: 'atleta',
    key: `nome:${v1.name}`,
    names: [v1.name],
    photos: [v1.photoUrl],
    members: [],
    badge: INTERVIEW_BADGES.atleta,
    context: v1.categoryName,
    subtitle: v1.partnerName ? `Dupla com ${v1.partnerName}` : null,
    rankingPos: null,
    chips: [],
    campaign: null,
    showCampaign: true,
    question: null,
    reporter: null,
    ...v1,
  };
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
  /** Categoria cujo pódio o card de campeões mostra. `null` = automático: a final que encerra
   *  na quadra acompanhada (comportamento de antes). */
  championsCategoryId: string | null;
  /** Tela de Resumo ligada à mão (parcial no meio do jogo). O automático — 4,5 s depois do ponto
   *  que fecha o jogo — não passa por aqui. Padrão desligado: ligar é decisão da transmissão. */
  summaryOn: boolean;
  /** Card do Pré-jogo montado pelo painel e se está no ar. */
  prejogo: BroadcastPrejogo;
  /** Card do Ranking Top 10 montado pelo painel, se está no ar e em que modo. */
  ranking: BroadcastRanking;
  /** Tela Multi-quadras: no ar, modo e quadra em destaque. */
  multi: BroadcastMulti;
  /** Tela Grade do dia: no ar e categoria em destaque. */
  grade: BroadcastGrade;
  /** Tela de Intervalo: no ar, modo, textos e contagem. */
  intervalo: BroadcastIntervalo;
  /** Tela Tabela do grupo: no ar, categoria, modo e grupo. */
  grupo: BroadcastGrupo;
  /** Tela Chaves: no ar e categoria. */
  chave: BroadcastChave;
  /** Card da tela Próximos eventos montado pelo painel: no ar, modo e eventos. */
  eventos: BroadcastEventos;
  /** Tela Bolão ao vivo (palpites da partida): no ar. */
  bolao: BroadcastBolao;
  /** Telas Início/Fim da transmissão: no ar, qual e a contagem do Início. */
  telas: BroadcastTelas;
  interview: BroadcastInterview | null;
  commands: BroadcastCommands;
}

export const DEFAULT_BROADCAST_CONTROL: BroadcastControl = {
  courtId: null,
  graphics: {
    scoreboard: true,
    decisivo: true,
    kocBar: true,
    kocPreRound: true,
    kocRoundEnd: true,
    champions: true,
    donation: true,
    sponsors: true,
  },
  kocRoundEndScreen: 'rodizio',
  finalMode: 'auto',
  championsCategoryId: null,
  summaryOn: false,
  prejogo: DEFAULT_BROADCAST_PREJOGO,
  ranking: DEFAULT_BROADCAST_RANKING,
  multi: DEFAULT_BROADCAST_MULTI,
  grade: DEFAULT_BROADCAST_GRADE,
  intervalo: DEFAULT_BROADCAST_INTERVALO,
  grupo: DEFAULT_BROADCAST_GRUPO,
  chave: DEFAULT_BROADCAST_CHAVE,
  eventos: DEFAULT_BROADCAST_EVENTOS,
  bolao: DEFAULT_BROADCAST_BOLAO,
  telas: DEFAULT_BROADCAST_TELAS,
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

const KINDS: readonly InterviewKind[] = ['atleta', 'dupla', 'equipe'];

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function personFromRaw(raw: unknown): InterviewPerson | null {
  const d = record(raw);
  const name = text(d['name']);
  return name ? { name, photoUrl: text(d['photoUrl']) } : null;
}

function chipFromRaw(raw: unknown): InterviewChip | null {
  const d = record(raw);
  const label = text(d['label']);
  const value = text(d['value']);
  return label && value ? { label, value } : null;
}

function campaignRowFromRaw(raw: unknown): InterviewCampaignRow | null {
  const d = record(raw);
  const mark = text(d['mark']);
  const opponent = text(d['opponent']);
  if (!mark || !opponent) return null;
  return { mark, won: d['won'] === true, opponent, phase: text(d['phase']) ?? '', score: text(d['score']) ?? '' };
}

function campaignFromRaw(raw: unknown): InterviewCampaign | null {
  const d = record(raw);
  const rows = list(d['rows'])
    .map(campaignRowFromRaw)
    .filter((r): r is InterviewCampaignRow => r != null)
    .slice(-INTERVIEW_CAMPAIGN_MAX);
  if (rows.length === 0) return null;
  return { title: text(d['title']) ?? 'Campanha', summary: text(d['summary']) ?? '', rows };
}

function reporterFromRaw(raw: unknown): InterviewReporter | null {
  const d = record(raw);
  const name = text(d['name']);
  return name ? { role: text(d['role']) ?? 'Repórter', name } : null;
}

function present<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x != null);
}

function interviewFromRaw(raw: unknown): BroadcastInterview | null {
  const d = record(raw);
  const name = text(d['name']);
  const shownAt = stamp(d['shownAt']);
  if (!name || shownAt === 0) return null;
  const dur = d['durationSec'];
  const v1: InterviewV1 = {
    name,
    photoUrl: text(d['photoUrl']),
    partnerName: text(d['partnerName']),
    categoryName: text(d['categoryName']),
    durationSec: typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
    shownAt,
  };
  // v2 se reconhece pelo `kind`. Sem ele é o painel de 01/10, e tudo vem do default.
  if (typeof d['kind'] !== 'string') return interviewWithDefaults(v1);
  const kind = KINDS.includes(d['kind'] as InterviewKind) ? (d['kind'] as InterviewKind) : 'atleta';
  const names = list(d['names']).map(text).filter((n): n is string => !!n);
  const photos = Array.isArray(d['photos']) ? d['photos'].map(text) : [v1.photoUrl];
  const pos = d['rankingPos'];
  return {
    ...v1,
    kind,
    key: text(d['key']) ?? `nome:${name}`,
    names: names.length > 0 ? names : [name],
    photos,
    members: present(list(d['members']).map(personFromRaw)).slice(0, INTERVIEW_MEMBERS_MAX),
    badge: text(d['badge']) ?? INTERVIEW_BADGES[kind],
    context: text(d['context']),
    subtitle: text(d['subtitle']),
    rankingPos: typeof pos === 'number' && Number.isInteger(pos) && pos > 0 ? pos : null,
    chips: present(list(d['chips']).map(chipFromRaw)).slice(0, INTERVIEW_CHIPS_MAX),
    campaign: campaignFromRaw(d['campaign']),
    showCampaign: d['showCampaign'] !== false,
    question: text(d['question'])?.slice(0, INTERVIEW_QUESTION_MAX) ?? null,
    reporter: reporterFromRaw(d['reporter']),
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
    championsCategoryId: text(d['championsCategoryId']),
    summaryOn: d['summaryOn'] === true,
    prejogo: prejogoFromRaw(d['prejogo']),
    ranking: rankingFromRaw(d['ranking']),
    multi: multiFromRaw(d['multi']),
    grade: gradeFromRaw(d['grade']),
    intervalo: intervaloFromRaw(d['intervalo']),
    grupo: grupoFromRaw(d['grupo']),
    chave: chaveFromRaw(d['chave']),
    eventos: eventosFromRaw(d['eventos']),
    bolao: bolaoFromRaw(d['bolao']),
    telas: telasFromRaw(d['telas']),
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
