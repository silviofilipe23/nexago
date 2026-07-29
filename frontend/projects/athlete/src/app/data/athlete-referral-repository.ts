import { httpsCallable, type Functions } from 'firebase/functions';

/** Programa de indicação (referral) — código de indicação = o próprio UID do atleta
 *  (não existe handle/username curto reaproveitável no projeto, mesma decisão do app
 *  mobile — ver `functions/src/athlete-referral.ts` e `athlete_referral_service.dart`). */
export type ReferralRegistrationRejection =
  | 'MISSING_CODE'
  | 'SELF_REFERRAL'
  | 'REFERRER_NOT_FOUND'
  | 'ALREADY_SET';

export interface ReferralRegistrationResult {
  applied: boolean;
  rejection: ReferralRegistrationRejection | null;
}

/** XP creditado ao indicador quando o indicado conclui a 1ª partida — espelha
 *  `XP_REFERRAL_BONUS` em `functions/src/athlete-referral.ts`. Crédito 100% automático
 *  via trigger server-side; o client só registra o vínculo `referredBy`. */
export const XP_REFERRAL_BONUS = 50;

/** Código de indicação do próprio atleta — hoje é literalmente o UID. */
export function referralCodeFor(uid: string): string {
  return uid.trim();
}

/** Registra a indicação recebida (`users/{uid}.referredBy`), via callable `registerReferral`.
 *  Idempotente no backend: repetir a chamada depois de já setado não sobrescreve, só retorna
 *  `applied: false` com `rejection: 'ALREADY_SET'`. */
export async function registerReferral(
  functions: Functions,
  referralCode: string,
): Promise<ReferralRegistrationResult> {
  const call = httpsCallable<{ referralCode: string }, ReferralRegistrationResult>(
    functions,
    'registerReferral',
  );
  const result = await call({ referralCode: referralCode.trim() });
  return result.data;
}
