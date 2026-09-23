import { kocFinalTable, normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { kocDestinoDaFase, kocVagasDaRodada } from './overlay-koc-standings';

export interface KocQualifiedEntry {
  teamId: string;
  place: number;
  roundLabel: number;
}

export interface KocQualifiedBoard {
  entries: KocQualifiedEntry[];
  totalRounds: number;
  roundsDone: number;
  vagasPorRodada: number;
  destino: string | null;
}

/** Quem já garantiu vaga na fase, rodada a rodada.
 *
 *  NÃO é uma tabela acumulada: no KOTC do nexaGO ninguém avança por soma entre rodadas — cada
 *  rodada classifica os seus e a vaga é gravada como "1º da Rodada N" (ver `koc-phase-advance.ts`).
 *  Esta tela só reúne o que cada rodada encerrada já decidiu. */
export function kocQualifiedBoardOf(
  match: TournamentMatch,
  categoryMatches: readonly TournamentMatch[],
): KocQualifiedBoard {
  const fase = normalizeMatchType(match.matchType);
  // A lista da categoria é lida uma vez no gateway e envelhece: o doc ao vivo manda no status
  // desta partida, senão a rodada que acabou de encerrar some do quadro.
  const porId = new Map(categoryMatches.map((m) => [m.id, m]));
  porId.set(match.id, match);

  const rodadas = [...porId.values()]
    .filter((m) => normalizeMatchType(m.matchType) === fase && m.koc != null)
    .sort((a, b) => (a.koc?.roundLabel ?? 0) - (b.koc?.roundLabel ?? 0));

  const encerradas = rodadas.filter((m) => m.status === 'completed');
  const vagasPorRodada = match.koc ? kocVagasDaRodada(match.matchType, match.koc) : 0;

  const entries = encerradas.flatMap<KocQualifiedEntry>((m) => {
    const round = m.koc;
    if (!round) return [];
    const vagas = kocVagasDaRodada(m.matchType, round);
    return kocFinalTable(round)
      .filter((row) => row.place <= vagas)
      .map((row) => ({ teamId: row.teamId, place: row.place, roundLabel: round.roundLabel }));
  });

  return {
    entries,
    totalRounds: rodadas.length,
    roundsDone: encerradas.length,
    vagasPorRodada,
    destino: kocDestinoDaFase(match.matchType, [...porId.values()]),
  };
}
