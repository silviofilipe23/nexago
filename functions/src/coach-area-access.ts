/**
 * Autorização por área do portal do treinador para Cloud Functions — espelho
 * server-side de `coachCan` (`firestore.rules`), para as callables cujas
 * leituras/escritas nunca passam pelas rules (convite de atleta, convocação,
 * busca de atleta, visão de torneios) e que antes só aceitavam o dono
 * (`auth.uid` era o `coachUid`).
 *
 * Semântica (idêntica às rules, nesta ordem):
 *  1. Dono (`uid === coachUid`) — sempre, em toda área.
 *  2. Membro: existe `coaches/{coachUid}/staff/{uid}` E o cargo cobre a área no modo pedido.
 *  3. Qualquer outro caso — nega. Bypass de admin NÃO é concedido aqui.
 */
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {
  coachRoleCanRead,
  coachRoleCanWrite,
  isCoachStaffRole,
  type CoachArea,
} from "./coach-staff-roles";

export type CoachAreaAccessMode = "read" | "write";

export function decideCoachAreaAccess(
  coachUid: string,
  uid: string,
  staffData: {role?: unknown} | null,
  area: CoachArea,
  mode: CoachAreaAccessMode,
): boolean {
  if (coachUid !== "" && coachUid === uid) return true;
  if (!staffData) return false;
  const role = staffData.role;
  if (!isCoachStaffRole(role)) return false;
  return mode === "write" ? coachRoleCanWrite(role, area) : coachRoleCanRead(role, area);
}

/** Segmento de path do Firestore: não vazio e sem "/" (evita escapar para outro doc/coleção). */
export function assertSafeDocId(value: string, label: string): void {
  if (!value || value.includes("/")) {
    throw new HttpsError("invalid-argument", `${label} inválido.`);
  }
}

/** `coachUid` do payload (aparado) ou, se ausente/vazio/não-string, quem chama. */
export function resolveCoachUid(data: unknown, callerUid: string): string {
  const raw = (data as {coachUid?: unknown} | null | undefined)?.coachUid;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return callerUid;
  assertSafeDocId(trimmed, "coachUid");
  return trimmed;
}

export async function assertCoachAreaAccess(
  db: Firestore,
  uid: string,
  coachUid: string,
  area: CoachArea,
  mode: CoachAreaAccessMode,
): Promise<void> {
  let staffData: {role?: unknown} | null = null;
  if (coachUid !== uid) {
    const snap = await db.doc(`coaches/${coachUid}/staff/${uid}`).get();
    staffData = snap.exists ? (snap.data() ?? {}) : null;
  }
  if (!decideCoachAreaAccess(coachUid, uid, staffData, area, mode)) {
    throw new HttpsError(
      "permission-denied",
      "Você não tem acesso a esta área da comissão técnica.",
    );
  }
}
