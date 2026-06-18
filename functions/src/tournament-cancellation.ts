export interface CancellationInscription {
  isPaid?: boolean;
  waitlist?: boolean;
}

/** Conta inscrições que efetivamente pagaram (fora da fila de espera). */
export function countPaidRegistrations(
  inscriptions: CancellationInscription[],
): number {
  return inscriptions.filter(
    (i) => i.isPaid === true && i.waitlist !== true,
  ).length;
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
