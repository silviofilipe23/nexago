/** Card do Ranking Geral (Top 10) — tela cheia, fundo opaco.
 *
 *  DESNORMALIZADO como o Pré-jogo e a tarja de entrevista: o painel (que lê `results[]` dos
 *  rankings, perfis e o torneio) monta o card inteiro e grava em `broadcast/control.ranking`; o
 *  overlay público só desenha. O card traz os DOIS estados — antes e depois da etapa — porque a
 *  tela anima de um pro outro (linhas deslizam, pontos contam, quem sai/entra aparece). */

export interface RankingAthlete {
  /** Identidade estável: casa a linha "antes" com a "depois" pra deslizar até a nova posição. */
  id: string;
  name: string;
  photo: string | null;
  /** Linha de baixo do nome. Clube/arena não existe no cadastro: o painel usa cidade/UF. */
  sub: string | null;
  /** Posição NO RANKING INTEIRO antes da etapa (pode passar de 10; entrou no top 10 vinda de
   *  fora). `null` = sem ranking antes. */
  posBefore: number | null;
  posAfter: number;
  ptsBefore: number;
  ptsAfter: number;
  /** Pontos ganhos na etapa; `null` = não jogou ("Não jogou"). */
  gain: number | null;
}

export interface RankingHighlightLeader {
  name: string;
  photo: string | null;
  points: number;
  /** `true` = mantém a liderança; `false` = assume. */
  keeps: boolean;
}

export interface RankingHighlightClimber {
  name: string;
  photo: string | null;
  from: number;
  to: number;
}

export interface RankingHighlightTopGain {
  name: string;
  photo: string | null;
  sub: string | null;
  gain: number;
}

export interface RankingCard {
  /** Mudou = a tela reinicia e anima de novo (Atualizar, trocar de categoria). */
  key: string;
  /** "MASCULINO" / "FEMININO" — vai depois de "RANKING " no título, em laranja. */
  categoryLabel: string;
  /** Nome da etapa/torneio: "Antes da etapa X" / "Atualizado após etapa X". */
  stageName: string;
  /** `true` = o ranking já reflete a etapa (ponto verde); `false` = parcial/antes (cinza). */
  updated: boolean;
  /** Top 10 ANTES da etapa, em ordem de posição. */
  before: RankingAthlete[];
  /** Top 10 DEPOIS da etapa, em ordem de posição. */
  after: RankingAthlete[];
  leader: RankingHighlightLeader | null;
  climber: RankingHighlightClimber | null;
  topGain: RankingHighlightTopGain | null;
}

/** `auto` = entra mostrando o antes e troca sozinho pro depois (~2,6 s); `before` = fica no antes. */
export type RankingMode = 'auto' | 'before';

export interface BroadcastRanking {
  on: boolean;
  mode: RankingMode;
  card: RankingCard | null;
}

export const DEFAULT_BROADCAST_RANKING: BroadcastRanking = { on: false, mode: 'auto', card: null };

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

function athleteFromRaw(raw: unknown): RankingAthlete | null {
  const d = record(raw);
  const id = text(d['id']);
  const name = text(d['name']);
  const posAfter = int(d['posAfter']);
  if (!id || !name || posAfter == null || posAfter < 1) return null;
  const posBefore = int(d['posBefore']);
  return {
    id,
    name,
    photo: text(d['photo']),
    sub: text(d['sub']),
    posBefore: posBefore != null && posBefore > 0 ? posBefore : null,
    posAfter,
    ptsBefore: int(d['ptsBefore']) ?? 0,
    ptsAfter: int(d['ptsAfter']) ?? 0,
    gain: int(d['gain']),
  };
}

function listFromRaw(raw: unknown): RankingAthlete[] {
  return (Array.isArray(raw) ? raw : []).map(athleteFromRaw).filter((a): a is RankingAthlete => a !== null).slice(0, 10);
}

function cardFromRaw(raw: unknown): RankingCard | null {
  const d = record(raw);
  const key = text(d['key']);
  const before = listFromRaw(d['before']);
  const after = listFromRaw(d['after']);
  if (!key || after.length === 0) return null;
  const l = record(d['leader']);
  const c = record(d['climber']);
  const g = record(d['topGain']);
  const lName = text(l['name']);
  const cName = text(c['name']);
  const gName = text(g['name']);
  const from = int(c['from']);
  const to = int(c['to']);
  const gain = int(g['gain']);
  return {
    key,
    categoryLabel: text(d['categoryLabel']) ?? '',
    stageName: text(d['stageName']) ?? '',
    updated: d['updated'] === true,
    before: before.length > 0 ? before : after,
    after,
    leader: lName ? { name: lName, photo: text(l['photo']), points: int(l['points']) ?? 0, keeps: l['keeps'] === true } : null,
    climber: cName && from != null && to != null ? { name: cName, photo: text(c['photo']), from, to } : null,
    topGain: gName && gain != null ? { name: gName, photo: text(g['photo']), sub: text(g['sub']), gain } : null,
  };
}

export function rankingFromRaw(raw: unknown): BroadcastRanking {
  const d = record(raw);
  return { on: d['on'] === true, mode: d['mode'] === 'before' ? 'before' : 'auto', card: cardFromRaw(d['card']) };
}
