/** Valor persistido em `inscriptions.paidAmount` na confirmação manual. */
export function organizerDirectConfirmPaidAmount(entryFeeReais: number): number | null {
  if (!Number.isFinite(entryFeeReais) || entryFeeReais <= 0) return null;
  return entryFeeReais;
}

export const ORGANIZER_DIRECT_PAYMENT_METHOD = "organizer_direct";
