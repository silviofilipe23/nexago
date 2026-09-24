import { isKingOfCourtMatchType, KOC_MIN_TEAMS_PER_ROUND } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';

export type PreRoundPapel = 'trono' | 'desafia' | 'sequencia' | 'aguardando';

export interface PreRoundRow {
  posicao: number;
  teamId: string;
  papel: PreRoundPapel;
}

export interface KocPreRound {
  tronoTeamId: string;
  rows: PreRoundRow[];
}

/** Elenco da rodada KOTC que ainda não começou.
 *
 *  A ordem é a de ENTRADA (`kocTeamIds`), gravada pelo gerador na fase 1 e pelo avanço de fase nas
 *  seguintes — ela existe antes do apito, ao contrário de `kingTeamId`/`challengerTeamId`, que o
 *  servidor só preenche ao iniciar. O primeiro da ordem começa no trono e o segundo desafia.
 *
 *  A lista traz TODAS as duplas da rodada (trono incluso): anunciar só a fila deixava o elenco
 *  incompleto na transmissão.
 *
 *  Numa fase cujas vagas ainda não foram resolvidas o elenco vem VAZIO (só existem os slots do
 *  tipo "1º Rodada 1"): aí não há atleta pra anunciar, e a tela não desenha. */
export function kocPreRoundOf(match: TournamentMatch): KocPreRound | null {
  if (!isKingOfCourtMatchType(match.matchType) || !match.koc) return null;
  if (match.status !== 'scheduled') return null;

  const ordem = match.koc.teamIds.filter((id) => id !== '');
  if (ordem.length < KOC_MIN_TEAMS_PER_ROUND) return null;

  const trono = ordem[0]!;
  return {
    tronoTeamId: trono,
    rows: ordem.map((teamId, i) => ({
      posicao: i + 1,
      teamId,
      papel: i === 0 ? 'trono' : i === 1 ? 'desafia' : i === 2 ? 'sequencia' : 'aguardando',
    })),
  };
}
