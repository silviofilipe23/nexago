import { kocPlansMatch } from '../data/koc-phase-plan';
import type { KocRoundState } from '../data/koc';
import type { OrganizerTournamentCategory } from '../data/tournament.model';

/** Diferença entre a config da CATEGORIA e o snapshot que ficou na rodada
 *  publicada. Extraído do computed de `ChaveamentoComponent` para ser testável
 *  sem instanciar o componente (mesmo motivo de `chaveamento-zoom.ts`).
 *
 *  Chave publicada carrega o plano com que foi gerada; a divergência compara
 *  plano com plano — é o que pega "o organizador mexeu no formato depois de
 *  publicar" mesmo quando a mudança é só na fase 2 em diante, que os três
 *  números soltos nem descreviam. Chave antiga (sem `phases`) cai na
 *  comparação dos três números, que é tudo que ela guarda. */
export function kocDriftDetail(
  round: Pick<KocRoundState, 'phases' | 'roundsPerBracket' | 'teamsPerCourt' | 'qualifiersPerRound'>,
  category: Pick<OrganizerTournamentCategory, 'kocPhases' | 'kocRoundsPerBracket' | 'kocTeamsPerCourt' | 'kocQualifiersPerRound'>,
): string | null {
  const diffs: string[] = [];
  const published = round.phases;
  const configured = category.kocPhases;
  if (published && configured) {
    if (!kocPlansMatch(published, configured)) {
      diffs.push(
        `plano de fases: a categoria pede ${configured.length} fase(s), ` +
          `a chave foi gerada com ${published.length}`,
      );
    }
  } else if (!published) {
    if (round.roundsPerBracket !== category.kocRoundsPerBracket) {
      diffs.push(
        `rodadas por chave: a categoria pede ${category.kocRoundsPerBracket}, ` +
          `a chave foi gerada com ${round.roundsPerBracket}`,
      );
    }
    if (round.teamsPerCourt !== category.kocTeamsPerCourt) {
      diffs.push(
        `duplas por quadra: a categoria pede ${category.kocTeamsPerCourt}, ` +
          `a chave foi gerada com ${round.teamsPerCourt}`,
      );
    }
    if (round.qualifiersPerRound !== category.kocQualifiersPerRound) {
      diffs.push(
        `classificadas por rodada: a categoria pede ${category.kocQualifiersPerRound}, ` +
          `a chave foi gerada com ${round.qualifiersPerRound}`,
      );
    }
  }
  return diffs.length > 0 ? `${diffs.join('; ')}.` : null;
}
