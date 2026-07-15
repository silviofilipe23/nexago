import type { DiscoveryLeague, DiscoveryTournament, TournamentGenderCat, TournamentListingStatus } from './tournament-discovery.models';
import type { BracketPreviewState, TournamentDetailCategory, TournamentDetailView } from './tournament-detail.models';
import type { LeagueRaw, MatchRaw, TournamentCategoryRaw, TournamentRaw } from './tournament-repository';

/** Espelha `tournament_detail_logic.dart`/`league_document_mapper.dart` (Flutter) — mapeamento
 *  de dado real (`tournaments`/`leagues`/`matches`) pros modelos que já existiam no mock. */

export function genderTypeFromRaw(raw: string | null): TournamentGenderCat | null {
  const tag = (raw ?? '').trim().toUpperCase();
  if (tag === 'MASCULINO') return 'M';
  if (tag === 'FEMININO') return 'F';
  if (tag === 'MISTO') return 'Mix';
  return null;
}

const LISTING_STATUSES: readonly TournamentListingStatus[] = ['open', 'almost_full', 'live', 'ended'];

export function listingStatusFromRaw(raw: string | null): TournamentListingStatus {
  const n = (raw ?? '').trim().toLowerCase();
  if ((LISTING_STATUSES as readonly string[]).includes(n)) return n as TournamentListingStatus;
  if (n === 'encerrado' || n === 'finalizado') return 'ended';
  return 'open';
}

/** Espelha `bracketFormatLabel`. */
export function bracketFormatLabel(raw: string): string {
  const n = raw.trim().toLowerCase().replace(/_/g, ' ');
  if (!n) return '';
  switch (n) {
    case 'single elimination':
      return 'Eliminatória simples';
    case 'double elimination':
      return 'Dupla eliminatória';
    case 'pool play + se':
      return 'Fase de Grupos + Mata-mata';
    case 'group cross + play-in':
      return 'Grupos cruzados + Mata-mata';
    case 'groups knockout':
      return 'Fase de Grupos + Mata-mata';
    case 'groups repechage':
      return 'Grupos + repescagem';
    case 'round robin':
      return 'Todos contra todos';
    default:
      if (n.includes('pool') && n.includes('se')) return 'Fase de Grupos + Mata-mata';
      if (n.includes('grupos') || n.includes('grupo')) return 'Fase de Grupos + Mata-mata';
      return raw;
  }
}

/** Espelha `isDoubleEliminationBracketFormat`. */
export function isDoubleEliminationBracketFormat(raw: string): boolean {
  const n = raw.trim().toLowerCase().replace(/_/g, ' ');
  if (!n) return false;
  return n === 'double elimination' || n.includes('double elim') || (n.includes('dupla') && n.includes('elim'));
}

/** Espelha `bracketFormatHasGroupsPhase`. */
export function bracketFormatHasGroupsPhase(raw: string): boolean {
  const n = raw.trim().toLowerCase().replace(/_/g, ' ');
  if (!n) return false;
  if (isDoubleEliminationBracketFormat(raw)) return false;
  if (n === 'single elimination') return false;
  return (
    n.includes('pool') ||
    n.includes('grupo') ||
    n.includes('group cross') ||
    n.includes('play-in') ||
    n.includes('groups knockout') ||
    n.includes('groups repechage') ||
    n === 'round robin'
  );
}

function formatFromRaw(raw: string | null): 'Dupla' | 'Individual' {
  const n = (raw ?? '').trim().toLowerCase();
  return n.includes('individual') || n.includes('solo') ? 'Individual' : 'Dupla';
}

function priceLabel(reais: number): string {
  return 'R$ ' + reais.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
}

/** Converte um doc real de `tournaments` no modelo de listagem já usado pelo mock. `enrolled`
 *  vem de fora (depende do uid logado, não é um campo do doc). */
export function buildDiscoveryTournament(raw: TournamentRaw, enrolled: boolean, now: Date = new Date()): DiscoveryTournament {
  const categories = [...new Set(raw.categories.map((c) => genderTypeFromRaw(c.genderType)).filter((c): c is TournamentGenderCat => c != null))];
  const cheapestFee = raw.categories.length > 0 ? Math.min(...raw.categories.map((c) => c.entryFee)) : 0;
  const spotsTotal = raw.capacity;
  const spotsLeft = Math.max(0, raw.capacity - raw.enrolledCount);
  const status = listingStatusFromRaw(raw.listingStatus);

  return {
    id: raw.id,
    name: raw.name,
    location: raw.locationName ?? raw.city ?? '',
    city: raw.city ?? '',
    dateLabel: raw.startAt ? raw.startAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '',
    startDate: raw.startAt ?? now,
    categories,
    format: formatFromRaw(raw.format),
    priceLabel: priceLabel(cheapestFee),
    priceValue: cheapestFee,
    spotsLeft,
    spotsTotal,
    status: spotsTotal > 0 && spotsLeft <= Math.max(1, Math.round(spotsTotal * 0.1)) && status === 'open' ? 'almost_full' : status,
    featured: raw.featured,
    enrolledCount: raw.enrolledCount,
    liveMatchesNow: raw.liveMatchesNow,
    enrolled,
    registrationOpensAt: null,
    leagueId: raw.leagueId ?? undefined,
    leagueStageId: raw.leagueStageId ?? undefined,
  };
}

export function buildDiscoveryLeague(raw: LeagueRaw): DiscoveryLeague {
  const stages = [...raw.stages]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({ id: s.id, name: s.name, order: s.order, dateLabel: s.dateLabel ?? undefined, tournamentIds: s.tournamentIds }));
  return {
    id: raw.id,
    name: raw.name,
    seasonLabel: raw.seasonLabel ?? undefined,
    city: raw.city ?? undefined,
    stages,
  };
}

// --- Detalhe do torneio ---

function genderLabelFromRaw(raw: string | null): string {
  const cat = genderTypeFromRaw(raw);
  if (cat === 'M') return 'Masculino';
  if (cat === 'F') return 'Feminino';
  if (cat === 'Mix') return 'Misto';
  return raw ?? '—';
}

export function buildTournamentDetailCategories(categories: readonly TournamentCategoryRaw[]): TournamentDetailCategory[] {
  return categories.map((c) => ({
    id: c.categoryId,
    name: c.categoryName,
    genderLabel: genderLabelFromRaw(c.genderType),
    level: c.level ?? 'Livre',
    spotsLeft: Math.max(0, c.spotsLeft),
    spotsTotal: c.maxTeams,
    priceLabel: priceLabel(c.entryFee),
    registrationClosed: c.registrationClosed,
  }));
}

function formatDateDetail(startAt: Date | null, endAt: Date | null): string {
  if (!startAt) return 'Data a confirmar';
  const dayMonth = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  if (endAt && endAt.toDateString() !== startAt.toDateString()) {
    return `${dayMonth(startAt)} a ${dayMonth(endAt)}`;
  }
  return startAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Monta o modelo real da tela de Detalhe a partir do doc `tournaments/{id}` — sem os campos
 *  decorativos do mock (posts, comunicados, transmissão ao vivo, ranking-preview, premiação),
 *  que não têm fonte de dado real; ver memória da sessão. */
export function buildTournamentDetailView(raw: TournamentRaw, listingStatus: TournamentListingStatus): TournamentDetailView {
  const location = raw.locationName ?? raw.city ?? '';
  const city = raw.city ?? '';
  const bracketState: BracketPreviewState = listingStatus === 'live' ? 'live' : listingStatus === 'ended' ? 'done' : 'soon';
  return {
    dateDetail: formatDateDetail(raw.startAt, raw.endAt),
    mapQuery: [location, city].filter((s) => s.length > 0).join(', '),
    categories: buildTournamentDetailCategories(raw.categories),
    bracketState,
  };
}

// --- Chaves (mata-mata) ---

export interface BracketRound {
  round: number;
  matches: MatchRaw[];
}

/** Agrupa partidas de mata-mata por `round`, ordenadas por `matchNumber` dentro de cada rodada
 *  — espelha o agrupamento de `tournament_matches_logic.dart` (sem WB/LB, só eliminação
 *  simples nesta rodada; dupla eliminação fica pra uma implementação futura da grade WB/LB). */
export function buildSingleEliminationRounds(matches: readonly MatchRaw[]): BracketRound[] {
  const byRound = new Map<number, MatchRaw[]>();
  for (const m of matches) {
    if (m.isGroupMatch) continue;
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, roundMatches]) => ({ round, matches: [...roundMatches].sort((a, b) => a.matchNumber - b.matchNumber) }));
}

// --- Grupos (fase de grupos) ---

export interface GroupStandingRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
}

function parseSets(result: string): number {
  const n = Number(result.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Classificação simplificada de um grupo: vitórias, derrotas e sets pró/contra, ordenada por
 *  vitórias e depois saldo de sets. Não replica o desempate direto (head-to-head) do app —
 *  simplificação documentada, ver spec/memória da sessão. */
export function buildGroupStandings(matches: readonly MatchRaw[], poolId: string): GroupStandingRow[] {
  const rows = new Map<string, GroupStandingRow>();
  const ensure = (id: string | null, name: string | null): GroupStandingRow | null => {
    if (!id) return null;
    const existing = rows.get(id);
    if (existing) return existing;
    const row: GroupStandingRow = { teamId: id, teamName: name ?? 'Equipe', wins: 0, losses: 0, setsFor: 0, setsAgainst: 0 };
    rows.set(id, row);
    return row;
  };

  for (const m of matches) {
    if (m.poolId !== poolId || !m.winnerId) continue;
    const rowA = ensure(m.teamAId, m.teamAName);
    const rowB = ensure(m.teamBId, m.teamBName);
    const setsA = parseSets(m.resultA);
    const setsB = parseSets(m.resultB);
    if (rowA) {
      rowA.setsFor += setsA;
      rowA.setsAgainst += setsB;
      if (m.winnerId === m.teamAId) rowA.wins += 1;
      else rowA.losses += 1;
    }
    if (rowB) {
      rowB.setsFor += setsB;
      rowB.setsAgainst += setsA;
      if (m.winnerId === m.teamBId) rowB.wins += 1;
      else rowB.losses += 1;
    }
  }

  return [...rows.values()].sort((a, b) => b.wins - a.wins || b.setsFor - b.setsAgainst - (a.setsFor - a.setsAgainst));
}

export function distinctPoolIds(matches: readonly MatchRaw[]): string[] {
  return [...new Set(matches.map((m) => m.poolId).filter((p): p is string => p != null))];
}
