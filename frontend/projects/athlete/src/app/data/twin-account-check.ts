import { httpsCallable, type Functions } from 'firebase/functions';

/** A outra conta que já usa o WhatsApp digitado no cadastro, mascarada. */
export interface PhoneInOtherAccount {
  /** `jo•••@gmail.com`; vazio quando a conta não tem e-mail. */
  maskedEmail: string;
  /** "Google", "Apple", "e-mail e senha" ou vazio. */
  signInMethod: string;
}

interface CheckPhoneResult extends PhoneInOtherAccount {
  inOtherAccount: boolean;
}

/** Teto da consulta: ela é um aviso, não mais um elo lento no "Concluir cadastro". */
export const TWIN_ACCOUNT_CHECK_TIMEOUT_MS = 4000;

/** "Google · jo•••@gmail.com" — o que a pessoa precisa para achar a conta. */
export function twinAccountHint(other: PhoneInOtherAccount): string {
  return [other.signInMethod, other.maskedEmail].filter((part) => part.length > 0).join(' · ');
}

/** Consulta `checkPhoneInOtherAccount` (mesma pessoa com duas contas).
 *  Best-effort: sem rede, sem a callable publicada ou com erro, devolve `null`
 *  e o cadastro segue como se não houvesse outra conta. */
export async function findPhoneInOtherAccount(
  functions: Functions,
  params: { phoneNumber: string; birthDate: string },
): Promise<PhoneInOtherAccount | null> {
  try {
    const call = httpsCallable<typeof params, CheckPhoneResult>(functions, 'checkPhoneInOtherAccount', {
      timeout: TWIN_ACCOUNT_CHECK_TIMEOUT_MS,
    });
    const { data } = await call(params);
    if (data?.inOtherAccount !== true) return null;
    return { maskedEmail: data.maskedEmail ?? '', signInMethod: data.signInMethod ?? '' };
  } catch {
    return null;
  }
}
