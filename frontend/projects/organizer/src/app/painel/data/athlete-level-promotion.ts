import { LEVEL_OPTIONS, levelRankOf, type LevelOption } from '@nexago/levels';

/**
 * Opções de nível pra ação "Promover nível" do organizador (Task 8 do plano de calibração) —
 * espelha a regra pura do backend (`planOrganizerPromotionDirection` em
 * `functions/src/athlete-level-admin.ts`): só sobe, nunca repete nem desce o degrau atual.
 *
 * `currentLevelCode` aceita o mesmo vocabulário de `levelRankOf` (código canônico OU label
 * legado) porque é isso que `levelCodeFor` (team-level-score.ts) devolve — o fallback pro
 * nível global de docs antigos vem como label (`"Intermediário 2"`), não código.
 */

/** Degraus estritamente ACIMA do atual, em ordem crescente de força. `[]` quando o atleta já
 *  está no topo (Open), não tem nível declarado nesse esporte, ou o valor não é reconhecido —
 *  nesses casos não há a partir de onde promover, e a ação some da tela (mesmo array decide
 *  as opções do seletor E o gating de visibilidade do botão). */
export function promotableLevelOptions(currentLevelCode: string | null | undefined): readonly LevelOption[] {
  const currentRank = levelRankOf(currentLevelCode);
  if (currentRank == null) return [];
  return LEVEL_OPTIONS.filter((option) => (levelRankOf(option.code) ?? -1) > currentRank);
}
