/**
 * Liberar a vaga de uma inscrição — efeito único, usado pelo cancelamento
 * feito pelo atleta e pelo sweeper de prazo de garantia.
 *
 * A ordem importa: as cobranças PIX abertas morrem no Asaas ANTES de qualquer
 * escrita, para que uma falha lá deixe a inscrição intacta. Sem isso a cobrança
 * sobreviveria ao doc e um pagamento tardio cairia órfão no webhook.
 *
 * Quem chama decide se pode liberar (permissão, prazo, ausência de pagamento) e
 * quem avisar depois: aqui só acontece o efeito.
 */

import {FieldValue, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deleteAsaasPaymentOrThrow} from "./asaas-booking-payment";
import {artifactsInscriptionsPath, artifactsTeamsPath} from "./firebase-paths";
import {INVITES_COLLECTION} from "./tournament-invite-constants";
import {
  buildRegistrationCancellationAudit,
  inviteMatchesCancelledRegistration,
  shouldDeleteTeamOnCancellation,
} from "./tournament-registration-cancellation";

export const REGISTRATION_CANCELLATIONS_COLLECTION =
  "tournamentRegistrationCancellations";

/**
 * Falha ao matar a cobrança no Asaas. Nada foi escrito ainda — a inscrição
 * continua de pé e quem chamou decide entre avisar o atleta e tentar de novo.
 */
export class RegistrationReleasePixError extends Error {
  constructor(
    readonly asaasPaymentId: string,
    readonly cause: unknown,
  ) {
    super("REGISTRATION_RELEASE_PIX_FAILED");
    this.name = "RegistrationReleasePixError";
  }
}

export interface ReleaseRegistrationResult {
  cancelledInvites: number;
  cancelledPixCharges: number;
  deletedTeam: boolean;
}

/**
 * @param ownerUid Atleta cujos convites avulsos (pré-reserva, sem
 * `attachRegistrationId`) morrem junto — o cancelador, no fluxo do atleta; o
 * dono da inscrição, no sweeper.
 * @param cancelledBy Vai para a auditoria: o uid do atleta ou `"system"`.
 */
export async function releaseRegistration(params: {
  db: Firestore;
  projectId: string;
  registrationId: string;
  registration: Record<string, unknown>;
  athleteUids: string[];
  ownerUid: string;
  cancelledBy: string;
  reason?: string;
}): Promise<ReleaseRegistrationResult> {
  const {db, projectId, registrationId, registration} = params;
  const regRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const tournamentId =
    (registration.tournamentId as string | undefined)?.trim() ?? "";
  const categoryId =
    (registration.categoryId as string | undefined)?.trim() ?? "";
  const teamId = (registration.teamId as string | undefined)?.trim() ?? "";

  const pixPendingSnap = await regRef.collection("pixPending").get();
  for (const doc of pixPendingSnap.docs) {
    const data = doc.data();
    const asaasId = (data.asaasPaymentId as string | undefined)?.trim() ?? "";
    if (!asaasId || data.status === "paid") continue;
    try {
      await deleteAsaasPaymentOrThrow(asaasId);
    } catch (e) {
      throw new RegistrationReleasePixError(asaasId, e);
    }
  }

  const invitesSnap = await db
    .collection(INVITES_COLLECTION)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .get();

  // A equipe só morre junto se nenhuma OUTRA inscrição a referencia
  // (ex.: solo legado reaproveitado).
  let deleteTeam = false;
  if (teamId) {
    const teamRegsSnap = await db
      .collection(artifactsInscriptionsPath(projectId))
      .where("teamId", "==", teamId)
      .get();
    deleteTeam = shouldDeleteTeamOnCancellation(
      teamId,
      teamRegsSnap.docs.map((d) => d.id),
      registrationId,
    );
  }

  const batch = db.batch();
  const auditRef = db.collection(REGISTRATION_CANCELLATIONS_COLLECTION).doc();
  batch.set(auditRef, {
    ...buildRegistrationCancellationAudit({
      registrationId,
      cancelledBy: params.cancelledBy,
      athleteUids: params.athleteUids,
      registration,
    }),
    ...(params.reason ? {reason: params.reason} : {}),
    cancelledAt: FieldValue.serverTimestamp(),
  });
  for (const doc of pixPendingSnap.docs) {
    batch.delete(doc.ref);
  }
  let cancelledInvites = 0;
  for (const doc of invitesSnap.docs) {
    const matches = inviteMatchesCancelledRegistration(doc.data(), {
      registrationId,
      cancellerUid: params.ownerUid,
      categoryId,
    });
    if (!matches) continue;
    batch.update(doc.ref, {
      status: "cancelled",
      cancelReason: "registration_cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    });
    cancelledInvites++;
  }
  if (deleteTeam) {
    batch.delete(db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`));
  }
  batch.delete(regRef);
  await batch.commit();

  logger.info("Vaga de inscrição liberada", {
    registrationId,
    tournamentId,
    categoryId,
    cancelledBy: params.cancelledBy,
    reason: params.reason ?? "athlete_cancelled",
    cancelledInvites,
    deletedTeam: deleteTeam,
    cancelledPixCharges: pixPendingSnap.size,
  });

  return {
    cancelledInvites,
    cancelledPixCharges: pixPendingSnap.size,
    deletedTeam: deleteTeam,
  };
}
