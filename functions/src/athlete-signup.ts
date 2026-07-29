import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";

/**
 * Garante que `athlete` está entre os papéis do usuário, preservando os que já
 * existiam — nunca reduz acesso.
 */
export function withAthleteRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("athlete") ? existingRoles : [...existingRoles, "athlete"];
}

/**
 * Chamada pelo onboarding de atleta (web e app), antes do primeiro save de
 * perfil. Define a claim `athlete` (via Admin SDK — nunca client-write
 * direto, ver firestore.rules em users/{userId}) e mirra o papel em
 * `users/{uid}`, de onde o resto do app confere o papel. Idempotente: contas
 * que já têm `athlete` não são alteradas; contas de outro portal (arena,
 * organizer) ganham o papel adicional sem perder o que já tinham — mesmo
 * padrão de `completeArenaSignup` em arena-signup.ts.
 */
export const grantAthleteRole = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withAthleteRole(existingRoles);

  const nextClaims = applyRolesToClaims(
    (user.customClaims || {}) as Record<string, unknown>,
    nextRoles,
  );
  await auth.setCustomUserClaims(uid, nextClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set(firestoreRolesPayload(nextRoles), {merge: true});

  logger.info("Athlete role granted", {uid});
  return {ok: true, roles: nextRoles};
});
