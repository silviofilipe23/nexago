import type { TournamentMatch } from '../../data/matches-repository';
import { isFinalMatchTypeOf } from '../focus/focus-journey';
import { outcomeOf, sideOf } from '../tournament-live.selectors';

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
