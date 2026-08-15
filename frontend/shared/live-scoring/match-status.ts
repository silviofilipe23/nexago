/** Status normalizado — espelha `MatchStatus` (`functions/src/match-status.ts`: "Scheduled"/
 *  "In Progress"/"Completed"/"Canceled") em snake_case pro template Angular. Vive aqui, e não
 *  no repositório de partidas de cada portal, porque a mesa ao vivo é a mesma nos dois. */
export type MatchDisplayStatus = 'scheduled' | 'in_progress' | 'completed' | 'canceled';

export function statusOf(raw: unknown): MatchDisplayStatus {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  if (v === 'in progress') return 'in_progress';
  if (v === 'completed') return 'completed';
  if (v === 'canceled' || v === 'cancelled') return 'canceled';
  return 'scheduled';
}
