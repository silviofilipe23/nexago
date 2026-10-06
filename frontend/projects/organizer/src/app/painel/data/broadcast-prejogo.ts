/** Card do Pré-jogo — apresentação das duas duplas antes da partida.
 *
 *  DESNORMALIZADO como a tarja de entrevista: o painel (que enxerga ranking, Elo e histórico) monta
 *  o card inteiro e grava em `broadcast/control.prejogo`; o overlay, público e sem login, só
 *  desenha. Por isso não há nenhuma leitura nova no OBS. */

export type PrejogoSide = 'A' | 'B';

export interface PrejogoTeam {
  /** Um atleta por linha, já em ordem de exibição. */
  names: string[];
  /** Alinhado a `names`; `null` = placeholder "FOTO ATLETA n". */
  photos: (string | null)[];
  /** Posição no ranking; 1–3 pinta ouro/prata/bronze. `null` = sem ranking. */
  rankPos: number | null;
  /** Clube/arena embaixo do nome. Hoje não existe no cadastro — fica `null`. */
  club: string | null;
}

/** Linha do comparativo. `a`/`b` são o texto exibido ("1798", "4–0", "19.6"); `pctA`/`pctB` o
 *  comprimento da barra (0–100) e `lead` quem fica em destaque branco. `null` = sem dado. */
export interface PrejogoRow {
  label: string;
  a: string;
  b: string;
  pctA: number;
  pctB: number;
  lead: PrejogoSide | null;
}

export interface PrejogoConfronto {
  /** Cor do vencedor; `null` = sem vencedor definido. */
  winner: PrejogoSide | null;
  /** "ANDRADE / LACERDA 2–1 · Etapa Cumbuco". */
  text: string;
}

export interface PrejogoCard {
  /** Partida de onde o card saiu (informativo). */
  matchId: string;
  /** Identidade da apresentação: mudou = o card entra de novo (reanimar, trocar de partida). */
  key: string;
  category: string | null;
  phase: string | null;
  court: string | null;
  /** "Melhor de 3 · 21 / 15". */
  rule: string | null;
  /** "15:40". */
  startTime: string | null;
  a: PrejogoTeam;
  b: PrejogoTeam;
  /** Retrospecto direto (vitórias de A × B); `null` = primeiro confronto. */
  h2h: { a: number; b: number } | null;
  /** Até 3, do mais recente pro mais antigo. */
  last: PrejogoConfronto[];
  rows: PrejogoRow[];
}

/** O que o controle guarda: o card pronto e se está no ar. */
export interface BroadcastPrejogo {
  on: boolean;
  card: PrejogoCard | null;
}

export const DEFAULT_BROADCAST_PREJOGO: BroadcastPrejogo = { on: false, card: null };

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function side(v: unknown): PrejogoSide | null {
  return v === 'A' || v === 'B' ? v : null;
}

function teamFromRaw(raw: unknown): PrejogoTeam {
  const d = record(raw);
  const names = (Array.isArray(d['names']) ? d['names'] : []).map(text).filter((n): n is string => n !== null).slice(0, 2);
  const photos = (Array.isArray(d['photos']) ? d['photos'] : []).slice(0, 2).map(text);
  const pos = d['rankPos'];
  return {
    names,
    photos: names.map((_, i) => photos[i] ?? null),
    rankPos: typeof pos === 'number' && Number.isInteger(pos) && pos > 0 ? pos : null,
    club: text(d['club']),
  };
}

function rowFromRaw(raw: unknown): PrejogoRow | null {
  const d = record(raw);
  const label = text(d['label']);
  if (!label) return null;
  const pct = (v: unknown) => Math.min(100, Math.max(0, num(v)));
  return { label, a: text(d['a']) ?? '–', b: text(d['b']) ?? '–', pctA: pct(d['pctA']), pctB: pct(d['pctB']), lead: side(d['lead']) };
}

function cardFromRaw(raw: unknown): PrejogoCard | null {
  const d = record(raw);
  const key = text(d['key']);
  const a = teamFromRaw(d['a']);
  const b = teamFromRaw(d['b']);
  if (!key || a.names.length === 0 || b.names.length === 0) return null;
  const h = record(d['h2h']);
  return {
    matchId: text(d['matchId']) ?? '',
    key,
    category: text(d['category']),
    phase: text(d['phase']),
    court: text(d['court']),
    rule: text(d['rule']),
    startTime: text(d['startTime']),
    a,
    b,
    h2h: 'a' in h && 'b' in h ? { a: num(h['a']), b: num(h['b']) } : null,
    last: (Array.isArray(d['last']) ? d['last'] : [])
      .map((x) => {
        const o = record(x);
        const t = text(o['text']);
        return t ? { winner: side(o['winner']), text: t } : null;
      })
      .filter((x): x is PrejogoConfronto => x !== null)
      .slice(0, 3),
    rows: (Array.isArray(d['rows']) ? d['rows'] : []).map(rowFromRaw).filter((r): r is PrejogoRow => r !== null).slice(0, 5),
  };
}

export function prejogoFromRaw(raw: unknown): BroadcastPrejogo {
  const d = record(raw);
  return { on: d['on'] === true, card: cardFromRaw(d['card']) };
}
