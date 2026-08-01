/**
 * Espelho, limpeza e sweeper da equipe de arena — mesmo padrão de
 * `tournament-staff-sync.ts` aplicado a `arenas/{arenaId}/staff/{uid}`.
 *
 * O espelho em `users/{uid}/arenaStaff/{arenaId}` é a ÚNICA forma do portal
 * Angular descobrir de quais arenas o usuário é staff: a consulta existente
 * do portal busca arenas por `managerUserId`, que nunca casa com um membro da
 * equipe. A role `arena` (claim + `users/{uid}`) já é concedida de forma
 * síncrona pelos callables em `arena-staff-ops.ts` no momento da criação do
 * vínculo — este trigger não concede role nenhuma, para não duplicar escrita
 * de claims a cada troca de cargo.
 */
import {
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";
import {isArenaStaffRole, type ArenaStaffRole} from "./arena-staff-roles";

const ROLE_LABELS: Record<ArenaStaffRole, string> = {
  gestor: "gestor",
  recepcao: "recepção",
  financeiro: "financeiro",
  manutencao: "manutenção",
};

/** Rótulo pt-BR do cargo; cargo desconhecido/ausente cai em "membro". */
export function arenaStaffRoleLabel(role: unknown): string {
  return isArenaStaffRole(role) ? ROLE_LABELS[role] : "membro";
}

/** Monta o corpo da notificação de adição à equipe da arena. */
export function buildArenaStaffAddedBody(role: unknown, arenaName: unknown): string {
  const name = typeof arenaName === "string" ? arenaName.trim() : "";
  const label = arenaStaffRoleLabel(role);
  return name.length > 0 ?
    `Você agora é ${label} da ${name}` :
    `Você agora é ${label} de uma arena`;
}

/** Mesma precedência de marca que `arenaLogoOf` em `ArenaContextService` no
 *  portal Angular: logoUrl → logo → coverUrl. */
function arenaLogoOf(arenaData: Record<string, unknown>): string | null {
  for (const key of ["logoUrl", "logo", "coverUrl"]) {
    const value = arenaData[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/** Dados do espelho `users/{uid}/arenaStaff/{arenaId}`. */
export function buildArenaStaffMirrorData(
  staffData: Record<string, unknown>,
  arenaData: Record<string, unknown>,
): {role: string; status: string; arenaName: string; arenaLogoUrl: string | null} {
  return {
    role: typeof staffData.role === "string" ? staffData.role : "recepcao",
    status: typeof staffData.status === "string" ? staffData.status : "active",
    arenaName: typeof arenaData.name === "string" ? arenaData.name : "",
    arenaLogoUrl: arenaLogoOf(arenaData),
  };
}

/**
 * Mantém `users/{uid}/arenaStaff/{arenaId}` em sincronia com
 * `arenas/{arenaId}/staff/{uid}` e notifica o usuário apenas na criação do
 * vínculo (troca de cargo não deve gerar ruído).
 */
export const onArenaStaffWrittenSyncMirror = onDocumentWritten(
  "arenas/{arenaId}/staff/{staffUserId}",
  async (event) => {
    const {arenaId, staffUserId} = event.params;
    const db = getFirestore();
    const mirrorRef = db.doc(`users/${staffUserId}/arenaStaff/${arenaId}`);

    const after = event.data?.after;
    if (!after?.exists) {
      await mirrorRef.delete();
      return;
    }

    const staffData = after.data() ?? {};
    const arenaSnap = await db.doc(`arenas/${arenaId}`).get();
    if (!arenaSnap.exists) {
      logger.warn("arenaStaff: arena inexistente, espelho omitido", {arenaId, staffUserId});
      return;
    }
    const arenaData = arenaSnap.data() ?? {};

    await mirrorRef.set(
      {
        ...buildArenaStaffMirrorData(staffData, arenaData),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    const isCreate = !event.data?.before?.exists;
    if (!isCreate) return;

    // Fora do fluxo do espelho: uma falha ao notificar não pode desfazer (nem
    // reexecutar) a escrita do espelho acima, que já foi persistida.
    try {
      await deliverNotificationToUser({
        userId: staffUserId,
        title: "Você entrou na equipe de uma arena",
        body: buildArenaStaffAddedBody(staffData.role, arenaData.name),
        type: "arena_staff_added",
        data: {arenaId, role: String(staffData.role ?? "")},
      });
    } catch (error) {
      logger.warn("arenaStaff: falha ao notificar adição à equipe", {
        arenaId,
        staffUserId,
        error,
      });
    }
  },
);

/** Arena excluída: apaga vínculos (cada delete dispara o sync acima, que
 *  limpa o espelho) e convites pendentes. */
export const onArenaDeletedCleanupStaff = onDocumentDeleted(
  "arenas/{arenaId}",
  async (event) => {
    const {arenaId} = event.params;
    const db = getFirestore();
    const [staffSnap, invitesSnap] = await Promise.all([
      db.collection(`arenas/${arenaId}/staff`).get(),
      db.collection("arenaStaffInvites").where("arenaId", "==", arenaId).get(),
    ]);
    if (staffSnap.empty && invitesSnap.empty) return;

    const batch = db.batch();
    for (const d of [...staffSnap.docs, ...invitesSnap.docs]) batch.delete(d.ref);
    await batch.commit();
    logger.info("arenaStaff: limpeza apos exclusao da arena", {
      arenaId,
      staff: staffSnap.size,
      invites: invitesSnap.size,
    });
  },
);

/** Marca convites vencidos como `expired` para liberar assento. */
export const sweepExpiredArenaStaffInvites = onSchedule(
  {schedule: "0 4 * * *", timeZone: "America/Sao_Paulo"},
  async () => {
    const db = getFirestore();
    const snap = await db
      .collection("arenaStaffInvites")
      .where("status", "==", "pending")
      .where("expiresAt", "<", Timestamp.now())
      .limit(500)
      .get();
    if (snap.empty) return;

    const batch = db.batch();
    for (const d of snap.docs) batch.set(d.ref, {status: "expired"}, {merge: true});
    await batch.commit();
    logger.info("arenaStaff: convites expirados", {count: snap.size});
  },
);
