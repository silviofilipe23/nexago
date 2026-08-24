/**
 * Webhook Asaas — pagamentos de vaga de clubinho (`arenaClubSession:*`).
 *
 * RECEIVED confirma o participante em transação (contadores da sessão) e
 * credita a carteira da arena com taxa de 5% SEM piso. Pagamento que chega
 * "tarde" (participante expirado) ainda confirma se houver vaga; sessão
 * lotada ou cancelada → estorno automático imediato, sem crédito.
 */

import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";
import {refundAsaasPayment} from "./asaas-booking-payment";
import {
  ARENA_CLUB_SESSIONS,
  CLUB_PARTICIPANTS,
  parseClubSessionPaymentRef,
} from "./arena-club-constants";
import {creditArenaWalletFromClubPayment} from "./arena-wallet";
import {CLUB_FEE_PERCENT, computePlatformFeeReais} from "./platform-fees";
import {roundMoney} from "./mercadopago-arena-helpers";
import {deliverNotificationToUser} from "./notification-delivery";
import {resolveAthleteCpfCnpj} from "./asaas-customer";
import {requestInvoiceForPaidClubSpot} from "./fiscal/payment-hooks";

const ASAAS_NON_TERMINAL_STATUSES = new Set([
  "PENDING",
  "AWAITING_RISK_ANALYSIS",
  "CONFIRMED",
]);

const ASAAS_PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH"]);

export interface ClubWebhookDeps {
  refund: (paymentId: string) => Promise<void>;
  notify: (input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data: Record<string, string>;
  }) => Promise<void>;
}

const defaultDeps: ClubWebhookDeps = {
  refund: (paymentId) => refundAsaasPayment(paymentId),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

/**
 * Nome e CPF do atleta pagador, para a nota fiscal. Mesma resolução usada na
 * cobrança PIX (getAuth + resolveAthleteCpfCnpj) — o webhook não tem CPF em
 * escopo, só o uid do participante.
 */
async function resolvePayerForInvoice(
  athleteId: string,
): Promise<{nome: string; cpfCnpj: string} | null> {
  let nome = "Atleta NexaGO";
  try {
    const user = await getAuth().getUser(athleteId);
    nome = user.displayName?.trim() || nome;
  } catch {
    // segue com fallback
  }
  try {
    const cpfCnpj = await resolveAthleteCpfCnpj(athleteId);
    return {nome, cpfCnpj};
  } catch {
    return null;
  }
}

export async function processArenaClubSessionAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  deps: ClubWebhookDeps = defaultDeps,
): Promise<void> {
  const parsed = parseClubSessionPaymentRef((payment.externalReference || "").trim());
  if (!parsed) return;
  const {sessionId, athleteUid} = parsed;

  const processedSnap = await processedRef.get();
  if (processedSnap.exists) {
    logger.info(`Asaas clubinho: payment ${paymentId} já processado`);
    return;
  }

  const status = (payment.status || "").toUpperCase();
  if (ASAAS_NON_TERMINAL_STATUSES.has(status)) {
    logger.info(`Asaas clubinho ${sessionId}/${athleteUid}: pagamento ainda ${status}`);
    return;
  }

  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const participantRef = sessionRef.collection(CLUB_PARTICIPANTS).doc(athleteUid);

  const markProcessed = (outcome: string) =>
    processedRef.set({
      kind: "arenaClubSession",
      sessionId,
      participantId: athleteUid,
      outcome,
      paymentStatus: status,
      processedAt: FieldValue.serverTimestamp(),
    });

  if (ASAAS_PAID_STATUSES.has(status)) {
    const paidReais = roundMoney(Number(payment.value) || 0);
    if (paidReais <= 0) {
      logger.warn(`Asaas clubinho ${sessionId}/${athleteUid}: valor inválido`);
      return;
    }
    const platformFeeReais = computePlatformFeeReais(
      paidReais,
      CLUB_FEE_PERCENT,
      {floorReais: 0},
    );
    const netReais = roundMoney(paidReais - platformFeeReais);

    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const participantSnap = await tx.get(participantRef);
      if (!participantSnap.exists) return "orphan" as const;
      const participant = participantSnap.data() as Record<string, unknown>;
      const pStatus = String(participant["status"] ?? "");

      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) return "orphan" as const;
      const session = sessionSnap.data() as Record<string, unknown>;
      const sStatus = String(session["status"] ?? "");
      const capacity = Number(session["capacity"] ?? 0);
      const confirmedCount = Number(session["confirmedCount"] ?? 0);
      const pendingCount = Number(session["pendingCount"] ?? 0);

      if (pStatus === "confirmed") return "already_confirmed" as const;
      if (
        pStatus === "canceled_refunded" ||
        pStatus === "canceled_by_arena_refunded"
      ) {
        return "already_refunded" as const;
      }

      if (sStatus !== "scheduled") return "session_closed" as const;

      const wasHeld = pStatus === "pending_payment";
      if (!wasHeld && confirmedCount + pendingCount >= capacity) {
        // Pagou depois de expirar e a lista lotou nesse meio-tempo.
        return "session_full" as const;
      }

      tx.set(participantRef, {
        status: "confirmed",
        amountReais: paidReais,
        platformFeeReais,
        netReais,
        asaasPaymentId: paymentId,
        confirmedAt: FieldValue.serverTimestamp(),
        paymentExpiresAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});

      tx.set(sessionRef, {
        confirmedCount: confirmedCount + 1,
        ...(wasHeld ? {pendingCount: Math.max(0, pendingCount - 1)} : {}),
      }, {merge: true});

      return "approved" as const;
    });

    if (outcome === "approved") {
      const sessionData = (await sessionRef.get()).data() ?? {};
      const arenaId = String(sessionData["arenaId"] ?? "");
      if (arenaId) {
        try {
          await creditArenaWalletFromClubPayment(db, arenaId, {
            sessionId,
            participantId: athleteUid,
            grossReais: paidReais,
            platformFeeReais,
          });
        } catch (walletErr) {
          logger.error(`Asaas clubinho ${sessionId}: wallet credit failed`, walletErr);
        }

        try {
          const payer = await resolvePayerForInvoice(athleteUid);
          if (payer) {
            await requestInvoiceForPaidClubSpot(db, {
              arenaId,
              sessionId,
              participantId: athleteUid,
              asaasPaymentId: paymentId,
              grossReais: paidReais,
              tomador: {nome: payer.nome, cpfCnpj: payer.cpfCnpj},
              tomadorUid: athleteUid,
            });
          }
        } catch (fiscalErr) {
          logger.error(`Asaas clubinho ${sessionId}: fiscal request failed`, fiscalErr);
        }
      }
      await markProcessed("approved");
      try {
        await deps.notify({
          userId: athleteUid,
          title: "Vaga confirmada! 🎾",
          body: `Seu nome está na lista do ${String(sessionData["clubName"] ?? "clubinho")} — ` +
            `${formatDateBr(String(sessionData["date"] ?? ""))} às ` +
            `${String(sessionData["startTime"] ?? "")}.`,
          type: "club_join_confirmed",
          data: {clubSessionId: sessionId, arenaId},
        });
      } catch (e) {
        logger.warn(`Asaas clubinho ${sessionId}: notificação falhou`, e);
      }
      logger.info(
        `Asaas clubinho ${sessionId}/${athleteUid}: confirmado, paymentId=${paymentId}`,
      );
      return;
    }

    if (outcome === "session_closed" || outcome === "session_full" || outcome === "orphan") {
      // Dinheiro chegou mas não há vaga/sessão — estorno automático, sem crédito.
      try {
        await deps.refund(paymentId);
        if (outcome !== "orphan") {
          await participantRef.set({
            status: "canceled_by_arena_refunded",
            refundStatus: "done",
            asaasPaymentId: paymentId,
            canceledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
        await markProcessed(`refunded_${outcome}`);
        logger.info(
          `Asaas clubinho ${sessionId}/${athleteUid}: pagamento estornado (${outcome})`,
        );
      } catch (e) {
        // Sem processedRef: o retry do webhook tenta o estorno de novo.
        if (outcome !== "orphan") {
          await participantRef.set({refundStatus: "failed"}, {merge: true});
        }
        logger.error(
          `Asaas clubinho ${sessionId}/${athleteUid}: estorno automático falhou`,
          e,
        );
      }
      return;
    }

    // already_confirmed / already_refunded — idempotente.
    await markProcessed(outcome);
    return;
  }

  // Eventos negativos (OVERDUE/DELETED/REFUNDED/...): se o participante ainda
  // está aguardando, libera a vaga. REFUNDED de estornos iniciados por nós
  // chega com o participante já resolvido — só registra.
  const outcome = await db.runTransaction(async (tx: Transaction) => {
    const pSnap = await tx.get(participantRef);
    if (!pSnap.exists) return "orphan" as const;
    if (String(pSnap.data()?.["status"]) !== "pending_payment") {
      return "already_resolved" as const;
    }
    const sSnap = await tx.get(sessionRef);
    const pending = Number(sSnap.data()?.["pendingCount"] ?? 0);
    tx.set(participantRef, {
      status: "expired",
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (sSnap.exists) {
      tx.set(sessionRef, {pendingCount: Math.max(0, pending - 1)}, {merge: true});
    }
    return "expired" as const;
  });
  await markProcessed(outcome);
  logger.info(`Asaas clubinho ${sessionId}/${athleteUid}: ${status} → ${outcome}`);
}

function formatDateBr(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
