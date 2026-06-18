/**
 * Processamento de webhooks Asaas para inscrições em torneio.
 */

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {roundMoney} from "./mercadopago-arena-helpers";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {
  computeTeamGenderLabel,
  computeTournamentShareAmountReais,
  normalizeAthleteGenderBucket,
  parseTournamentRegistrationExternalReference,
  resolveTournamentRegistrationCredit,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import {deliverNotificationToUser} from "./notification-delivery";

const ASAAS_NON_TERMINAL_STATUSES = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "CONFIRMED",
]);

const ASAAS_PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

const ASAAS_NEGATIVE_TERMINAL_STATUSES = new Set([
  "OVERDUE",
  "REFUNDED",
  "REFUND_REQUESTED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
  "DELETED",
]);

function getFirebaseProjectId(): string {
  return process.env.GCLOUD_PROJECT || "volley-track-2dd3b";
}

function artifactsInscriptionsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/inscriptions`;
}

function artifactsTeamsPath(projectId: string): string {
  return `artifacts/${projectId}/public/data/teams`;
}

async function loadEntryFee(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<number> {
  let tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    tournamentSnap = await db
      .doc(`artifacts/${projectId}/public/data/tournaments/${tournamentId}`)
      .get();
  }
  if (!tournamentSnap.exists) return 0;
  const categories = (tournamentSnap.data()?.categories || []) as Array<{
    categoryName: string;
    entryFee?: number;
  }>;
  const category = categories.find((c) => c.categoryName === categoryId);
  return category?.entryFee ?? 0;
}

async function loadTeamAthleteUids(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<string[]> {
  if (!teamId) return [];
  const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
  if (!teamSnap.exists) return [];
  const data = teamSnap.data() ?? {};
  return [data.player1Id, data.player2Id]
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id, idx, arr) => id.length > 0 && arr.indexOf(id) === idx);
}

async function loadUserGenderBucket(
  db: Firestore,
  uid: string,
): Promise<ReturnType<typeof normalizeAthleteGenderBucket>> {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const gender = snap.data()?.gender;
  return normalizeAthleteGenderBucket(
    typeof gender === "string" ? gender : undefined,
  );
}

/** Define `gender` no documento da equipe quando a inscrição fica 100% paga. */
async function setTeamGenderWhenRegistrationPaid(
  db: Firestore,
  projectId: string,
  teamId: string,
): Promise<void> {
  if (!teamId) return;

  const teamRef = db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    logger.warn(`Team ${teamId} não encontrado para definir gender`);
    return;
  }

  const data = teamSnap.data() ?? {};
  const player1Id = typeof data.player1Id === "string" ? data.player1Id.trim() : "";
  const player2Id = typeof data.player2Id === "string" ? data.player2Id.trim() : "";
  if (!player1Id || !player2Id) return;

  const [g1, g2] = await Promise.all([
    loadUserGenderBucket(db, player1Id),
    loadUserGenderBucket(db, player2Id),
  ]);
  const teamGender = computeTeamGenderLabel(g1, g2);
  if (!teamGender) {
    logger.warn(
      `Team ${teamId}: não foi possível calcular gender (p1=${String(g1)} p2=${String(g2)})`,
    );
    return;
  }

  await teamRef.set(
    {
      gender: teamGender,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  logger.info(`Team ${teamId}: gender=${teamGender}`);
}

export async function processTournamentRegistrationAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
): Promise<void> {
  const parsed = parseTournamentRegistrationExternalReference(
    (payment.externalReference || "").trim(),
  );
  if (!parsed) {
    return;
  }

  const {registrationId, payerUid} = parsed;

  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    logger.info(`Asaas tournament registration: payment ${paymentId} já processado`);
    return;
  }

  const status = (payment.status || "").toUpperCase();

  if (ASAAS_NON_TERMINAL_STATUSES.has(status)) {
    logger.info(
      `Asaas tournament registration ${registrationId}: pagamento ${paymentId} ainda ${status}`,
    );
    return;
  }

  const projectId = getFirebaseProjectId();
  const registrationRef = db
    .collection(artifactsInscriptionsPath(projectId))
    .doc(registrationId);
  const pendingRef = registrationRef.collection("pixPending").doc(payerUid);

  const registrationSnap = await registrationRef.get();
  if (!registrationSnap.exists) {
    logger.warn(`Asaas tournament registration: inscrição ${registrationId} não encontrada`);
    await processedRef.set({
      kind: "tournamentRegistration",
      registrationId,
      outcome: "orphan",
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const regData = registrationSnap.data()!;
  const tournamentId = regData.tournamentId as string;
  const categoryId = regData.categoryId as string;
  const entryFee = await loadEntryFee(db, projectId, tournamentId, categoryId);
  const expectedShare = computeTournamentShareAmountReais(entryFee);

  if (ASAAS_PAID_STATUSES.has(status)) {
    const paidOnline = roundMoney(Number(payment.value) || 0);
    if (paidOnline <= 0) {
      logger.warn(`Asaas tournament registration ${registrationId}: valor inválido`);
      return;
    }

    // Tipo de cobrança gravado no doc pendente (parcela ou dupla inteira).
    const pendingSnap = await pendingRef.get();
    const amountType: "share" | "full" =
      pendingSnap.data()?.amountType === "full" ? "full" : "share";

    if (
      amountType === "share" &&
      expectedShare > 0 &&
      Math.abs(paidOnline - expectedShare) > 0.02
    ) {
      logger.warn(
        `Asaas tournament registration ${registrationId}: valor ${paidOnline} diverge da parcela ${expectedShare}`,
      );
    }

    const sharePaidUids = sharePaidUidsFromRegistration(regData);
    if (sharePaidUids.includes(payerUid)) {
      await processedRef.set({
        kind: "tournamentRegistration",
        registrationId,
        payerUid,
        outcome: "duplicate_payer",
        processedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    // Credita o valor real (parcela ou dupla inteira) e decide a confirmação.
    const currentPaid = Number(regData.paidAmount) || 0;
    const credit = resolveTournamentRegistrationCredit({
      entryFee,
      amountType,
      currentPaidAmount: currentPaid,
    });
    const newPaidAmount = credit.newPaidAmount;
    const wasPaidBefore = regData.isPaid === true;
    const isPaid = credit.isPaid || wasPaidBefore;

    // "Dupla inteira": confirma os dois atletas (o parceiro não paga de novo).
    const participantUids = Array.isArray(regData.participantUids) ?
      (regData.participantUids as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.trim().length > 0,
      ) :
      [];
    const uidsToConfirm =
      amountType === "full" && participantUids.length > 0 ?
        participantUids :
        [payerUid];

    const batch = db.batch();
    batch.update(registrationRef, {
      paidAmount: newPaidAmount,
      isPaid,
      sharePaidUids: FieldValue.arrayUnion(...uidsToConfirm),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(pendingRef, {
      status: "paid",
      asaasPaymentId: paymentId,
      paidAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    batch.set(processedRef, {
      kind: "tournamentRegistration",
      registrationId,
      payerUid,
      outcome: "approved",
      processedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    if (!wasPaidBefore && isPaid) {
      const teamId = typeof regData.teamId === "string" ? regData.teamId : "";
      try {
        await setTeamGenderWhenRegistrationPaid(db, projectId, teamId);
      } catch (genderError) {
        logger.warn(
          `Falha ao definir gender da equipe ${teamId} (registration ${registrationId})`,
          genderError,
        );
      }
      const tournamentName = typeof regData.tournamentName === "string" ?
        regData.tournamentName : "Torneio";
      const categoryName = typeof regData.categoryId === "string" ?
        regData.categoryId : "Categoria";
      const encodedTournamentName = encodeURIComponent(tournamentName);
      const encodedCategoryName = encodeURIComponent(categoryName);
      const url =
        `/torneios/${tournamentId}/inscricao/sucesso?registrationId=${registrationId}` +
        `&tournamentName=${encodedTournamentName}&categoryName=${encodedCategoryName}`;

      const athleteUids = await loadTeamAthleteUids(db, projectId, teamId);
      const recipients = athleteUids.filter((uid) => uid !== payerUid);
      await Promise.all(
        recipients.map((uid) =>
          deliverNotificationToUser({
            userId: uid,
            title: "Inscricao confirmada",
            body: "Sua dupla concluiu o pagamento. Toque para ver o comprovante.",
            type: "tournament_registration_confirmed",
            data: {
              tournamentId,
              registrationId,
              url,
            },
          }),
        ),
      );
    }

    logger.info(
      `Asaas tournament registration ${registrationId}: parcela de ${payerUid} confirmada, ` +
      `paidAmount=${newPaidAmount} isPaid=${isPaid}`,
    );
    return;
  }

  if (ASAAS_NEGATIVE_TERMINAL_STATUSES.has(status)) {
    await pendingRef.set({
      status: "expired",
      asaasPaymentStatus: status,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await processedRef.set({
      kind: "tournamentRegistration",
      registrationId,
      payerUid,
      outcome: "rejected",
      asaasPaymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });
    logger.info(
      `Asaas tournament registration ${registrationId}: pagamento ${status} para ${payerUid}`,
    );
    return;
  }

  logger.warn(
    `Asaas tournament registration ${registrationId}: status não tratado: ${status}`,
  );
}
