import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  rolesFromClaims,
  callerIsOrganizer,
  callerIsSuperAdmin,
  uniqueSortedRoles,
  applyRolesToClaims,
  firestoreRolesPayload,
  isAllowedRole,
} from "./auth-roles";

/**
 * Substitui todos os papéis do usuário por um único papel (compatível com clients antigos).
 * Grava claim `roles: [role]` e campo legado `role`.
 */
export const setUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }

  if (typeof role !== "string" || !isAllowedRole(role)) {
    throw new HttpsError("invalid-argument", "Role inválido. Use 'admin', 'organizer', 'athlete' ou 'arena'");
  }

  const roleTyped = role as AppRole;
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isCallerAdmin = callerIsOrganizer(callerUser);
  const isCallerSuperAdmin = callerIsSuperAdmin(callerUser);
  const isSelf = callerUid === uid;

  if (isSelf && !isCallerAdmin && roleTyped !== "athlete") {
    throw new HttpsError("permission-denied", "Permissão negada: não é permitido promover a própria conta");
  }

  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem definir roles de outros usuários");
  }

  if (!isSelf && (roleTyped === "admin" || roleTyped === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode cadastrar ou promover usuários a organizador (admin) ou gestor de arena (arena).");
  }
  if (!isSelf && roleTyped === "organizer" && !isCallerAdmin && !isCallerSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o administrador da plataforma ou o super administrador pode atribuir o papel de gestor de torneios (organizer).",
    );
  }

  try {
    const targetUser = await auth.getUser(uid);
    const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
    const claims = applyRolesToClaims(currentClaims, [roleTyped]);

    await auth.setCustomUserClaims(uid, claims);

    const db = getFirestore();
    const fp = firestoreRolesPayload([roleTyped]);
    await db.doc(`users/${uid}`).set(fp, {merge: true});

    logger.info(`Papéis definidos para ${uid}: ${JSON.stringify(uniqueSortedRoles([roleTyped]))} (setUserRole)`);

    return {success: true, role: roleTyped, roles: uniqueSortedRoles([roleTyped])};
  } catch (error) {
    logger.error("Erro ao definir role:", error);
    throw new HttpsError("internal", "Erro ao definir role do usuário");
  }
});

/**
 * Acrescenta um papel ao usuário (união com os existentes).
 */
export const addUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof role !== "string" || !isAllowedRole(role)) {
    throw new HttpsError("invalid-argument", "Role inválido. Use 'admin', 'organizer', 'athlete' ou 'arena'");
  }

  const roleTyped = role as AppRole;
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isCallerAdmin = callerIsOrganizer(callerUser);
  const isCallerSuperAdmin = callerIsSuperAdmin(callerUser);
  const isSelf = callerUid === uid;

  if (isSelf && !isCallerAdmin && roleTyped !== "athlete") {
    throw new HttpsError("permission-denied", "Permissão negada: não é permitido promover a própria conta");
  }
  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem alterar roles de outros usuários");
  }
  if (!isSelf && (roleTyped === "admin" || roleTyped === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode atribuir organizador ou gestor de arena a terceiros.");
  }
  if (!isSelf && roleTyped === "organizer" && !isCallerAdmin && !isCallerSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Apenas o administrador da plataforma ou o super administrador pode atribuir o papel de gestor de torneios (organizer).",
    );
  }

  const targetUser = await auth.getUser(uid);
  const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
  const existing = rolesFromClaims(currentClaims);

  if (existing.includes(roleTyped)) {
    const fp = firestoreRolesPayload(existing);
    await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
    return {success: true, roles: existing, alreadyHad: true as const};
  }

  const next = uniqueSortedRoles([...existing, roleTyped]);
  const claims = applyRolesToClaims(currentClaims, next);
  await auth.setCustomUserClaims(uid, claims);
  const fp = firestoreRolesPayload(next);
  await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
  logger.info(`Papel ${roleTyped} adicionado a ${uid}: ${JSON.stringify(next)}`);
  return {success: true, roles: next};
});

/**
 * Remove um papel do usuário. Deve permanecer ao menos um papel.
 */
export const removeUserRole = onCall(async (request) => {
  const {uid, role} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (typeof role !== "string" || !isAllowedRole(role)) {
    throw new HttpsError("invalid-argument", "Role inválido");
  }

  const roleTyped = role as AppRole;
  const auth = getAuth();
  const callerUser = await auth.getUser(callerUid);
  const isCallerAdmin = callerIsOrganizer(callerUser);
  const isCallerSuperAdmin = callerIsSuperAdmin(callerUser);
  const isSelf = callerUid === uid;

  const targetUser = await auth.getUser(uid);
  const existing = rolesFromClaims(targetUser.customClaims);

  if (!existing.includes(roleTyped)) {
    const fp = firestoreRolesPayload(existing);
    await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
    return {success: true, roles: existing, wasAbsent: true as const};
  }

  if (existing.length <= 1) {
    throw new HttpsError("failed-precondition", "O usuário deve manter ao menos um papel.");
  }

  if (isSelf && (roleTyped === "admin" || roleTyped === "arena" || roleTyped === "organizer")) {
    throw new HttpsError(
      "permission-denied",
      "Para remover este papel da própria conta, chame um administrador da plataforma ou super administrador.",
    );
  }
  if (!isSelf && !isCallerAdmin) {
    throw new HttpsError("permission-denied", "Permissão negada: apenas admins podem alterar roles de outros usuários");
  }
  if (!isSelf && (roleTyped === "admin" || roleTyped === "arena") && !isCallerSuperAdmin) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode remover o papel de organizador ou gestor de arena.");
  }
  if (!isSelf && roleTyped === "organizer" && !isCallerAdmin && !isCallerSuperAdmin) {
    throw new HttpsError(
      "permission-denied",
      "Apenas um administrador da plataforma ou o super administrador pode remover o papel de gestor de torneios.",
    );
  }

  const next = existing.filter((r) => r !== roleTyped);
  const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
  const claims = applyRolesToClaims(currentClaims, next);
  await auth.setCustomUserClaims(uid, claims);
  const fp = firestoreRolesPayload(next);
  await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
  logger.info(`Papel ${roleTyped} removido de ${uid}: ${JSON.stringify(next)}`);
  return {success: true, roles: next};
});

/**
 * Define a lista completa de papéis. Apenas super administrador.
 */
export const setUserRoles = onCall(async (request) => {
  const {uid, roles: rolesIn} = request.data || {};
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  if (!callerIsSuperAdmin(await getAuth().getUser(callerUid))) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode definir a lista completa de papéis.");
  }
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UID inválido");
  }
  if (!Array.isArray(rolesIn)) {
    throw new HttpsError("invalid-argument", "roles deve ser um array de strings");
  }

  const next = uniqueSortedRoles(rolesIn.filter((x: unknown): x is string => typeof x === "string"));
  if (next.length === 0) {
    throw new HttpsError("invalid-argument", "Informe ao menos um papel válido");
  }

  const auth = getAuth();
  const targetUser = await auth.getUser(uid);
  const currentClaims = (targetUser.customClaims || {}) as Record<string, unknown>;
  const claims = applyRolesToClaims(currentClaims, next);
  await auth.setCustomUserClaims(uid, claims);
  const fp = firestoreRolesPayload(next);
  await getFirestore().doc(`users/${uid}`).set(fp, {merge: true});
  logger.info(`setUserRoles ${uid}: ${JSON.stringify(next)}`);
  return {success: true, roles: next};
});

/**
 * Migração única: preenche claim `roles` e Firestore a partir do claim `role` legado.
 * Apenas super administrador. Idempotente para usuários que já têm `roles`.
 */
export const migrateUsersToMultiRole = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado");
  }
  const callerUser = await getAuth().getUser(callerUid);
  if (!callerIsSuperAdmin(callerUser)) {
    throw new HttpsError("permission-denied", "Apenas o super administrador pode executar a migração.");
  }

  const auth = getAuth();
  const db = getFirestore();
  let updatedAuth = 0;
  let updatedFirestore = 0;
  let nextPageToken: string | undefined;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    for (const u of listResult.users) {
      const claims = (u.customClaims || {}) as Record<string, unknown>;

      if (Array.isArray(claims["roles"]) && (claims["roles"] as unknown[]).length > 0) {
        continue;
      }

      const existingRoles = rolesFromClaims(claims);
      const legacy = claims["role"];
      const sourceRoles: AppRole[] =
        existingRoles.length > 0 ?
          existingRoles :
          (typeof legacy === "string" && isAllowedRole(legacy) ? [legacy as AppRole] : []);

      if (sourceRoles.length === 0) {
        continue;
      }

      const nextClaims = applyRolesToClaims(claims, sourceRoles);
      await auth.setCustomUserClaims(u.uid, nextClaims);
      updatedAuth += 1;

      const userDoc = await db.doc(`users/${u.uid}`).get();
      const data = userDoc.data();
      const docRoles = data?.roles;
      if (!userDoc.exists || !Array.isArray(docRoles) || docRoles.length === 0) {
        await db.doc(`users/${u.uid}`).set(firestoreRolesPayload(sourceRoles), {merge: true});
        updatedFirestore += 1;
      }
    }
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  logger.info(`migrateUsersToMultiRole: auth=${updatedAuth} firestoreDocs=${updatedFirestore}`);
  return {success: true, updatedAuth, updatedFirestore};
});
