import {getAuth} from "firebase-admin/auth";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {hasRoleInClaims} from "./auth-roles";

/**
 * Verifica se o usuário pode operar o torneio (owner, staff manager ou admin).
 * Não concede acesso global pelo claim `organizer`.
 */
export async function assertCanManageTournament(
  db: Firestore,
  uid: string,
  tournamentId: string,
): Promise<Record<string, unknown>> {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  const data = snap.data()!;
  const managerId = data.managerId as string | undefined;
  if (managerId === uid) return data;

  const user = await getAuth().getUser(uid);
  const claims = user.customClaims ?? {};
  if (hasRoleInClaims(claims, "admin") || claims["superAdmin"] === true) {
    return data;
  }

  const staffSnap = await db
    .doc(`tournaments/${tournamentId}/staff/${uid}`)
    .get();
  if (
    staffSnap.exists &&
    staffSnap.data()?.status === "active" &&
    staffSnap.data()?.role === "manager"
  ) {
    return data;
  }

  throw new HttpsError("permission-denied", "Sem permissão para este torneio");
}

/**
 * Verifica se o usuário pode lançar placar (owner, staff manager/scorer ou admin).
 */
export async function assertCanScoreTournament(
  db: Firestore,
  uid: string,
  tournamentId: string,
): Promise<Record<string, unknown>> {
  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado");
  }
  const data = snap.data()!;
  const managerId = data.managerId as string | undefined;
  if (managerId === uid) return data;

  const user = await getAuth().getUser(uid);
  const claims = user.customClaims ?? {};
  if (hasRoleInClaims(claims, "admin") || claims["superAdmin"] === true) {
    return data;
  }

  const staffSnap = await db
    .doc(`tournaments/${tournamentId}/staff/${uid}`)
    .get();
  const staffRole = staffSnap.data()?.role as string | undefined;
  if (
    staffSnap.exists &&
    staffSnap.data()?.status === "active" &&
    (staffRole === "manager" || staffRole === "scorer")
  ) {
    return data;
  }

  throw new HttpsError("permission-denied", "Sem permissão para este torneio");
}
