/** Status canônico de partida (PascalCase, alinhado ao Flutter). */
export const MatchStatus = {
  scheduled: "Scheduled",
  inProgress: "In Progress",
  completed: "Completed",
  canceled: "Canceled",
} as const;

export type MatchStatusValue = (typeof MatchStatus)[keyof typeof MatchStatus];

/** Normaliza legado snake_case / lowercase para comparação. */
export function normalizeMatchStatusKey(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
}

export function isMatchCompleted(status: unknown): boolean {
  return normalizeMatchStatusKey(status) === "completed";
}

export function isMatchInProgress(status: unknown): boolean {
  return normalizeMatchStatusKey(status) === "in progress";
}

export function isMatchScheduled(status: unknown): boolean {
  return normalizeMatchStatusKey(status) === "scheduled";
}

export function isMatchCanceled(status: unknown): boolean {
  return normalizeMatchStatusKey(status) === "canceled";
}

/**
 * O vencedor precisa ser um dos dois lados da partida. Guarda contra
 * `winnerId` corrompido (id de torneio/categoria/time de outra chave), que de
 * outro modo passa calado e premia colocação a um time que não jogou.
 */
export function isWinnerInMatch(
  winnerId: unknown,
  teamAId: unknown,
  teamBId: unknown,
): boolean {
  const winner = String(winnerId ?? "").trim();
  if (!winner) return false;
  const sideA = String(teamAId ?? "").trim();
  const sideB = String(teamBId ?? "").trim();
  return winner === sideA || winner === sideB;
}

/**
 * Normaliza o tipo da partida: caixa baixa e `_` vira espaço, de modo que
 * "THIRD_PLACE" e "Third Place" caiam na mesma chave. Mora aqui (e não em
 * `league-ranking.ts`, de onde veio) porque `bracket-placement-tiers.ts`
 * também precisa dela — deixá-la lá criaria import circular.
 */
export function normalizeMatchType(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}

/**
 * Tipos de partida do King of the Court. Uma RODADA KOTC não é um duelo: são 3
 * a 5 duplas na mesma quadra, com uma tabela de pontos em vez de dois lados
 * (`docs/business-rules/king-of-court.md`).
 */
export const KocMatchType = {
  round: "koc_round",
  semifinal: "koc_semifinal",
  final: "koc_final",
} as const;

export type KocMatchTypeValue = (typeof KocMatchType)[keyof typeof KocMatchType];

/**
 * Rodada King of the Court.
 *
 * Testa o PREFIXO, não a lista fechada acima, para que um tipo KOTC novo
 * (repescagem, por exemplo) já nasça blindado nos consumidores de duelo em vez
 * de vazar até alguém lembrar de atualizar esta linha.
 */
export function isKingOfCourtMatch(matchType: unknown): boolean {
  // `normalizeMatchType` troca `_` por espaço, então o prefixo é "koc ".
  return normalizeMatchType(matchType).startsWith("koc ");
}

/**
 * Partida de duelo: dois lados (`teamAId` × `teamBId`) e um vencedor.
 *
 * É a guarda dos consumidores que assumem esse formato — rating, XP, avanço de
 * chave, palpites, ranking. Todos eles disparam por trigger na coleção
 * `matches`, que é COMPARTILHADA: no mesmo torneio convivem categorias de
 * grupos/mata-mata e categorias KOTC. Sem esta guarda, uma rodada KOTC
 * concluída cai em código que lê dois lados que ela não tem.
 */
export function isDuelMatch(matchType: unknown): boolean {
  return !isKingOfCourtMatch(matchType);
}
