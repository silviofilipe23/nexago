/**
 * Garante uma única dupla com mesmos integrantes por categoria.
 * Par normalizado: UIDs ordenados (A,B) ≡ (B,A).
 */

import {HttpsError} from "firebase-functions/v2/https";
import type {
  CollectionReference,
  Transaction,
} from "firebase-admin/firestore";

export type RegistrationConflictRole = "inviter" | "invitee" | "pair";

export type RegistrationConflict = {
  role: RegistrationConflictRole;
  message: string;
};

/** Chave canônica do par — independente da ordem dos UIDs. */
export function buildPairKey(uidA: string, uidB: string): string {
  const a = uidA.trim();
  const b = uidB.trim();
  if (!a || !b || a === b) return "";
  return [a, b].sort().join(":");
}

export type ParsedCategoryRegistration = {
  registrationId: string;
  participantUids: string[];
  partnerPending: boolean;
  pairKey: string | null;
  isComplete: boolean;
};

/** Extrai membros e par da inscrição (com ou sem doc de equipe). */
export function parseCategoryRegistration(
  registrationId: string,
  registration: Record<string, unknown>,
  team?: Record<string, unknown> | null,
): ParsedCategoryRegistration {
  const partnerPending = registration.partnerPending === true;
  const participantUids = extractParticipantUids(registration, team);
  const pairKey = derivePairKey(participantUids, partnerPending, team);
  const isComplete = isCompleteRegistration(participantUids, partnerPending, team);
  return {
    registrationId,
    participantUids,
    partnerPending,
    pairKey,
    isComplete,
  };
}

function extractParticipantUids(
  registration: Record<string, unknown>,
  team?: Record<string, unknown> | null,
): string[] {
  const fromField = Array.isArray(registration.participantUids)
    ? (registration.participantUids as unknown[])
        .map((p) => String(p).trim())
        .filter((p) => p.length > 0)
    : [];

  if (fromField.length > 0) return [...new Set(fromField)];

  const player1Id =
    (typeof team?.player1Id === "string" ? team.player1Id.trim() : "") ||
    (typeof registration.player1Id === "string"
      ? registration.player1Id.trim()
      : "");
  const player2Id =
    typeof team?.player2Id === "string" ? team.player2Id.trim() : "";

  const uids: string[] = [];
  if (player1Id) uids.push(player1Id);
  if (player2Id) uids.push(player2Id);
  return uids;
}

function derivePairKey(
  participantUids: string[],
  partnerPending: boolean,
  team?: Record<string, unknown> | null,
): string | null {
  if (participantUids.length >= 2) {
    return buildPairKey(participantUids[0], participantUids[1]);
  }
  if (partnerPending) return null;
  const p1 = typeof team?.player1Id === "string" ? team.player1Id.trim() : "";
  const p2 = typeof team?.player2Id === "string" ? team.player2Id.trim() : "";
  if (p1 && p2) return buildPairKey(p1, p2);
  return null;
}

function isCompleteRegistration(
  participantUids: string[],
  partnerPending: boolean,
  team?: Record<string, unknown> | null,
): boolean {
  if (partnerPending) return false;
  if (participantUids.length >= 2) return true;
  const p1 = typeof team?.player1Id === "string" ? team.player1Id.trim() : "";
  const p2 = typeof team?.player2Id === "string" ? team.player2Id.trim() : "";
  return p1.length > 0 && p2.length > 0;
}

function memberMessage(role: RegistrationConflictRole): string {
  switch (role) {
  case "inviter":
    return "Você já possui inscrição nesta categoria.";
  case "invitee":
    return "Este parceiro já está inscrito nesta categoria.";
  case "pair":
    return "Já existe uma dupla com vocês dois nesta categoria.";
  }
}

/**
 * Detecta conflito de par/membros na categoria.
 * `ignoreRegistrationId`: inscrição alvo do modo attach (solo pendente).
 */
export function findRegistrationConflict(
  registrations: ParsedCategoryRegistration[],
  inviterUid: string,
  inviteeUid: string,
  options?: {ignoreRegistrationId?: string},
): RegistrationConflict | null {
  const inviter = inviterUid.trim();
  const invitee = inviteeUid.trim();
  const targetPairKey = buildPairKey(inviter, invitee);
  const ignoreId = options?.ignoreRegistrationId?.trim() ?? "";

  for (const reg of registrations) {
    if (ignoreId && reg.registrationId === ignoreId) continue;

    const hasInviter = reg.participantUids.includes(inviter);
    const hasInvitee = reg.participantUids.includes(invitee);

    if (!reg.isComplete) {
      if (hasInvitee) {
        return {role: "invitee", message: memberMessage("invitee")};
      }
      if (hasInviter) {
        return {role: "inviter", message: memberMessage("inviter")};
      }
      continue;
    }

    if (targetPairKey && reg.pairKey === targetPairKey) {
      return {role: "pair", message: memberMessage("pair")};
    }
    if (hasInviter) {
      return {role: "inviter", message: memberMessage("inviter")};
    }
    if (hasInvitee) {
      return {role: "invitee", message: memberMessage("invitee")};
    }
  }
  return null;
}

/** Lança HttpsError se houver conflito de par/membros. */
export function assertNoRegistrationConflict(
  registrations: ParsedCategoryRegistration[],
  inviterUid: string,
  inviteeUid: string,
  options?: {ignoreRegistrationId?: string},
): void {
  const conflict = findRegistrationConflict(
    registrations,
    inviterUid,
    inviteeUid,
    options,
  );
  if (conflict) {
    throw new HttpsError("failed-precondition", conflict.message);
  }
}

/** Verifica se o par já existe em inscrições completas (para send). */
export function pairAlreadyRegistered(
  registrations: ParsedCategoryRegistration[],
  uidA: string,
  uidB: string,
): boolean {
  const key = buildPairKey(uidA, uidB);
  if (!key) return false;
  return registrations.some(
    (reg) => reg.isComplete && reg.pairKey === key,
  );
}

type TxLike = Pick<Transaction, "get">;

/**
 * Carrega inscrições da categoria dentro de uma transaction e valida conflitos.
 */
export async function assertNoPairConflictTx(
  tx: TxLike,
  inscriptionsRef: CollectionReference,
  teamsPath: string,
  tournamentId: string,
  categoryKeys: Set<string>,
  inviterUid: string,
  inviteeUid: string,
  options?: {ignoreRegistrationId?: string},
): Promise<void> {
  const snap = await tx.get(
    inscriptionsRef.where("tournamentId", "==", tournamentId),
  );

  const parsed: ParsedCategoryRegistration[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const inscriptionCategoryId = String(data.categoryId ?? "").trim();
    if (!categoryKeys.has(inscriptionCategoryId)) continue;

    const teamId = (data.teamId as string | undefined)?.trim() ?? "";
    let team: Record<string, unknown> | null = null;
    if (teamId) {
      const teamSnap = await tx.get(
        inscriptionsRef.firestore.doc(`${teamsPath}/${teamId}`),
      );
      if (teamSnap.exists) team = teamSnap.data()!;
    }

    parsed.push(parseCategoryRegistration(doc.id, data, team));
  }

  assertNoRegistrationConflict(parsed, inviterUid, inviteeUid, options);
}
