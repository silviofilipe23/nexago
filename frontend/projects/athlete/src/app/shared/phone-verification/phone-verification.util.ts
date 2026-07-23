/** Mesma regra de formato usada no onboarding (`isValidWhatsApp` em
 *  athlete-onboarding.component.ts) — mantida duplicada de propósito, sem
 *  extrair lib compartilhada (fora de escopo desta feature). */
export function isValidPhoneNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) return true;
  return digits.length >= 12 && digits.length <= 13 && digits.startsWith('55');
}

/** Converte um telefone BR em qualquer formatação aceita por `isValidPhoneNumber`
 *  para E.164 (`+55DDD9XXXXXXXX`), exigido pelo Firebase Phone Auth. */
export function toE164BR(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`;
  }
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    return `+${digits}`;
  }
  return null;
}

/** Firebase rejeita `linkWithPhoneNumber` com `auth/provider-already-linked`
 *  quando a conta já tem uma credencial de telefone — nesse caso o caminho
 *  certo pra trocar de número é `verifyPhoneNumber` + `updatePhoneNumber`. */
export function phoneLinkMethod(providerIds: readonly string[]): 'link' | 'update' {
  return providerIds.includes('phone') ? 'update' : 'link';
}
