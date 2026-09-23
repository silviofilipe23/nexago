import { kocFinalTable, kocPhaseLabel, normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';

/** Ordem das fases do KOTC. Classificatória é o piso: qualquer tipo `koc_*` novo entra nela em
 *  vez de virar uma fase desconhecida. */
function phaseRankOf(matchType: string): number {
  const t = normalizeMatchType(matchType);
  if (t === 'koc final') return 3;
  if (t === 'koc semifinal') return 2;
  return 1;
}

export type KocStandingStatus = 'king' | 'qualified' | 'out';

export interface KocStandingRow {
  place: number;
  teamId: string;
  points: number;
  status: KocStandingStatus;
}

export interface KocStandingsBoard {
  rows: KocStandingRow[];
  vagas: number;
  /** Fase que recebe as classificadas ("Semifinal"); null quando não há fase seguinte. */
  destino: string | null;
  /** "Rodada 4"; null na última rodada da fase. */
  proxima: string | null;
  totalRounds: number;
}

/** Tabela da rodada encerrada.
 *
 *  A ordenação NÃO é recalculada aqui: `kocFinalTable` devolve a tabela oficial que
 *  `kocFinishRound` gravou e só cai na ordem por pontos quando a rodada encerrou por um caminho
 *  antigo, sem `kocStandings`. Quem classifica sai da cota da PRÓPRIA rodada — no KOTC do nexaGO
 *  não existe soma entre rodadas (ver `koc-phase-advance.ts` no backend). */
export function kocStandingsBoardOf(
  match: TournamentMatch,
  categoryMatches: readonly TournamentMatch[],
): KocStandingsBoard {
  const round = match.koc;
  if (!round) return { rows: [], vagas: 0, destino: null, proxima: null, totalRounds: 0 };

  const vagas = Math.max(1, Math.floor(round.qualifiersPerRound));
  const rows = kocFinalTable(round).map<KocStandingRow>((row) => ({
    place: row.place,
    teamId: row.teamId,
    points: row.points,
    status: row.place === 1 ? 'king' : row.place <= vagas ? 'qualified' : 'out',
  }));

  const phase = normalizeMatchType(match.matchType);
  const samePhase = categoryMatches.filter((m) => normalizeMatchType(m.matchType) === phase);

  const nextLabel = round.roundLabel + 1;
  const proxima = samePhase.some((m) => m.koc?.roundLabel === nextLabel)
    ? `Rodada ${nextLabel}`
    : null;

  // Destino = a fase seguinte que EXISTE na categoria, não a que o formato permitiria. Prometer
  // "Semifinal" num campo que vai direto pra final seria mentir no ar.
  const rank = phaseRankOf(match.matchType);
  const proximaFase = categoryMatches
    .filter((m) => phaseRankOf(m.matchType) > rank)
    .sort((a, b) => phaseRankOf(a.matchType) - phaseRankOf(b.matchType))[0];

  return {
    rows,
    vagas,
    destino: proximaFase ? kocPhaseLabel(proximaFase.matchType, 0) : null,
    proxima,
    totalRounds: samePhase.length,
  };
}
