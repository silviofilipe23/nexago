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
 * Garante que `organizer` está entre os papéis do usuário, preservando os que
 * já existiam (ex.: já é atleta) — nunca reduz acesso. `organizer` já existe
 * em ALLOWED_APP_ROLES (gestor de torneios, hoje usado pelo backoffice); este
 * autocadastro só dá a esse papel um portal web dedicado, não cria papel novo.
 */
export function withOrganizerRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("organizer") ? existingRoles : [...existingRoles, "organizer"];
}

/**
 * Chamada uma vez pelo client logo após `createUserWithEmailAndPassword` no
 * autocadastro do portal organizador. Define a claim `organizer` (via Admin
 * SDK — nunca client-write direto) e mirra o papel em `users/{uid}`, de onde
 * o login do portal organizador confere a role. Sem coleção de perfil nova
 * (`organizers/{uid}`) — fora do escopo desta entrega (só auth).
 */
export const completeOrganizerSignup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const displayName = (request.data?.displayName as string | undefined)?.trim() ?? "";
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Nome é obrigatório.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withOrganizerRole(existingRoles);

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

  logger.info("Organizer signup completed", {uid});
  return {ok: true};
});
