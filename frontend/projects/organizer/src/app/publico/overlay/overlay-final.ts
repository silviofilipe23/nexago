import { kocFinalTable, normalizeMatchType } from '../../painel/data/koc';
import { matchClosedSets } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import { finalKindOf } from '../../painel/telao/telao-final-mode';

export type FinalPlacar =
  | {
      tipo: 'sets';
      vencidosCampeao: number;
      vencidosVice: number;
      sets: Array<{ campeao: number; vice: number }>;
    }
  | {
      tipo: 'pontos';
      pontosCampeao: number;
      pontosVice: number;
      coroasCampeao: number;
      coroasVice: number;
    };

export interface FinalResult {
  campeaoTeamId: string;
  viceTeamId: string;
  placar: FinalPlacar;
}

/** Campeão, vice e o placar da FINAL de uma categoria — nos dois formatos.
 *
 *  A tela não sabe se o torneio é de duelo ou King of the Court: recebe o miolo pronto. No duelo
 *  o placar é em sets; no KOTC não existe set, então o lugar é de pontos e coroas. */
export function finalResultOf(match: TournamentMatch): FinalResult | null {
  if (match.status !== 'completed') return null;

  if (normalizeMatchType(match.matchType) === 'koc final') return kocFinal(match);
  return finalKindOf(match.matchType) === 'final' ? duelo(match) : null;
}

function kocFinal(match: TournamentMatch): FinalResult | null {
  const round = match.koc;
  if (!round) return null;

  // A tabela oficial é a que o servidor gravou; `kocFinalTable` só cai na ordem por pontos numa
  // rodada encerrada por caminho antigo. Sem elenco não há pódio nenhum pra anunciar.
  const tabela = kocFinalTable(round);
  if (tabela.length < 2) return null;

  const [campeao, vice] = tabela;
  return {
    campeaoTeamId: campeao.teamId,
    viceTeamId: vice.teamId,
    placar: {
      tipo: 'pontos',
      pontosCampeao: campeao.points,
      pontosVice: vice.points,
      coroasCampeao: campeao.crowns,
      coroasVice: vice.crowns,
    },
  };
}

function duelo(match: TournamentMatch): FinalResult | null {
  // `winnerSide` vem do `winnerId`, e ele já apareceu apontando pra doc inexistente. Sem vencedor
  // declarado não se coroa ninguém: o placar é só exibição e não decide colocação.
  if (match.winnerSide == null) return null;

  const campeaoEhA = match.winnerSide === 1;
  const fechados = matchClosedSets(match);
  // Vira pra perspectiva do campeão, pra tela nunca precisar saber de que lado ele jogou.
  const sets = fechados.map((s) => ({
    campeao: campeaoEhA ? s.a : s.b,
    vice: campeaoEhA ? s.b : s.a,
  }));

  return {
    campeaoTeamId: campeaoEhA ? match.teamAId : match.teamBId,
    viceTeamId: campeaoEhA ? match.teamBId : match.teamAId,
    placar: {
      tipo: 'sets',
      vencidosCampeao: sets.filter((s) => s.campeao > s.vice).length,
      vencidosVice: sets.filter((s) => s.vice > s.campeao).length,
      sets,
    },
  };
}
