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
  computeTournamentShareAmountReais,
  parseTournamentRegistrationExternalReference,
  resolveTournamentRegistrationCredit,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";
import {
  MIN_TEAM_CATEGORY_SIZE,
  registrationTeamSize,
} from "./tournament-team-category";
import {
  loadTeamMemberUids,
  setTeamGenderWhenRegistrationPaid,
} from "./tournament-team-roster";
import {
  findCategory,
  loadTournamentData,
  resolveCategoryEntryFee,
} from "./tournament-registration-guards";
import {deliverNotificationToUser} from "./notification-delivery";
import {registrationHoldClearedFields} from "./tournament-registration-hold-ops";
import {tournamentManagerUids} from "./tournament-acl";
import {creditOrganizerWalletFromRegistration} from "./organizer-wallet";
import {computePlatformFeeReais, resolveOrganizerTournamentFeePercent} from "./platform-fees";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";

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
  const tournament = await loadTournamentData(db, projectId, tournamentId);
  const entryFee = tournament ? resolveCategoryEntryFee(tournament, categoryId) : 0;
  const organizerId = typeof tournament?.managerId === "string" ?
    tournament.managerId.trim() : "";
  // Categoria de equipe: cota dinâmica (restante ÷ pagadores que faltam) — o
  // aviso de divergência da metade fixa e o crédito por parcela não se aplicam.
  const regTeamSize = registrationTeamSize(
    regData,
    tournament ? findCategory(tournament, categoryId) : null,
  );
  const isTeamRegistration = regTeamSize >= MIN_TEAM_CATEGORY_SIZE;
  const expectedShare = isTeamRegistration
    ? 0
    : computeTournamentShareAmountReais(entryFee);

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

    // Credita o valor real (parcela ou taxa inteira) e decide a confirmação.
    // Em categoria de equipe a parcela creditada é o valor efetivamente pago
    // (a cota varia conforme quem já pagou), limitado ao que falta.
    const currentPaid = Number(regData.paidAmount) || 0;
    const credit = resolveTournamentRegistrationCredit({
      entryFee,
      amountType,
      currentPaidAmount: currentPaid,
      ...(isTeamRegistration ? {shareCreditReais: paidOnline} : {}),
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
      // Pagamento na conta: a vaga deixa de ter prazo de garantia.
      ...registrationHoldClearedFields(),
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

    // Credita o organizador com o líquido (bruto − taxa de 8%). A plataforma
    // retém a taxa; o organizador saca depois. Roda uma vez por pagamento
    // (o processedRef acima já protege contra reprocessamento).
    if (organizerId) {
      try {
        // Comissão negociada no cadastro do organizador; sem cadastro (ou com
        // valor fora da faixa) cai nos 8% padrão.
        const organizerSnap = await db.doc(`organizers/${organizerId}`).get();
        const feePercent = resolveOrganizerTournamentFeePercent(organizerSnap.data());
        await creditOrganizerWalletFromRegistration(db, organizerId, {
          registrationId,
          payerUid,
          paymentId,
          grossReais: paidOnline,
          platformFeeReais: computePlatformFeeReais(paidOnline, feePercent),
        });
      } catch (walletErr) {
        logger.error(
          `Asaas tournament registration ${registrationId}: organizer wallet credit failed`,
          walletErr,
        );
      }
    }

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

      const athleteUids = await loadTeamMemberUids(db, projectId, teamId);
      const recipients = athleteUids.filter((uid) => uid !== payerUid);
      await Promise.all(
        recipients.map((uid) =>
          deliverNotificationToUser({
            userId: uid,
            title: "Inscricao confirmada",
            body: isTeamRegistration
              ? "Sua equipe concluiu o pagamento. Toque para ver o comprovante."
              : "Sua dupla concluiu o pagamento. Toque para ver o comprovante.",
            type: "tournament_registration_confirmed",
            data: {
              tournamentId,
              registrationId,
              url,
            },
          }),
        ),
      );

      // Avisa quem opera o torneio que o Pix do gateway confirmou sozinho — o organizador não
      // precisa conferir nada aqui (diferente do pagamento direto, que ele mesmo confirma).
      const teamNameLabel = typeof regData.teamName === "string" ? regData.teamName.trim() : "";
      const categoryLabel = tournament
        ? String(
            findCategory(tournament, categoryId)?.categoryName ??
              findCategory(tournament, categoryId)?.name ??
              "",
          ).trim()
        : "";
      const organizerRecipients = await tournamentManagerUids(db, tournamentId, tournament ?? undefined);
      await Promise.all(
        organizerRecipients.map((recipientUid) =>
          deliverNotificationToUser({
            userId: recipientUid,
            title: "Pagamento confirmado",
            body: `${teamNameLabel || "Uma dupla"} confirmou o pagamento${
              categoryLabel ? ` em ${categoryLabel}` : ""
            }.`,
            type: "tournament_payment_confirmed",
            data: {
              tournamentId,
              registrationId,
              categoryId,
              url: `/painel/eventos/${tournamentId}/inscricoes?registrationId=${registrationId}`,
            },
          }).catch(() => undefined),
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
