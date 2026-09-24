import { kocPlansMatch, type KocPhaseSpec } from '../data/koc-phase-plan';
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
      diffs.push(kocPlanDriftDetail(published, configured));
    }
  } else if (published && !configured) {
    // A categoria não guarda mais um plano (por exemplo, alguém desfez a
    // config depois de publicar). Fica quieto aqui seria pior do que avisar:
    // não dá pra comparar plano com "nenhum plano", mas o organizador precisa
    // saber que a categoria não descreve mais o que está gerado na areia.
    diffs.push('plano de fases: a categoria não guarda mais um plano — a chave foi gerada com um');
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

/** Mensagem para quando os dois planos existem mas `kocPlansMatch` diz que não
 *  batem. Contagem de fases diferente é o caso fácil — o número já conta a
 *  história. Mesma contagem com fase diferente por dentro (a edição só na
 *  semifinal, por exemplo) É o caso que esta comparação existe para pegar, e
 *  "a categoria pede 2, a chave foi gerada com 2" não diz nada: aponta a
 *  primeira fase que diverge, com nome (Classificatória/Semifinal/Final, como
 *  a tabela da tela de gerar chave rotula) e o campo que mudou. */
function kocPlanDriftDetail(published: KocPhaseSpec[], configured: KocPhaseSpec[]): string {
  if (published.length !== configured.length) {
    return (
      `plano de fases: a categoria pede ${configured.length} fase(s), ` +
      `a chave foi gerada com ${published.length}`
    );
  }
  for (let i = 0; i < published.length; i++) {
    const field = kocPhaseFieldDiff(published[i], configured[i]);
    if (field) return `${kocPhaseLabelAt(i, published.length)} (fase ${i + 1}) — ${field}`;
  }
  // `kocPlansMatch` já garantiu que alguma fase diverge quando o código chega
  // aqui com o mesmo número de fases — este retorno é só a rede de segurança
  // do tipo (a função sempre devolve `string`), nunca deveria disparar de
  // verdade: `kocPhaseFieldDiff` cobre exatamente os mesmos campos que
  // `kocPlansMatch` compara.
  return 'plano de fases: a categoria e a chave publicada divergem';
}

/** Primeiro campo que diverge entre duas fases de mesma posição — chaves
 *  (contagem OU tamanho de cada uma), baterias ou classificadas, nessa ordem.
 *  Duração fica de fora, mesmo critério de `kocPlansMatch`. `null` quando a
 *  fase bate. */
function kocPhaseFieldDiff(published: KocPhaseSpec, configured: KocPhaseSpec): string | null {
  if (
    published.bracketSizes.length !== configured.bracketSizes.length ||
    published.bracketSizes.some((size, i) => size !== configured.bracketSizes[i])
  ) {
    return (
      `chaves: a categoria pede ${configured.bracketSizes.join(', ')}, ` +
      `a chave foi gerada com ${published.bracketSizes.join(', ')}`
    );
  }
  if (published.roundsPerBracket !== configured.roundsPerBracket) {
    return (
      `baterias: a categoria pede ${configured.roundsPerBracket}, ` +
      `a chave foi gerada com ${published.roundsPerBracket}`
    );
  }
  if (published.qualifiersPerRound !== configured.qualifiersPerRound) {
    return (
      `classificadas: a categoria pede ${configured.qualifiersPerRound}, ` +
      `a chave foi gerada com ${published.qualifiersPerRound}`
    );
  }
  return null;
}

/** "Classificatória" / "Semifinal" / "Final" pela POSIÇÃO da fase — mesma
 *  regra de `kocPhaseTitle` em `seeds.component.ts` (a tela de gerar chave),
 *  duplicada aqui porque aquele componente carrega Angular/Firebase que este
 *  módulo puro não deveria puxar. */
function kocPhaseLabelAt(index: number, total: number): string {
  if (index === total - 1) return 'Final';
  if (total >= 3 && index === total - 2) return 'Semifinal';
  return 'Classificatória';
}
