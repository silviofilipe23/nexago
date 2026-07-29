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
