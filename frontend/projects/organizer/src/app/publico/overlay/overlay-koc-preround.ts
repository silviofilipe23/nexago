import { isKingOfCourtMatchType, KOC_MIN_TEAMS_PER_ROUND, normalizeMatchType } from '../../painel/data/koc';
import type { TournamentMatch } from '../../painel/data/matches-repository';

export type PreRoundPapel = 'trono' | 'desafia' | 'sequencia' | 'aguardando';

export interface PreRoundRow {
  posicao: number;
  teamId: string;
  papel: PreRoundPapel;
  points: number;
}

export interface KocPreRound {
  tronoTeamId: string;
  rows: PreRoundRow[];
  /** Grande final: visual próprio (título, borda de luz, rodapé). */
  isFinal: boolean;
  teamCount: number;
}

function isKocFinal(matchType: string): boolean {
  return normalizeMatchType(matchType) === 'koc final';
}

function papelDe(index: number): PreRoundPapel {
  if (index === 0) return 'trono';
  if (index === 1) return 'desafia';
  if (index === 2) return 'sequencia';
  return 'aguardando';
}

/** Elenco da rodada KOTC que ainda não começou.
 *
 *  A ordem é a de ENTRADA (`kocTeamIds`), gravada pelo gerador na fase 1 e pelo avanço de fase nas
 *  seguintes — ela existe antes do apito, ao contrário de `kingTeamId`/`challengerTeamId`, que o
 *  servidor só preenche ao iniciar. O primeiro da ordem começa no trono e o segundo desafia.
 *
 *  A lista traz TODAS as duplas da rodada (trono incluso): anunciar só a fila deixava o elenco
 *  incompleto na transmissão. Ao iniciar a partida este quadro some — a barra KOTC assume.
 *
 *  Numa fase cujas vagas ainda não foram resolvidas o elenco vem VAZIO (só existem os slots do
 *  tipo "1º Rodada 1"): aí não há atleta pra anunciar, e a tela não desenha. */
export function kocPreRoundOf(match: TournamentMatch): KocPreRound | null {
  if (!isKingOfCourtMatchType(match.matchType) || !match.koc) return null;
  if (match.status !== 'scheduled') return null;

  const ordem = match.koc.teamIds.filter((id) => id !== '');
  if (ordem.length < KOC_MIN_TEAMS_PER_ROUND) return null;

  const points = match.koc.points ?? {};
  const trono = ordem[0]!;
  return {
    tronoTeamId: trono,
    rows: ordem.map((teamId, i) => ({
      posicao: i + 1,
      teamId,
      papel: papelDe(i),
      points: points[teamId] ?? 0,
    })),
    isFinal: isKocFinal(match.matchType),
    teamCount: ordem.length,
  };
}
