import { httpsCallable, type Functions } from 'firebase/functions';

export interface ConfirmPhoneVerificationResult {
  ok: boolean;
  phoneNumber: string;
}

/** Confirma no backend o telefone que o Firebase Phone Auth acabou de validar
 *  por SMS (`linkWithPhoneNumber`/`updatePhoneNumber`) — grava
 *  `phoneNumber`/`phoneVerified`/`phoneVerifiedAt` em `users/{uid}` via Admin
 *  SDK (o client não escreve esses campos direto, ver firestore.rules). */
export async function confirmPhoneVerification(
  functions: Functions,
): Promise<ConfirmPhoneVerificationResult> {
  const call = httpsCallable<undefined, ConfirmPhoneVerificationResult>(
    functions,
    'confirmPhoneVerification',
  );
  const result = await call();
  return result.data;
}
