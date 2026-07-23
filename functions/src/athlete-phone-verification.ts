import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

/**
 * O número só existe em `UserRecord.phoneNumber` (Admin SDK) se o client
 * completou de fato o fluxo de SMS do Firebase Phone Auth — nunca vem do
 * payload do caller, então essa checagem é suficiente contra spoof.
 */
export function assertVerifiedPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) {
    throw new HttpsError(
      "failed-precondition",
      "Nenhum telefone verificado encontrado para esta conta.",
    );
  }
  return phoneNumber;
}

/**
 * Chamada pelo client logo após `linkWithPhoneNumber`/`updatePhoneNumber`
 * confirmarem o código SMS. Copia o telefone já verificado pelo Firebase
 * Auth para `users/{uid}` via Admin SDK — o client nunca escreve
 * `phoneNumber`/`phoneVerified`/`phoneVerifiedAt` diretamente, ver
 * firestore.rules em users/{userId}.
 */
export const confirmPhoneVerification = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const user = await getAuth().getUser(uid);
  const phoneNumber = assertVerifiedPhoneNumber(user.phoneNumber);

  await getFirestore().doc(`users/${uid}`).set(
    {
      phoneNumber,
      phoneVerified: true,
      phoneVerifiedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  logger.info("Athlete phone verified", {uid});
  return {ok: true, phoneNumber};
});
