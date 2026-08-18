import { matchClosedSets, matchIsCompleted, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import { isFinalMatchTypeOf, knockoutRounds } from '../focus/focus-journey';
import { byScheduleTime, groupLabelOf, knockoutLabelOf, outcomeOf, roundDisplayNumberOf, sideOf } from '../tournament-live.selectors';

/**
 * Como a campanha do atleta terminou nesta categoria.
 *
 * `'none'` cobre tudo que não é pódio — eliminado em qualquer fase, 4º lugar, campanha ainda em
 * andamento — e é o card CAMPANHA dos protótipos, não um estado de erro.
 */
export type CampaignPlacement = 'champion' | 'runner-up' | 'third' | 'none';

/** A disputa de 3º lugar, com a grafia exata dos dois geradores
 *  (`functions/src/category-bracket-builders.ts`). */
function isThirdPlaceMatchTypeOf(m: Pick<TournamentMatch, 'matchType'>): boolean {
  const t = m.matchType.trim().toLowerCase();
  return t === 'third place' || t === 'third_place';
}

/**
 * A colocação final do atleta na categoria, decidida SEMPRE pelo `matchType` da partida, NUNCA
 * pelo `round`.
 *
 * O motivo é uma armadilha real desta base: a disputa de 3º lugar recebe o MESMO `round` da final
 * (`category-bracket-builders.ts` — "3º lugar: perdedores das semifinais", `round: roundStart +
 * totalRounds - 1`, idêntico ao da final). Qualquer versão que decida por round coroa como campeão
 * um atleta que venceu a disputa de 3º. `bracketWorstPlaceOf` e `winsToTitleOf`
 * (`focus/focus-journey*.ts`) já pagaram esse preço; esta função existe pra não pagar de novo.
 *
 * Só entra partida ENCERRADA com vencedor: a leitura é por `outcomeOf`, que exige
 * `matchIsCompleted` e `winnerId`. Sem prova, a resposta é `'none'` — nunca um pódio afirmado por
 * dedução.
 *
 * A mesma regra vale nos dois formatos, sem ramo especial. Verificado no gerador: a eliminação
 * simples e a dupla eliminação gravam ambas `'Final'` (grande final inclusive) e `'Third Place'`
 * (na DE, vice WB × vice LB), e a DE deste projeto NÃO tem bracket reset — o perdedor da final da
 * WB não volta pra LB. Logo não existem "duas grandes finais", e a regra 2 nunca afirma vice com a
 * decisão em aberto.
 *
 * NÃO deriva de `bracketWorstPlaceOf`: aquela responde "o que a premiação já garante" e é
 * conservadora de propósito (devolve 4º pra quem VENCEU a disputa de 3º). Aqui a campanha acabou e
 * o resultado é conhecido — encadear as duas traria a conservação pra um lugar onde ela estaria
 * simplesmente errada.
 */
export function campaignPlacementOf(
  matches: readonly TournamentMatch[],
  categoryId: string,
  myTeamIds: ReadonlySet<string>,
): CampaignPlacement {
  const mine = matches.filter((m) => m.categoryId === categoryId && sideOf(m, myTeamIds) !== null);

  const finals = mine.filter(isFinalMatchTypeOf);
  if (finals.some((m) => outcomeOf(m, myTeamIds) === 'win')) return 'champion';
  if (finals.some((m) => outcomeOf(m, myTeamIds) === 'loss')) return 'runner-up';

  if (mine.filter(isThirdPlaceMatchTypeOf).some((m) => outcomeOf(m, myTeamIds) === 'win')) return 'third';

  return 'none';
}

/**
 * Uma linha do painel de trajetória.
 *
 * União discriminada porque o painel desenha duas coisas diferentes: a partida (selo V/D, fase,
 * adversário, placar em sets, parciais) e o resumo do grupo, que só existe quando a campanha é
 * longa demais pro painel (ver `fitCampaignRows`). Um tipo único com campos anuláveis faria a
 * arte adivinhar qual desenho usar.
 */
export type CampaignRow =
  | {
      kind: 'match';
      outcome: 'win' | 'loss';
      /** Partida da fase de grupos. Campo próprio, e não farejado do `phaseLabel`: é por ele que
       *  `fitCampaignRows` sabe o que pode colapsar, e um rótulo é texto de exibição — muda de
       *  redação sem aviso e levaria o colapso junto. */
      isGroup: boolean;
      /** "Grupo A · J1", "Quartas", "LB · Rodada 2", "Final". */
      phaseLabel: string;
      opponentName: string;
      /** "2–0", em SETS, na ótica do atleta. */
      setScore: string;
      /** ["21-15", "21-18"] — parciais na mesma ótica. */
      partials: string[];
    }
  | {
      kind: 'group-summary';
      /** "Grupo A". */
      phaseLabel: string;
      games: number;
      wins: number;
      losses: number;
    };

/**
 * A fase, do jeito que ela precisa ser lida numa imagem SOLTA.
 *
 * Difere de `phaseLabelOf` (`focus/journey/focus-journey.component.ts`) num ponto de propósito: lá
 * a fase de grupos vira só "Rodada N", porque a seção da tela já se intitula "Grupo A ·
 * Classificação parcial" e repetir roubaria largura no celular. Aqui não existe seção nenhuma em
 * volta — quem recebe a imagem no WhatsApp precisa do grupo escrito.
 *
 * `groupLabelOf` e `roundDisplayNumberOf` recebem as partidas da CATEGORIA, nunca as do torneio:
 * `poolId` só é único dentro da categoria, e "Grupo A" existe em todas elas.
 */
function campaignPhaseLabelOf(
  categoryMatches: readonly TournamentMatch[],
  m: TournamentMatch,
  knockoutRoundsOfCategory: readonly number[],
): string {
  if (m.poolId) return `${groupLabelOf(m.poolId, categoryMatches)} · J${roundDisplayNumberOf(categoryMatches, m.poolId, m.round)}`;
  // WB e LB numeram rodadas por conta própria, então o rótulo carrega a chave junto — a mesma
  // convenção de `knockoutStepLabelOf` na Trajetória e das colunas da aba Chave.
  const type = m.matchType.trim().toUpperCase();
  return type === 'WB' || type === 'LB' ? `${type} · Rodada ${m.round}` : knockoutLabelOf(m, knockoutRoundsOfCategory);
}

/**
 * As partidas ENCERRADAS do atleta na categoria, em ordem cronológica, já na ótica dele.
 *
 * Partida pendente, ao vivo ou cancelada não entra: o card conta o que aconteceu, não o que pode
 * acontecer. Encerrada sem `winnerId` também fica de fora — `outcomeOf` devolve `null` ali, e
 * inventar 'loss' seria pior que omitir a linha.
 */
export function campaignRowsOf(
  matches: readonly TournamentMatch[],
  categoryId: string,
  myTeamIds: ReadonlySet<string>,
  duoNameOf: (teamId: string, fallback: string | null) => string,
): CampaignRow[] {
  const categoryMatches = matches.filter((m) => m.categoryId === categoryId);
  const knockoutRoundsOfCategory = knockoutRounds(matches, categoryId);

  return categoryMatches
    .filter((m) => sideOf(m, myTeamIds) !== null && matchIsCompleted(m) && outcomeOf(m, myTeamIds) !== null)
    .sort(byScheduleTime)
    .map<CampaignRow>((m) => {
      // Garantido pelo filtro acima; a asserção só documenta isso.
      const side = sideOf(m, myTeamIds)!;
      const opponentId = side === 'A' ? m.teamBId : m.teamAId;
      const opponentDescription = side === 'A' ? m.teamBDescription : m.teamADescription;
      const [setsA, setsB] = matchSetWins(m);
      const [mySets, theirSets] = side === 'A' ? [setsA, setsB] : [setsB, setsA];
      return {
        kind: 'match',
        outcome: outcomeOf(m, myTeamIds) === 'win' ? 'win' : 'loss',
        isGroup: m.poolId.length > 0,
        phaseLabel: campaignPhaseLabelOf(categoryMatches, m, knockoutRoundsOfCategory),
        opponentName: duoNameOf(opponentId, opponentDescription),
        setScore: `${mySets}–${theirSets}`,
        partials: matchClosedSets(m).map((s) => (side === 'A' ? `${s.a}-${s.b}` : `${s.b}-${s.a}`)),
      };
    });
}

/** Quantas linhas o painel comporta no passo do protótipo. Acima disso a arte encolhe o passo. */
export const CAMPAIGN_ROWS_COMFORT = 7;

/** O teto absoluto: quantas linhas cabem com o passo já no piso. Passar daqui exige cortar. */
export const CAMPAIGN_ROWS_MAX = 9;

export interface CampaignTrajectory {
  rows: CampaignRow[];
  /** Jogos que não couberam no painel. `0` quando tudo coube — o cabeçalho só declara o corte
   *  quando ele existe. */
  hiddenCount: number;
}

/**
 * Encaixa a campanha no painel, em dois degraus, nesta ordem.
 *
 * 1. **Colapsa a fase de grupos numa linha só** ("Grupo A", "3 jogos · 2V 1D"). O mata-mata é a
 *    parte que conta a história; o grupo vira contexto. Só colapsa com 2+ partidas de grupo — com
 *    uma só, a troca não economiza linha nenhuma e apagaria um adversário à toa.
 * 2. **Corta as mais ANTIGAS** e devolve `hiddenCount`, pra que o cabeçalho do painel declare
 *    "+N JOGOS".
 *
 * O corte é declarado de propósito. `fitFont` encolhe até o piso e devolve o texto inteiro do
 * jeito que estiver — encolher nunca garantiu encaixe nesta base, e um corte silencioso faria o
 * card mentir sobre o tamanho da campanha.
 *
 * O degrau intermediário do desenho — encolher o passo entre linhas — NÃO mora aqui: é decisão da
 * arte, que compara o total com `CAMPAIGN_ROWS_COMFORT`.
 */
export function fitCampaignRows(rows: readonly CampaignRow[], maxRows = CAMPAIGN_ROWS_MAX): CampaignTrajectory {
  if (rows.length <= maxRows) return { rows: [...rows], hiddenCount: 0 };

  const groupRows = rows.filter((r) => r.kind === 'match' && r.isGroup);
  let working: CampaignRow[] = [...rows];

  if (groupRows.length >= 2) {
    const wins = groupRows.filter((r) => r.kind === 'match' && r.outcome === 'win').length;
    const first = groupRows[0]!;
    const summary: CampaignRow = {
      kind: 'group-summary',
      // O rótulo da linha é "Grupo A · J1"; o resumo fica com o grupo, sem o jogo.
      phaseLabel: (first.kind === 'match' ? first.phaseLabel.split(' · ')[0] : null) ?? 'Grupo',
      games: groupRows.length,
      wins,
      losses: groupRows.length - wins,
    };
    working = [summary, ...rows.filter((r) => !(r.kind === 'match' && r.isGroup))];
  }

  if (working.length <= maxRows) return { rows: working, hiddenCount: 0 };

  const hiddenCount = working.length - maxRows;
  return { rows: working.slice(hiddenCount), hiddenCount };
}
