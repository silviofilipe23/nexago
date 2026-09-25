import { kocPhaseLabelAt, kocPlansMatch, type KocPhaseSpec } from '../data/koc-phase-plan';
import type { KocConfigSource, KocRoundState } from '../data/koc';
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
  round: Pick<KocRoundState, 'phases' | 'configSource' | 'roundsPerBracket' | 'teamsPerCourt' | 'qualifiersPerRound'>,
  category: Pick<OrganizerTournamentCategory, 'kocPhases' | 'kocRoundsPerBracket' | 'kocTeamsPerCourt' | 'kocQualifiersPerRound'>,
): string | null {
  const diffs: string[] = [];
  const published = round.phases;
  const configured = category.kocPhases;
  const source = round.configSource;

  if (published && configured) {
    // Os dois lados têm plano: compara plano com plano. Não precisa da origem
    // — é o caso que já funcionava.
    if (!kocPlansMatch(published, configured)) {
      diffs.push(kocPlanDriftDetail(published, configured));
    }
  } else if (source?.hasPlan) {
    // A chave nasceu de um plano montado na tela e a categoria não guarda mais
    // nenhum. Sem a origem isto era indistinguível do caso normal abaixo.
    diffs.push(
      'plano de fases: a categoria não guarda mais um plano — a chave foi gerada com um',
    );
  } else if (source) {
    // Plano DERIVADO dos três números — o caminho do app e do publish do
    // sorteio, que nunca gravam plano na categoria. Compara contra a ORIGEM,
    // nunca contra os campos legados da rodada: aqueles são os desta fase e
    // acusariam mudança onde ninguém mexeu (6 duplas em quadras de 4 congelam
    // `teamsPerCourt: 3`).
    diffs.push(...kocNumbersDrift(source, category));
  } else if (published) {
    // Chave com plano e categoria sem: o caso NORMAL, não uma anomalia.
    // `kocPhases` só é gravado pela tela de gerar chave do portal; o app e o
    // publish do Sorteio ao Vivo geram a partir dos três números e congelam na
    // rodada o plano DERIVADO, sem nunca escrevê-lo na categoria. Avisar aqui
    // punha o banner permanentemente numa chave que bate perfeitamente — e um
    // aviso que está sempre aceso deixa de ser aviso.
    //
    // Cair nos três números também não serve: os da rodada são os da FASE
    // (`kocRoundDoc` congela o teto de chave que a distribuição calculou), não
    // os da categoria — 6 duplas em quadras de 4 congelam `teamsPerCourt: 3`
    // sem ninguém ter mexido em nada. A comparação honesta exigiria derivar de
    // novo o plano legado, que é regra do backend e não mora neste portal.
  } else {
    // Chave anterior a esta entrega: ali os três números da rodada SÃO os da
    // categoria, então compará-los é honesto.
    diffs.push(...kocNumbersDrift(round, category));
  }
  return diffs.length > 0 ? `${diffs.join('; ')}.` : null;
}

/** Os três números, venham da origem carimbada ou de uma chave antiga. */
function kocNumbersDrift(
  from: Pick<KocConfigSource, 'teamsPerCourt' | 'roundsPerBracket' | 'qualifiersPerRound'>,
  category: Pick<OrganizerTournamentCategory, 'kocRoundsPerBracket' | 'kocTeamsPerCourt' | 'kocQualifiersPerRound'>,
): string[] {
  const diffs: string[] = [];
  if (from.roundsPerBracket !== category.kocRoundsPerBracket) {
    diffs.push(
      `rodadas por chave: a categoria pede ${category.kocRoundsPerBracket}, ` +
        `a chave foi gerada com ${from.roundsPerBracket}`,
    );
  }
  if (from.teamsPerCourt !== category.kocTeamsPerCourt) {
    diffs.push(
      `duplas por quadra: a categoria pede ${category.kocTeamsPerCourt}, ` +
        `a chave foi gerada com ${from.teamsPerCourt}`,
    );
  }
  if (from.qualifiersPerRound !== category.kocQualifiersPerRound) {
    diffs.push(
      `classificadas por rodada: a categoria pede ${category.kocQualifiersPerRound}, ` +
        `a chave foi gerada com ${from.qualifiersPerRound}`,
    );
  }
  return diffs;
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
