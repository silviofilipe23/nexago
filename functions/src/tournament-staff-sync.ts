import {
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";
import {deliverNotificationToUser} from "./notification-delivery";

export const TOURNAMENT_STAFF_ROLES = ["manager", "scorer"] as const;
export type TournamentStaffRole = (typeof TOURNAMENT_STAFF_ROLES)[number];

/** Rótulo pt-BR do papel de staff. */
export function staffRoleLabel(role: string): string {
  return role === "scorer" ? "mesário" : "gestor";
}

/** Monta o corpo da notificação de adição à equipe. */
export function buildStaffAddedNotificationBody(
  role: string,
  tournamentName: string,
): string {
  const name = tournamentName.trim().length > 0 ?
    tournamentName.trim() :
    "um torneio";
  return `Você agora é ${staffRoleLabel(role)} de ${name}`;
}

/** Gestor (manager) ganha acesso ao portal do organizador; mesário não.
 *  Papel ausente/desconhecido cai em gestor, mesmo default de
 *  `buildStaffMirrorData` e `staffRoleLabel`. */
export function staffRoleGrantsOrganizerAccess(role: unknown): boolean {
  return role !== "scorer";
}

/**
 * Garante a role `organizer` (claim + espelho em `users/{uid}`) — é ela que
 * libera o login no portal do organizador. Só acrescenta, nunca remove: sair
 * da equipe não revoga o papel, pois o usuário pode ser organizer por conta
 * própria (autocadastro ou torneios que organiza). Mesmo par
 * claims+Firestore de `completeOrganizerSignup`/`addUserRole`.
 */
async function ensureOrganizerRole(uid: string): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const roles = rolesFromClaims(user.customClaims);
  if (roles.includes("organizer")) return;

  const next = [...roles, "organizer" as const];
  await auth.setCustomUserClaims(
    uid,
    applyRolesToClaims((user.customClaims || {}) as Record<string, unknown>, next),
  );
  await getFirestore().doc(`users/${uid}`).set(
    firestoreRolesPayload(next),
    {merge: true},
  );
  logger.info("tournamentStaff: role organizer concedida a gestor", {uid});
}

/** Dados do espelho `users/{uid}/tournamentStaff/{tournamentId}`. */
export function buildStaffMirrorData(
  staffData: Record<string, unknown>,
  tournamentData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    role: staffData.role ?? "manager",
    status: staffData.status ?? "active",
    tournamentName: tournamentData.name ?? "",
    startAt: tournamentData.startAt ?? null,
    endAt: tournamentData.endAt ?? null,
  };
}

/**
 * Mantém o espelho `users/{uid}/tournamentStaff/{tournamentId}` em sincronia
 * com `tournaments/{tournamentId}/staff/{uid}` e notifica o usuário quando
 * ele é adicionado à equipe. Remoção não notifica (evita ruído, inclusive na
 * limpeza em massa quando o torneio é excluído).
 */
export const onTournamentStaffWrittenSyncMirror = onDocumentWritten(
  "tournaments/{tournamentId}/staff/{staffUserId}",
  async (event) => {
    const {tournamentId, staffUserId} = event.params;
    const db = getFirestore();
    const mirrorRef = db.doc(
      `users/${staffUserId}/tournamentStaff/${tournamentId}`,
    );

    const after = event.data?.after;
    if (!after?.exists) {
      await mirrorRef.delete();
      return;
    }

    const staffData = after.data() ?? {};
    const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
    if (!tournamentSnap.exists) {
      logger.warn("tournamentStaff: torneio inexistente, espelho omitido", {
        tournamentId,
        staffUserId,
      });
      return;
    }
    const tournamentData = tournamentSnap.data() ?? {};

    await mirrorRef.set(
      {
        ...buildStaffMirrorData(staffData, tournamentData),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    // Fora do fluxo do espelho: uma falha aqui não pode engolir a notificação.
    if (staffRoleGrantsOrganizerAccess(staffData.role)) {
      try {
        await ensureOrganizerRole(staffUserId);
      } catch (error) {
        logger.error("tournamentStaff: falha ao conceder role organizer", {
          staffUserId,
          tournamentId,
          error,
        });
      }
    }

    const isCreate = !event.data?.before?.exists;
    if (!isCreate) return;

    const role = typeof staffData.role === "string" ? staffData.role : "";
    const tournamentName = typeof tournamentData.name === "string" ?
      tournamentData.name :
      "";
    await deliverNotificationToUser({
      userId: staffUserId,
      title: "Você entrou na equipe de um torneio",
      body: buildStaffAddedNotificationBody(role, tournamentName),
      type: "tournament_staff_added",
      data: {tournamentId, role},
    });
  },
);

/**
 * Ao excluir um torneio, remove os docs de staff da subcoleção; a exclusão de
 * cada doc dispara o sync acima, que apaga o espelho no perfil do usuário.
 */
export const onTournamentDeletedCleanupStaff = onDocumentDeleted(
  "tournaments/{tournamentId}",
  async (event) => {
    const {tournamentId} = event.params;
    const db = getFirestore();
    const staffSnap = await db
      .collection(`tournaments/${tournamentId}/staff`)
      .get();
    if (staffSnap.empty) return;

    const batch = db.batch();
    for (const doc of staffSnap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    logger.info("tournamentStaff: limpeza após exclusão do torneio", {
      tournamentId,
      removed: staffSnap.size,
    });
  },
);
