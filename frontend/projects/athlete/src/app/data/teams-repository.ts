import { collection, doc, documentId, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { MatchSet } from './matches-repository';

/** Espelha `TournamentTeam`/`TournamentTeamsRepository` (Flutter) — `teams/{teamId}` só existe
 *  como efeito colateral de inscrição em torneio (`acceptTournamentPartnerInvite` cria o doc);
 *  não há "criar equipe" isolado do fluxo de inscrição. Path real:
 *  `artifacts/{projectId}/public/data/teams/{teamId}` (ver `firestore.rules`). */

export interface ArenaTeam {
  id: string;
  player1Id: string;
  player2Id: string;
  teamName: string | null;
  gender: string | null;
  /** 3–5 nas equipes nomeadas (trio/quarteto/quinteto); dupla legada não grava. */
  teamSize: number | null;
  /** Elenco das equipes nomeadas — dupla legada fica vazio (só player1/player2). */
  memberUids: readonly string[];
  createdAt: Date | null;
}

function teamsCol(db: Firestore, projectId: string) {
  return collection(db, 'artifacts', projectId, 'public', 'data', 'teams');
}

function teamFromDoc(id: string, data: Record<string, unknown>): ArenaTeam {
  const createdAtRaw = data['createdAt'] as { toDate?: () => Date } | undefined;
  const memberUidsRaw = data['memberUids'];
  return {
    id,
    player1Id: typeof data['player1Id'] === 'string' ? data['player1Id'] : '',
    player2Id: typeof data['player2Id'] === 'string' ? data['player2Id'] : '',
    teamName: typeof data['teamName'] === 'string' && data['teamName'].trim() ? data['teamName'].trim() : null,
    gender: typeof data['gender'] === 'string' && data['gender'].trim() ? data['gender'].trim() : null,
    teamSize: typeof data['teamSize'] === 'number' && data['teamSize'] >= 3 ? data['teamSize'] : null,
    memberUids: Array.isArray(memberUidsRaw) ? memberUidsRaw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0) : [],
    createdAt: typeof createdAtRaw?.toDate === 'function' ? createdAtRaw.toDate() : null,
  };
}

export function teamIsLookingForPartner(team: Pick<ArenaTeam, 'player1Id' | 'player2Id'>): boolean {
  return team.player1Id === team.player2Id;
}

/** uids do elenco — `memberUids` (equipe nomeada) vence; dupla legada cai em player1/2.
 *  Espelha `extractTeamMemberUids` (`functions/src/tournament-team-category.ts`), com dedup:
 *  a dupla incompleta (player1 === player2) conta o atleta uma vez só — sem isso o modo
 *  Temporada/Individual soma os pontos dela em dobro. */
export function teamMemberIds(team: Pick<ArenaTeam, 'player1Id' | 'player2Id' | 'memberUids'>): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const id = raw.trim();
    if (id && !out.includes(id)) out.push(id);
  };
  for (const raw of team.memberUids) push(raw);
  if (out.length === 0) {
    push(team.player1Id);
    push(team.player2Id);
  }
  return out;
}

export async function fetchTeam(db: Firestore, projectId: string, teamId: string): Promise<ArenaTeam | null> {
  const snap = await getDoc(doc(teamsCol(db, projectId), teamId));
  if (!snap.exists()) return null;
  return teamFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Times onde o atleta é player1 OU player2 — 2 queries paralelas de campo único (mesmo padrão
 *  de índice-avoidance usado em `arenaBookings`/`matches` no resto do repo), mescladas por id. */
export async function fetchTeamsForAthlete(db: Firestore, projectId: string, uid: string): Promise<ArenaTeam[]> {
  const col = teamsCol(db, projectId);
  const [byPlayer1, byPlayer2] = await Promise.all([
    getDocs(query(col, where('player1Id', '==', uid))),
    getDocs(query(col, where('player2Id', '==', uid))),
  ]);
  const byId = new Map<string, ArenaTeam>();
  for (const d of [...byPlayer1.docs, ...byPlayer2.docs]) {
    byId.set(d.id, teamFromDoc(d.id, d.data() as Record<string, unknown>));
  }
  return [...byId.values()].filter((t) => !teamIsLookingForPartner(t));
}

export async function fetchTeamsByIds(db: Firestore, projectId: string, ids: readonly string[]): Promise<Map<string, ArenaTeam>> {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  const result = new Map<string, ArenaTeam>();
  if (unique.length === 0) return result;

  const col = teamsCol(db, projectId);
  const chunkPromises: Promise<void>[] = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    chunkPromises.push(
      getDocs(query(col, where(documentId(), 'in', chunk))).then((snap) => {
        for (const d of snap.docs) result.set(d.id, teamFromDoc(d.id, d.data() as Record<string, unknown>));
      }),
    );
  }
  await Promise.all(chunkPromises);
  return result;
}

export interface ArenaMatch {
  id: string;
  tournamentId: string;
  categoryId: string;
  matchType: string;
  status: string;
  winnerId: string | null;
  teamAId: string;
  teamBId: string;
  teamADescription: string | null;
  teamBDescription: string | null;
  resultA: string | null;
  resultB: string | null;
  /** Placar canônico por set. `resultA`/`resultB` ("21,19,10") são o formato legado. */
  sets: MatchSet[];
  scheduleTime: Date | null;
  matchEndedAt: Date | null;
  courtName: string | null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function setsFromRaw(raw: unknown): MatchSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const o = s as Record<string, unknown>;
      const a = typeof o['a'] === 'number' ? o['a'] : null;
      const b = typeof o['b'] === 'number' ? o['b'] : null;
      return a == null || b == null ? null : { a, b };
    })
    .filter((s): s is MatchSet => s != null);
}

function parseLegacyResult(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/** Sets ganhos por lado [A, B] numa partida ENCERRADA — `sets[]` quando existe, senão o formato
 *  legado `resultA`/`resultB`. Diferente de `matchSetWins` (matches-repository), que também trata
 *  o set em andamento do ao vivo: aqui só entram partidas concluídas. */
export function completedMatchSetWins(m: Pick<ArenaMatch, 'sets' | 'resultA' | 'resultB'>): [number, number] {
  const sets =
    m.sets.length > 0
      ? m.sets
      : (() => {
          const a = parseLegacyResult(m.resultA);
          const b = parseLegacyResult(m.resultB);
          return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({ a: a[i] ?? 0, b: b[i] ?? 0 }));
        })();
  return [sets.filter((s) => s.a > s.b).length, sets.filter((s) => s.b > s.a).length];
}

function matchFromDoc(id: string, data: Record<string, unknown>): ArenaMatch {
  return {
    id,
    tournamentId: typeof data['tournamentId'] === 'string' ? data['tournamentId'] : '',
    categoryId: typeof data['categoryId'] === 'string' ? data['categoryId'] : '',
    matchType: typeof data['matchType'] === 'string' ? data['matchType'] : '',
    status: typeof data['status'] === 'string' ? data['status'] : '',
    winnerId: optionalStr(data['winnerId']),
    teamAId: typeof data['teamAId'] === 'string' ? data['teamAId'] : '',
    teamBId: typeof data['teamBId'] === 'string' ? data['teamBId'] : '',
    teamADescription: optionalStr(data['teamADescription']),
    teamBDescription: optionalStr(data['teamBDescription']),
    resultA: optionalStr(data['resultA']),
    resultB: optionalStr(data['resultB']),
    sets: setsFromRaw(data['sets']),
    scheduleTime: toDate(data['scheduleTime']),
    matchEndedAt: toDate(data['matchEndedAt']),
    courtName: optionalStr(data['courtName']),
  };
}

export function matchIsCompleted(match: Pick<ArenaMatch, 'status'>): boolean {
  return match.status.trim().toLowerCase() === 'completed';
}

/** Histórico de partidas de um time — 2 queries paralelas (`teamAId`/`teamBId`), mescladas. */
export async function fetchMatchesForTeam(db: Firestore, projectId: string, teamId: string): Promise<ArenaMatch[]> {
  const col = collection(db, 'artifacts', projectId, 'public', 'data', 'matches');
  const [byA, byB] = await Promise.all([getDocs(query(col, where('teamAId', '==', teamId))), getDocs(query(col, where('teamBId', '==', teamId)))]);
  const byId = new Map<string, ArenaMatch>();
  for (const d of [...byA.docs, ...byB.docs]) {
    byId.set(d.id, matchFromDoc(d.id, d.data() as Record<string, unknown>));
  }
  return [...byId.values()].sort((a, b) => (b.matchEndedAt?.getTime() ?? 0) - (a.matchEndedAt?.getTime() ?? 0));
}

interface RoundLabel {
  /** Forma compacta, ao lado do nome do torneio no card de partida ("Copa VH · SF"). */
  short: string;
  /** Forma por extenso (histórico do atleta e atividade do perfil público). */
  full: string;
}

/**
 * Fases pelo `matchType` do doc da partida. Uma tabela só para as duas funções abaixo — elas
 * nasceram como duas escadas de `includes()` separadas e drift(aram): a abreviada tratava
 * 'Round of 32' como disputa de 3º lugar (o teste `t.includes('3')` casa o "32") e a por extenso
 * não conhecia WB/LB.
 *
 * As chaves cobrem o que os geradores gravam (`functions/src/category-bracket-builders.ts`:
 * 'group', 'knockout', 'Final', 'Third Place', 'WB', 'LB') e a forma em inglês por extenso de
 * chaves antigas. WB/LB ficam em 'WB'/'LB' de propósito: é assim que a chave e o Modo Focus já
 * mostram os dois lados da dupla eliminação (`bracket-tree.ts`, `KNOCKOUT_LABELS` em
 * `tournaments/tournament-live.selectors.ts`) — inventar "chave dos perdedores" só aqui seria um
 * vocabulário a mais para o atleta decorar.
 *
 * 'knockout' é o valor mais comum e o que menos informa: `buildSingleEliminationMatches` grava
 * esse mesmo texto em TODA rodada que não é a final, então quartas, oitavas e semifinal chegam
 * aqui indistinguíveis. Quem separa uma da outra é o `round` cruzado com as rodadas de mata-mata
 * da CATEGORIA (`knockoutLabelOf`/`positionalKnockoutLabelOf`, `tournament-live.selectors.ts`) — e
 * nenhuma das três telas que chamam daqui tem essa lista: todas carregam só as partidas DO TIME
 * (`fetchMatchesForTeam`), uma carreira inteira espalhada por vários torneios. Derivar a fase
 * exigiria um `fetchMatchesForCategory` por torneio+categoria do histórico (a chave inteira lida
 * de novo, N torneios = N idas ao Firestore) para enfeitar uma linha de contexto. Então a fase
 * para em 'Mata-mata': vago, mas verdadeiro e em português — nunca o "KNOCKOUT" que a versão
 * anterior vazava ao capitalizar o `matchType` cru.
 */
const ROUND_LABELS: Record<string, RoundLabel> = {
  group: { short: 'Grupos', full: 'Fase de grupos' },
  knockout: { short: 'Mata-mata', full: 'Mata-mata' },
  final: { short: 'F', full: 'Final' },
  'grand final': { short: 'F', full: 'Grand final' },
  grand_final: { short: 'F', full: 'Grand final' },
  'third place': { short: '3º', full: 'Disputa de 3º lugar' },
  third_place: { short: '3º', full: 'Disputa de 3º lugar' },
  'semi-final': { short: 'SF', full: 'Semifinal' },
  semifinal: { short: 'SF', full: 'Semifinal' },
  'quarter-final': { short: 'QF', full: 'Quartas de final' },
  quarterfinal: { short: 'QF', full: 'Quartas de final' },
  'round of 16': { short: 'O16', full: 'Oitavas de final' },
  'round of 32': { short: 'R32', full: '16 avos de final' },
  wb: { short: 'WB', full: 'WB' },
  lb: { short: 'LB', full: 'LB' },
};

/** `null` quando o `matchType` não identifica fase nenhuma — quem chama decide o fallback. */
function roundLabelOf(matchType: string): RoundLabel | null {
  const t = matchType.trim().toLowerCase();
  if (!t) return null;
  const exact = ROUND_LABELS[t];
  if (exact) return exact;

  // Fases escritas à mão em chaves antigas ('Semi Final', 'Bronze match'…). Do mais específico
  // para o mais genérico: 'final' fica por último porque semifinal, quartas e disputa de 3º
  // também contêm a palavra.
  if (t.includes('third') || t.includes('bronze')) return ROUND_LABELS['third place']!;
  if (t.includes('semi')) return ROUND_LABELS['semifinal']!;
  if (t.includes('quarter')) return ROUND_LABELS['quarterfinal']!;
  if (t.includes('16')) return ROUND_LABELS['round of 16']!;
  if (t.includes('32')) return ROUND_LABELS['round of 32']!;
  if (t.includes('group') || t.includes('pool')) return ROUND_LABELS['group']!;
  if (t.includes('final')) return ROUND_LABELS['final']!;
  return null;
}

/** Fase abreviada (F/SF/QF/O16/R32) — o contexto compacto do card de partida da equipe. */
export function roundShortLabel(matchType: string): string {
  return roundLabelOf(matchType)?.short ?? '—';
}

/** A mesma fase por extenso — histórico do atleta e atividade do perfil público. */
export function roundFullLabel(matchType: string): string {
  return roundLabelOf(matchType)?.full ?? 'Partida';
}

function isFinalMatchType(matchType: string): boolean {
  const t = matchType.trim().toLowerCase();
  return t.includes('final') && !t.includes('semi') && !t.includes('quarter') && !t.includes('third');
}

/** Torneios em que o time venceu a final — "títulos" derivado de `matches`, sem depender de
 *  um campo "titles" que não existe no schema. */
export function titleTournamentIds(matches: readonly ArenaMatch[], teamId: string): string[] {
  return [...new Set(matches.filter((m) => matchIsCompleted(m) && isFinalMatchType(m.matchType) && m.winnerId === teamId).map((m) => m.tournamentId))].filter(
    (id) => id,
  );
}

/** Sequência de vitórias em andamento (partidas concluídas mais recentes primeiro). */
export function currentWinStreak(completedMatchesDesc: readonly ArenaMatch[], teamId: string): number {
  let streak = 0;
  for (const m of completedMatchesDesc) {
    if (m.winnerId !== teamId) break;
    streak++;
  }
  return streak;
}

/** "<1 mês" / "3 meses" / "1 ano" / "1 ano e 4 meses" — espelha `formatTeamTogetherLabel`. */
export function formatTeamTogetherLabel(createdAt: Date | null, now = new Date()): string {
  if (!createdAt) return '—';
  let months = (now.getFullYear() - createdAt.getFullYear()) * 12 + (now.getMonth() - createdAt.getMonth());
  if (now.getDate() < createdAt.getDate()) months--;
  if (months < 1) return '<1 mês';
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  if (remMonths === 0) return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${remMonths} ${remMonths === 1 ? 'mês' : 'meses'}`;
}
