import type { CenterBilling } from '../../domain/models';

/** Campos que mudaram (para o botão salvar e a auditoria). */
export function changedBilling(before: CenterBilling, next: CenterBilling): (keyof CenterBilling)[] {
  return (Object.keys(next) as (keyof CenterBilling)[]).filter((k) => before[k] !== next[k]);
}

/** Mesmos limites que o servidor aceita (`readBilling`); fora deles ele volta ao padrão. */
export function billingError(b: CenterBilling): string | null {
  if (b.billingDayMode === 'fixed' && !(Number.isInteger(b.billingDay) && b.billingDay >= 1 && b.billingDay <= 28)) {
    return 'O dia de vencimento vai de 1 a 28 (para existir em todo mês).';
  }
  if (!(Number.isInteger(b.suspendAfterDays) && b.suspendAfterDays >= 0 && b.suspendAfterDays <= 180)) {
    return 'Os dias até suspender vão de 0 (nunca) a 180.';
  }
  if (b.suspendAfterDays > 0 && b.blockAfterDays > 0 && b.suspendAfterDays <= b.blockAfterDays) {
    return 'A suspensão precisa vir depois do bloqueio do check-in.';
  }
  return null;
}
