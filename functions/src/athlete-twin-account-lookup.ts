/**
 * Achar a conta gêmea pelo WhatsApp ANTES de ela virar inscrição duplicada:
 * no fim do cadastro, o app pergunta se o número já está em outra conta e
 * oferece entrar nela.
 *
 * `userPhoneKeys/{uid}` é o índice (só servidor, sem acesso pelo cliente):
 * o `phoneNumber` de `users` é digitado com máscaras diferentes em cada
 * superfície e não dá para consultar por igualdade. A trava da inscrição
 * (`assertNoTwinAccountInCategory`) NÃO usa o índice — compara os inscritos
 * da categoria direto — e por isso vale mesmo antes do backfill.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth, type Auth} from "firebase-admin/auth";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  athleteFingerprint,
  birthDayKey,
  isSameAthlete,
  maskEmail,
  phoneIdentityKey,
} from "./athlete-twin-accounts";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export const USER_PHONE_KEYS_COLLECTION = "userPhoneKeys";

/** Mantém o índice em dia; só escreve quando a chave muda. */
export async function syncUserPhoneKey(params: {
  db: Firestore;
  uid: string;
  before: Record<string, unknown> | undefined;
  after: Record<string, unknown> | undefined;
}): Promise<void> {
  const {db, uid, before, after} = params;
  const previous = phoneIdentityKey(before?.phoneNumber);
  const next = phoneIdentityKey(after?.phoneNumber);
  if (previous === next) return;
  const ref = db.doc(`${USER_PHONE_KEYS_COLLECTION}/${uid}`);
  if (!next) {
    await ref.delete();
    return;
  }
  await ref.set({phoneKey: next, updatedAt: FieldValue.serverTimestamp()});
}

/** Como a outra conta entra — é o que a pessoa precisa para achar a conta certa. */
export function signInMethodLabel(providerIds: string[]): string {
  if (providerIds.includes("google.com")) return "Google";
  if (providerIds.includes("apple.com")) return "Apple";
  if (providerIds.includes("password")) return "e-mail e senha";
  return "";
}

export interface PhoneInOtherAccountResult {
  inOtherAccount: boolean;
  /** `jo•••@gmail.com`; vazio quando a conta não tem e-mail. */
  maskedEmail: string;
  /** "Google" | "Apple" | "e-mail e senha" | "". */
  signInMethod: string;
}

const NOT_FOUND: PhoneInOtherAccountResult = {
  inOtherAccount: false,
  maskedEmail: "",
  signInMethod: "",
};

/** Quantas contas com o mesmo número valem a leitura (família grande, no máximo). */
const MAX_CANDIDATES = 10;

export async function findPhoneInOtherAccount(params: {
  db: Firestore;
  auth: Auth;
  uid: string;
  phoneNumber: unknown;
  birthDate: unknown;
}): Promise<PhoneInOtherAccountResult> {
  const {db, auth, uid} = params;
  const mine = {
    phoneKey: phoneIdentityKey(params.phoneNumber),
    birthDay: birthDayKey(params.birthDate),
  };
  if (!mine.phoneKey) return NOT_FOUND;

  const snap = await db
    .collection(USER_PHONE_KEYS_COLLECTION)
    .where("phoneKey", "==", mine.phoneKey)
    .limit(MAX_CANDIDATES)
    .get();

  for (const doc of snap.docs) {
    if (doc.id === uid) continue;
    const userSnap = await db.doc(`users/${doc.id}`).get();
    if (!userSnap.exists) continue;
    const userData = userSnap.data() ?? {};
    if (!isSameAthlete(mine, athleteFingerprint(userData))) continue;

    // Conta apagada no Auth com o doc ainda de pé não é conta para onde voltar.
    const record = await auth.getUser(doc.id).catch(() => null);
    if (!record) continue;
    return {
      inOtherAccount: true,
      maskedEmail: maskEmail(userData.email) || maskEmail(record.email),
      signInMethod: signInMethodLabel(record.providerData.map((p) => p.providerId)),
    };
  }
  return NOT_FOUND;
}

/**
 * `{phoneNumber, birthDate?}` → a outra conta com o mesmo WhatsApp, mascarada.
 *
 * Só para quem está logado e devolve só a dica (e-mail mascarado e o jeito de
 * entrar): é o que a pessoa precisa para voltar à própria conta, sem virar
 * consulta de quem é dono de qual número.
 */
export const checkPhoneInOtherAccount = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request): Promise<PhoneInOtherAccountResult> => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  const result = await findPhoneInOtherAccount({
    db: getFirestore(),
    auth: getAuth(),
    uid,
    phoneNumber: request.data?.phoneNumber,
    birthDate: request.data?.birthDate,
  });
  if (result.inOtherAccount) {
    logger.info("Phone already used by another account", {uid});
  }
  return result;
});
