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
