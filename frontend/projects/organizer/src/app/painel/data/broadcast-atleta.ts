/** Card do Atleta — perfil, temporada e jogos do torneio, numa coluna no canto superior direito.
 *
 *  DESNORMALIZADO como o Pré-jogo e a tarja de entrevista: o painel (que enxerga ranking, perfis e
 *  histórico) monta o card e grava em `broadcast/control.atleta`; o overlay, público e sem login,
 *  só desenha. É um DISPARO: cada "mostrar"/"sair" sobe `seq`; `card: null` = esconder. */

export interface AtletaTemporada {
  year: number;
  /** 0–100. */
  winPct: number;
  wins: number;
  losses: number;
  /** Sequência atual: `n` jogos seguidos de `kind`. */
  streak: { kind: 'V' | 'D'; n: number } | null;
  /** Até 5, do mais antigo pro mais recente. */
  last: ('V' | 'D')[];
}

export interface AtletaJogo {
  /** "Grupo", "Oitavas". */
  phase: string;
  /** "Nunes / Alves". */
  opponent: string;
  /** "21-18 17-21 13-15" (do ponto de vista do atleta). */
  partials: string;
  /** "1–2". */
  score: string;
  won: boolean;
}

export interface AtletaCard {
  /** Identidade da apresentação: mudou = o card entra de novo. */
  key: string;
  name: string;
  partner: string | null;
  photoUrl: string | null;
  court: string | null;
  category: string | null;
  rankPos: number | null;
  rankPoints: number | null;
  city: string | null;
  state: string | null;
  /** `null` = sem jogos na temporada (bloco some). */
  season: AtletaTemporada | null;
  /** Jogos deste torneio, do mais antigo pro mais recente; só os últimos 3 cabem. */
  games: AtletaJogo[];
  setsWon: number;
  setsLost: number;
  /** Confronto direto da dupla contra a dupla de hoje; `null` = primeiro confronto. */
  h2h: { wins: number; losses: number; vs: string } | null;
}

export interface BroadcastAtleta {
  /** Sobe a cada comando; 0 = nunca. */
  seq: number;
  /** Segundos no ar; 0 = fica até "sair". */
  seg: number;
  /** `null` = esconder. */
  card: AtletaCard | null;
  at: Date | null;
}

export const ATLETA_SEG_DEFAULT = 12;
export const ATLETA_GAMES_MAX = 3;

export const DEFAULT_BROADCAST_ATLETA: BroadcastAtleta = { seq: 0, seg: ATLETA_SEG_DEFAULT, card: null, at: null };

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown, fallback = 0, min = 0, max = 100_000): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;
const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
const vd = (v: unknown): 'V' | 'D' | null => (v === 'V' || v === 'D' ? v : null);

function temporadaFromRaw(raw: unknown): AtletaTemporada | null {
  const d = record(raw);
  if (typeof d['year'] !== 'number') return null;
  const s = record(d['streak']);
  const kind = vd(s['kind']);
  return {
    year: int(d['year']),
    winPct: int(d['winPct'], 0, 0, 100),
    wins: int(d['wins']),
    losses: int(d['losses']),
    streak: kind ? { kind, n: int(s['n'], 1, 1, 999) } : null,
    last: (Array.isArray(d['last']) ? d['last'] : []).map(vd).filter((x): x is 'V' | 'D' => x !== null).slice(-5),
  };
}

function jogoFromRaw(raw: unknown): AtletaJogo | null {
  const d = record(raw);
  const opponent = text(d['opponent']);
  if (!opponent) return null;
  return { phase: text(d['phase']) ?? '', opponent, partials: text(d['partials']) ?? '', score: text(d['score']) ?? '', won: d['won'] === true };
}

function cardFromRaw(raw: unknown): AtletaCard | null {
  const d = record(raw);
  const key = text(d['key']);
  const name = text(d['name']);
  if (!key || !name) return null;
  const h = record(d['h2h']);
  const vs = text(h['vs']);
  return {
    key,
    name,
    partner: text(d['partner']),
    photoUrl: text(d['photoUrl']),
    court: text(d['court']),
    category: text(d['category']),
    rankPos: intOrNull(d['rankPos']),
    rankPoints: intOrNull(d['rankPoints']),
    city: text(d['city']),
    state: text(d['state']),
    season: temporadaFromRaw(d['season']),
    games: (Array.isArray(d['games']) ? d['games'] : []).map(jogoFromRaw).filter((g): g is AtletaJogo => g !== null).slice(-ATLETA_GAMES_MAX),
    setsWon: int(d['setsWon']),
    setsLost: int(d['setsLost']),
    h2h: vs ? { wins: int(h['wins']), losses: int(h['losses']), vs } : null,
  };
}

export function atletaFromRaw(raw: unknown): BroadcastAtleta {
  const d = record(raw);
  const at = d['at'] as { toDate?: () => Date } | undefined;
  return {
    seq: int(d['seq'], 0, 0, Number.MAX_SAFE_INTEGER),
    seg: int(d['seg'], ATLETA_SEG_DEFAULT, 0, 120),
    card: cardFromRaw(d['card']),
    at: typeof at?.toDate === 'function' ? at.toDate() : null,
  };
}
