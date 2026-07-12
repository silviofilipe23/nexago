import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";

/**
 * Garante que `coach` está entre os papéis do usuário, preservando os que já
 * existiam (ex.: já é atleta) — nunca reduz acesso.
 */
export function withCoachRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("coach") ? existingRoles : [...existingRoles, "coach"];
}

/**
 * Chamada uma vez pelo client logo após `createUserWithEmailAndPassword` no
 * autocadastro do treinador. Define a claim `coach` (via Admin SDK — nunca
 * client-write direto) e cria o perfil em `coaches/{uid}`.
 */
export const completeCoachSignup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const displayName = (request.data?.displayName as string | undefined)?.trim() ?? "";
  const phone = (request.data?.phone as string | undefined)?.trim() ?? "";
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Nome é obrigatório.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withCoachRole(existingRoles);

  const nextClaims = applyRolesToClaims(
    (user.customClaims || {}) as Record<string, unknown>,
    nextRoles,
  );
  await auth.setCustomUserClaims(uid, nextClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set(
    {
      uid,
      email: user.email ?? "",
      displayName,
      ...firestoreRolesPayload(nextRoles),
    },
    {merge: true},
  );

  await db.doc(`coaches/${uid}`).set(
    {
      displayName,
      ...(phone ? {phone} : {}),
      createdAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  logger.info("Coach signup completed", {uid});
  return {ok: true};
});
