export interface CancellationInscription {
  isPaid?: boolean;
  waitlist?: boolean;
  teamId?: unknown;
}

/** Verdadeiro para inscrição que efetivamente pagou (fora da fila de espera). */
function isPaidRegistration(i: CancellationInscription): boolean {
  return i.isPaid === true && i.waitlist !== true;
}

/** Conta inscrições que efetivamente pagaram (fora da fila de espera). */
export function countPaidRegistrations(
  inscriptions: CancellationInscription[],
): number {
  return inscriptions.filter(isPaidRegistration).length;
}

/**
 * IDs de times únicos das inscrições pagas — destinatários da notificação de
 * cancelamento (depois resolvidos para os uids dos atletas).
 */
export function paidTeamIdsForCancellation(
  inscriptions: CancellationInscription[],
): string[] {
  const ids = new Set<string>();
  for (const i of inscriptions) {
    if (!isPaidRegistration(i)) continue;
    const teamId = typeof i.teamId === "string" ? i.teamId.trim() : "";
    if (teamId) ids.add(teamId);
  }
  return [...ids];
}

/**
 * Cancelar um torneio com inscrições pagas exige confirmação explícita
 * (`force`), porque o organizador precisa reembolsar manualmente — não há
 * estorno automático nesta versão. Sem pagamentos, cancela direto.
 */
export function canCancelTournament(
  {paidCount, force}: {paidCount: number; force: boolean},
): boolean {
  return paidCount === 0 || force === true;
}
