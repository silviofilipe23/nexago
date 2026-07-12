import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export interface AthleteSearchResult {
  uid: string;
  displayName: string;
  initials: string;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "·";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Busca um atleta por e-mail pra convite do treinador (ver nota de design no
 * plano sobre por que não é telefone-ou-e-mail). Nunca expõe telefone/e-mail
 * de volta ao caller — só uid/displayName/initials.
 */
export const searchAthleteForCoachInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const email = (request.data?.email as string | undefined)?.trim().toLowerCase() ?? "";
  if (!email) {
    throw new HttpsError("invalid-argument", "Informe o e-mail do atleta.");
  }

  const db = getFirestore();
  const coachSnap = await db.doc(`coaches/${uid}`).get();
  if (!coachSnap.exists) {
    throw new HttpsError("permission-denied", "Apenas treinadores podem buscar atletas.");
  }

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found") {
      return {result: null};
    }
    throw err;
  }

  if (user.uid === uid) {
    throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
  }

  const displayName = user.displayName?.trim() || email;
  const result: AthleteSearchResult = {
    uid: user.uid,
    displayName,
    initials: initialsFromName(displayName),
  };

  logger.info("Coach searched for athlete", {coachUid: uid, foundUid: user.uid});
  return {result};
});
