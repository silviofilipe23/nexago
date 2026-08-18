import { LEVEL_OPTIONS, levelRankOf, type LevelOption } from '@nexago/levels';

/**
 * Opções de nível pra ação "Promover nível" do organizador (Task 8 do plano de calibração) —
 * espelha a regra pura do backend (`planOrganizerPromotionDirection` em
 * `functions/src/athlete-level-admin.ts`): sobe ou SEMEIA o 1º nível; nunca repete nem desce o
 * degrau atual quando já existe um.
 *
 * `currentLevelCode` aceita o mesmo vocabulário de `levelRankOf` (código canônico OU label
 * legado) porque é isso que `levelCodeFor` (team-level-score.ts) devolve — o fallback pro
 * nível global de docs antigos vem como label (`"Intermediário 2"`), não código.
 */

/** Degraus disponíveis pra promoção, em ordem crescente de força.
 *
 *  - Atleta COM nível reconhecido: só os degraus ESTRITAMENTE ACIMA — `[]` quando já está no
 *    topo (Open). Espelha `planOrganizerPromotionDirection` (`functions/src/athlete-level-admin.ts`):
 *    `targetRank <= currentRank` é rejeitado.
 *  - Atleta SEM nível declarado nesse esporte (ou valor não reconhecido): os 7 degraus inteiros.
 *    NÃO é `[]` — o backend trata `currentRank == null` como "sem degrau anterior pra descer",
 *    ou seja, semear o 1º nível de um esporte é exatamente o mesmo `mode: "ok"` que promover
 *    (ver `planOrganizerPromotionDirection`, `currentRank == null` pula a checagem de direção).
 *    Esse é o caso mais comum da calibração inicial — o organizador vendo jogar um atleta que
 *    ainda não preencheu o próprio nível —, então escondê-lo aqui empurraria a ação de volta
 *    pro backoffice, que é o que esta tela existe pra evitar. */
export function promotableLevelOptions(currentLevelCode: string | null | undefined): readonly LevelOption[] {
  const currentRank = levelRankOf(currentLevelCode);
  if (currentRank == null) return LEVEL_OPTIONS;
  return LEVEL_OPTIONS.filter((option) => (levelRankOf(option.code) ?? -1) > currentRank);
}
