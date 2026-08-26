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
 * Garante que `arena` está entre os papéis do usuário, preservando os que já
 * existiam — nunca reduz acesso.
 */
export function withArenaRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("arena") ? existingRoles : [...existingRoles, "arena"];
}

/**
 * Chamada uma vez pelo client logo após `createUserWithEmailAndPassword` no
 * autocadastro do portal arena. Define a claim `arena` (via Admin SDK — nunca
 * client-write direto, ver firestore.rules em users/{userId}) e mirra o papel
 * em `users/{uid}`, de onde o login do portal arena confere a role.
 */
export const completeArenaSignup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const arenaName = (request.data?.arenaName as string | undefined)?.trim() ?? "";
  if (!arenaName) {
    throw new HttpsError("invalid-argument", "Nome da arena é obrigatório.");
  }

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      // Token ainda válido (JWT não expirou) mas a conta foi apagada depois
      // que o cliente o obteve — sessão órfã, não um erro interno real.
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withArenaRole(existingRoles);

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
      displayName: arenaName,
      fullName: arenaName,
      ...firestoreRolesPayload(nextRoles),
    },
    {merge: true},
  );

  logger.info("Arena signup completed", {uid});
  return {ok: true};
});
