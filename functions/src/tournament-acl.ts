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
 * Uids que operam o torneio e devem ser avisados de pendências operacionais:
 * o dono (`managerId`) mais o staff `manager` ativo — exatamente quem
 * `assertCanManageTournament` autoriza a agir sobre uma inscrição.
 *
 * Admins por claim ficam de fora de propósito: são acesso de suporte, não
 * destinatários de aviso operacional de cada torneio da plataforma.
 */
export async function tournamentManagerUids(
  db: Firestore,
  tournamentId: string,
  tournamentData?: Record<string, unknown>,
): Promise<string[]> {
  const uids = new Set<string>();

  const data =
    tournamentData ?? (await db.doc(`tournaments/${tournamentId}`).get()).data();
  const managerId = data?.managerId;
  if (typeof managerId === "string" && managerId.trim()) {
    uids.add(managerId.trim());
  }

  const staffSnap = await db
    .collection(`tournaments/${tournamentId}/staff`)
    .where("status", "==", "active")
    .where("role", "==", "manager")
    .get();
  for (const doc of staffSnap.docs) {
    if (doc.id.trim()) uids.add(doc.id.trim());
  }

  return [...uids];
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
