import { kocFinalTable, kocPhaseLabel, normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';

/** Ordem das fases do KOTC. Classificatória é o piso: qualquer tipo `koc_*` novo entra nela em
 *  vez de virar uma fase desconhecida. */
export function phaseRankOf(matchType: string): number {
  const t = normalizeMatchType(matchType);
  if (t === 'koc final') return 3;
  if (t === 'koc semifinal') return 2;
  return 1;
}

/** Quantas duplas a rodada classifica DE FATO.
 *
 *  `buildKingOfCourtRounds` no backend: "Só a fase 1 se divide em várias rodadas por chave; as
 *  seguintes seguem com uma rodada por chave e `qualifiersPerRound` classificadas" — e acima de
 *  uma rodada por chave a classificatória classifica UMA dupla por rodada, porque a vencedora sai
 *  e a chave encolhe. Usar a cota configurada nesses campos poria "2 vagas" onde passa uma. */
export function kocVagasDaRodada(
  matchType: string,
  round: { qualifiersPerRound: number; roundsPerBracket: number },
): number {
  if (phaseRankOf(matchType) === 1 && round.roundsPerBracket > 1) return 1;
  return Math.max(1, Math.floor(round.qualifiersPerRound));
}

/** Fase seguinte que EXISTE na categoria — prometer "Semifinal" num campo que vai direto pra
 *  final seria mentir no ar. */
export function kocDestinoDaFase(
  matchType: string,
  categoryMatches: readonly { matchType: string }[],
): string | null {
  const rank = phaseRankOf(matchType);
  const proxima = categoryMatches
    .filter((m) => phaseRankOf(m.matchType) > rank)
    .sort((a, b) => phaseRankOf(a.matchType) - phaseRankOf(b.matchType))[0];
  return proxima ? kocPhaseLabel(proxima.matchType, 0) : null;
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

  const vagas = kocVagasDaRodada(match.matchType, round);

  // A cota REAL não é sempre a configurada. `buildKingOfCourtRounds` no backend: "Só a fase 1
  // se divide em várias rodadas por chave; as seguintes seguem com uma rodada por chave e
  // `qualifiersPerRound` classificadas" — e acima de uma rodada por chave a classificatória
  // classifica UMA dupla por rodada, porque a vencedora sai e a chave encolhe. Anunciar a cota
  // configurada nesse caso poria "2 vagas" na tela quando só uma passa.
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

  return {
    rows,
    vagas,
    destino: kocDestinoDaFase(match.matchType, categoryMatches),
    proxima,
    totalRounds: samePhase.length,
  };
}
