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

/** Formata dígitos digitados como celular/fixo BR: `(00) 00000-0000` (celular, 9 dígitos
 *  depois do DDD) ou `(00) 0000-0000` (fixo, ainda digitando) — puramente visual, mesma
 *  lógica do `BrPhoneInputFormatter` do Flutter (`onboarding_input_formatters.dart`),
 *  portada pra manter paridade entre os dois clientes. Não valida DDD/9 — isso é
 *  `validatePhone`, em `onboarding-validators.ts`. */
export function formatBrPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length > 11) digits = digits.slice(0, 11);

  const ddd = digits.length >= 2 ? digits.slice(0, 2) : digits;
  let result = `(${ddd}`;
  if (digits.length >= 2) result += ') ';
  if (digits.length <= 2) return result;

  const rest = digits.slice(2);
  const splitAt = rest.startsWith('9') ? 5 : 4;
  if (rest.length <= splitAt) return result + rest;

  const suffixEnd = Math.min(Math.max(rest.length, splitAt), splitAt + 4);
  return result + rest.slice(0, splitAt) + '-' + rest.slice(splitAt, suffixEnd);
}
