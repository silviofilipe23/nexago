/**
 * Clubinho — lado do atleta: entrar na lista (PIX antecipado garante a vaga),
 * sair da lista (com estorno dentro do prazo) e expiração de PIX pendente.
 *
 * A capacidade é protegida exclusivamente pela transação sobre os contadores
 * `confirmedCount`/`pendingCount` do doc da sessão (cliente nunca escreve).
 * A vaga fica "segurada" durante o `pending_payment`, com o mesmo timeout de
 * PIX das reservas de quadra.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {AsaasApiError, asaasArenaSecrets} from "./asaas-client";
import {
  getOrCreateAsaasCustomer,
  resolveAthleteCpfCnpj,
} from "./asaas-customer";
import {
  createAsaasPixCharge,
  deleteAsaasPaymentIfOpen,
  refundAsaasPayment,
} from "./asaas-booking-payment";
import {ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES} from "./arena-booking-constants";
import {
  ARENA_CLUB_SESSIONS,
  CLUB_PARTICIPANTS,
  clubSessionPaymentRef,
} from "./arena-club-constants";
import {debitArenaWalletForClubRefund} from "./arena-wallet";
import {deliverNotificationToUser} from "./notification-delivery";
import {roundMoney} from "./mercadopago-arena-helpers";

/** Estados a partir dos quais o atleta pode tentar entrar de novo. */
const REJOINABLE_STATUSES = new Set(["expired", "canceled"]);

interface SessionSnapshotForJoin {
  clubId: string;
  arenaId: string;
  arenaName: string;
  clubName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  startAtMs: number | null;
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
  confirmedCount: number;
  pendingCount: number;
}

function readSessionForJoin(data: Record<string, unknown>): SessionSnapshotForJoin {
  const startAt = data["startAt"];
  return {
    clubId: String(data["clubId"] ?? ""),
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    clubName: String(data["clubName"] ?? "Clubinho"),
    date: String(data["date"] ?? ""),
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    status: String(data["status"] ?? ""),
    startAtMs: startAt instanceof Timestamp ? startAt.toMillis() : null,
    capacity: Number(data["capacity"] ?? 0),
    priceReais: Number(data["priceReais"] ?? 0),
    cancelWindowHours: Number(data["cancelWindowHours"] ?? 0),
    confirmedCount: Number(data["confirmedCount"] ?? 0),
    pendingCount: Number(data["pendingCount"] ?? 0),
  };
}

async function resolveAthleteDisplay(
  db: Firestore,
  uid: string,
): Promise<{name: string; photoUrl: string | null}> {
  let name = "";
  let photoUrl: string | null = null;
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    const data = userSnap.data() ?? {};
    name = String(data["fullName"] ?? data["name"] ?? data["nickname"] ?? "").trim();
    const rawPhoto = data["profilePhotoUrl"] ?? data["avatarUrl"] ?? data["photoURL"];
    photoUrl = typeof rawPhoto === "string" && rawPhoto.trim() ? rawPhoto.trim() : null;
  } catch {
    // segue para o fallback do Auth
  }
  if (!name) {
    try {
      const user = await getAuth().getUser(uid);
      name = user.displayName?.trim() ?? "";
      photoUrl = photoUrl ?? (user.photoURL?.trim() || null);
    } catch {
      // fallback final
    }
  }
  return {name: name || "Atleta", photoUrl};
}

// ---------------------------------------------------------------------------
// joinArenaClubSession
// ---------------------------------------------------------------------------

interface JoinInput {
  sessionId?: string;
  cpf?: string;
  cpfCnpj?: string;
}

export const joinArenaClubSession = onCall({
  secrets: asaasArenaSecrets,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para entrar na lista.");
  }
  const input = (request.data ?? {}) as JoinInput;
  const sessionId = input.sessionId?.trim() ?? "";
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Sessão inválida.");
  }
  const cpfFromRequest =
    typeof input.cpfCnpj === "string" ? input.cpfCnpj :
      (typeof input.cpf === "string" ? input.cpf : "");

  const db = getFirestore();
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const participantRef = sessionRef.collection(CLUB_PARTICIPANTS).doc(uid);

  const display = await resolveAthleteDisplay(db, uid);
  const nowMs = Date.now();
  const paymentExpiresAt = Timestamp.fromMillis(
    nowMs + ARENA_BOOKING_PAYMENT_EXPIRY_MINUTES * 60 * 1000,
  );

  // Reserva a vaga em transação (held enquanto pending_payment).
  const txResult = await db.runTransaction(async (tx: Transaction) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
    }
    const session = readSessionForJoin(sessionSnap.data() as Record<string, unknown>);
    if (session.status !== "scheduled") {
      throw new HttpsError("failed-precondition", "Esta sessão não está mais aberta.");
    }
    if (session.startAtMs != null && nowMs >= session.startAtMs) {
      throw new HttpsError("failed-precondition", "Esta sessão já começou.");
    }
    if (!(session.priceReais > 0)) {
      throw new HttpsError("failed-precondition", "Sessão sem valor configurado.");
    }

    const participantSnap = await tx.get(participantRef);
    const existing = participantSnap.exists ?
      (participantSnap.data() as Record<string, unknown>) :
      null;
    const existingStatus = existing ? String(existing["status"] ?? "") : "";

    if (existingStatus === "confirmed") {
      throw new HttpsError("already-exists", "Você já está na lista desta sessão.");
    }
    if (
      existing &&
      existingStatus !== "pending_payment" &&
      !REJOINABLE_STATUSES.has(existingStatus)
    ) {
      throw new HttpsError("failed-precondition", "Sua vaga nesta sessão já foi encerrada.");
    }

    const alreadyHeld = existingStatus === "pending_payment";
    if (!alreadyHeld && session.confirmedCount + session.pendingCount >= session.capacity) {
      throw new HttpsError("resource-exhausted", "A lista desta sessão está cheia.");
    }

    tx.set(participantRef, {
      athleteId: uid,
      athleteName: display.name,
      athletePhotoUrl: display.photoUrl,
      clubId: session.clubId,
      arenaId: session.arenaId,
      arenaName: session.arenaName,
      clubName: session.clubName,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      startAt: sessionSnap.data()!["startAt"] ?? null,
      status: "pending_payment",
      amountReais: session.priceReais,
      platformFeeReais: null,
      netReais: null,
      asaasPaymentId: existing?.["asaasPaymentId"] ?? null,
      pixCopyPaste: null,
      paymentExpiresAt,
      refundStatus: "none",
      joinedAt: existing?.["joinedAt"] ?? FieldValue.serverTimestamp(),
      confirmedAt: null,
      canceledAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (!alreadyHeld) {
      tx.set(sessionRef, {pendingCount: session.pendingCount + 1}, {merge: true});
    }

    return {
      session,
      previousAsaasPaymentId: typeof existing?.["asaasPaymentId"] === "string" ?
        (existing["asaasPaymentId"] as string).trim() :
        "",
    };
  });

  const {session, previousAsaasPaymentId} = txResult;

  // Cobrança PIX fora da transação (padrão de createArenaBookingPixPayment).
  const rollbackHold = async () => {
    try {
      await db.runTransaction(async (tx: Transaction) => {
        const snap = await tx.get(participantRef);
        if (!snap.exists) return;
        if (String(snap.data()?.["status"]) !== "pending_payment") return;
        const sessionSnap = await tx.get(sessionRef);
        const pending = Number(sessionSnap.data()?.["pendingCount"] ?? 0);
        tx.set(participantRef, {
          status: "canceled",
          canceledAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        tx.set(sessionRef, {pendingCount: Math.max(0, pending - 1)}, {merge: true});
      });
    } catch (e) {
      logger.error("joinArenaClubSession: rollback falhou", {sessionId, uid, error: e});
    }
  };

  try {
    if (previousAsaasPaymentId) {
      await deleteAsaasPaymentIfOpen(previousAsaasPaymentId);
    }

    let payerEmail = "pagamento@nexago.app";
    let payerName: string | undefined;
    try {
      const user = await getAuth().getUser(uid);
      if (user.email?.trim()) payerEmail = user.email.trim();
      payerName = user.displayName?.trim() || undefined;
    } catch {
      // fallback
    }

    let cpfCnpj: string;
    try {
      cpfCnpj = await resolveAthleteCpfCnpj(uid, cpfFromRequest);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "ASAAS_CUSTOMER_CPF_REQUIRED") {
        throw new HttpsError("failed-precondition", "Informe seu CPF para pagar com PIX.");
      }
      throw e;
    }

    const customerId = await getOrCreateAsaasCustomer(uid, payerEmail, payerName, cpfCnpj);

    const description =
      `Clubinho ${session.clubName} — ${session.arenaName} (${session.date} ${session.startTime})`;

    const charge = await createAsaasPixCharge({
      customerId,
      valueReais: roundMoney(session.priceReais),
      dueDate: paymentExpiresAt.toDate(),
      description,
      externalReference: clubSessionPaymentRef(sessionId, uid),
      idempotencyKey: `club-join-${sessionId}-${uid}-${nowMs}`,
    });

    await participantRef.set({
      asaasPaymentId: charge.paymentId,
      pixCopyPaste: charge.qrCode,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    return {
      sessionId,
      paymentId: charge.paymentId,
      qrCode: charge.qrCode,
      qrCodeBase64: charge.qrCodeBase64,
      pixCopyPaste: charge.qrCode,
      expiresAt: paymentExpiresAt.toDate().toISOString(),
      amountReais: roundMoney(session.priceReais),
    };
  } catch (e) {
    await rollbackHold();
    if (e instanceof HttpsError) throw e;
    if (e instanceof AsaasApiError) {
      logger.error("joinArenaClubSession Asaas failed:", e.httpStatus, e.body);
      const hint = e.message.toLowerCase();
      if (hint.includes("cpf") || hint.includes("cnpj")) {
        throw new HttpsError("failed-precondition", e.message);
      }
      throw new HttpsError("internal", "Não foi possível gerar o PIX. Tente novamente.");
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ASAAS_API_KEY_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "Pagamento online temporariamente indisponível.",
      );
    }
    if (msg === "ASAAS_PIX_QR_MISSING") {
      throw new HttpsError(
        "failed-precondition",
        "PIX criado, mas o QR Code ainda não está disponível. Tente novamente em instantes.",
      );
    }
    logger.error("joinArenaClubSession failed", {sessionId, uid, error: e});
    throw new HttpsError("internal", "Não foi possível entrar na lista. Tente novamente.");
  }
});

// ---------------------------------------------------------------------------
// leaveArenaClubSession
// ---------------------------------------------------------------------------

interface LeaveInput {
  sessionId?: string;
}

export const leaveArenaClubSession = onCall({
  secrets: asaasArenaSecrets,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as LeaveInput;
  const sessionId = input.sessionId?.trim() ?? "";
  if (!sessionId) {
    throw new HttpsError("invalid-argument", "Sessão inválida.");
  }

  const db = getFirestore();
  const sessionRef = db.collection(ARENA_CLUB_SESSIONS).doc(sessionId);
  const participantRef = sessionRef.collection(CLUB_PARTICIPANTS).doc(uid);

  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) {
    throw new HttpsError("not-found", "Você não está na lista desta sessão.");
  }
  const participant = participantSnap.data() as Record<string, unknown>;
  const status = String(participant["status"] ?? "");
  const asaasPaymentId = typeof participant["asaasPaymentId"] === "string" ?
    (participant["asaasPaymentId"] as string).trim() :
    "";

  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    throw new HttpsError("not-found", "Sessão do clubinho não encontrada.");
  }
  const session = readSessionForJoin(sessionSnap.data() as Record<string, unknown>);

  if (status === "pending_payment") {
    if (asaasPaymentId) await deleteAsaasPaymentIfOpen(asaasPaymentId);
    await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(participantRef);
      if (String(snap.data()?.["status"]) !== "pending_payment") return;
      const sSnap = await tx.get(sessionRef);
      const pending = Number(sSnap.data()?.["pendingCount"] ?? 0);
      tx.set(participantRef, {
        status: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(sessionRef, {pendingCount: Math.max(0, pending - 1)}, {merge: true});
    });
    return {sessionId, status: "canceled", refunded: false};
  }

  if (status !== "confirmed") {
    throw new HttpsError("failed-precondition", "Sua vaga nesta sessão já foi encerrada.");
  }
  if (session.status !== "scheduled") {
    throw new HttpsError(
      "failed-precondition",
      "Esta sessão foi cancelada — o estorno já está sendo processado pela arena.",
    );
  }

  // Prazo de cancelamento com estorno (configurado por clubinho).
  const nowMs = Date.now();
  if (session.startAtMs != null) {
    const deadlineMs = session.startAtMs - session.cancelWindowHours * 60 * 60 * 1000;
    if (nowMs > deadlineMs) {
      throw new HttpsError(
        "failed-precondition",
        session.cancelWindowHours > 0 ?
          `O prazo para sair com estorno é de ${session.cancelWindowHours}h antes do início.` :
          "Esta sessão já começou.",
      );
    }
  }

  // 1. Estorno no Asaas (falhou → nada muda; atleta pode tentar de novo).
  if (asaasPaymentId) {
    try {
      await refundAsaasPayment(asaasPaymentId);
    } catch (e) {
      logger.error("leaveArenaClubSession: refund falhou", {sessionId, uid, error: e});
      await participantRef.set({refundStatus: "failed"}, {merge: true});
      throw new HttpsError(
        "internal",
        "Não foi possível estornar o PIX agora. Tente novamente em instantes.",
      );
    }
  }

  // 2. Libera a vaga e marca o estorno.
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(participantRef);
    if (String(snap.data()?.["status"]) !== "confirmed") return;
    const sSnap = await tx.get(sessionRef);
    const confirmed = Number(sSnap.data()?.["confirmedCount"] ?? 0);
    tx.set(participantRef, {
      status: "canceled_refunded",
      refundStatus: "done",
      canceledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    tx.set(sessionRef, {confirmedCount: Math.max(0, confirmed - 1)}, {merge: true});
  });

  // 3. Reversão do crédito na carteira da arena.
  const netReais = Number(participant["netReais"] ?? 0);
  if (netReais > 0) {
    try {
      await debitArenaWalletForClubRefund(db, session.arenaId, {
        sessionId,
        participantId: uid,
        netReais,
      });
    } catch (e) {
      logger.error("leaveArenaClubSession: débito da carteira falhou", {sessionId, uid, error: e});
    }
  }

  try {
    await deliverNotificationToUser({
      userId: uid,
      title: "Você saiu da lista",
      body: `Sua vaga no ${session.clubName} (${session.date}) foi cancelada e o PIX ` +
        "será estornado automaticamente.",
      type: "club_leave_refunded",
      data: {clubSessionId: sessionId, arenaId: session.arenaId},
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn("leaveArenaClubSession: notificação falhou", {sessionId, uid, error: e});
  }

  return {sessionId, status: "canceled_refunded", refunded: true};
});

// ---------------------------------------------------------------------------
// Expiração de PIX pendente (vaga volta para a lista)
// ---------------------------------------------------------------------------

export const expireArenaClubPendingPayments = onSchedule({
  schedule: "every 1 minutes",
  secrets: asaasArenaSecrets,
}, async () => {
  const db = getFirestore();
  const now = Timestamp.now();
  const snap = await db
    .collectionGroup(CLUB_PARTICIPANTS)
    .where("status", "==", "pending_payment")
    .where("paymentExpiresAt", "<", now)
    .limit(50)
    .get();

  for (const doc of snap.docs) {
    const participant = doc.data();
    const sessionRef = doc.ref.parent.parent;
    if (!sessionRef) continue;
    try {
      const asaasId = (participant["asaasPaymentId"] as string | undefined)?.trim();
      if (asaasId) await deleteAsaasPaymentIfOpen(asaasId);

      await db.runTransaction(async (tx: Transaction) => {
        const pSnap = await tx.get(doc.ref);
        if (String(pSnap.data()?.["status"]) !== "pending_payment") return;
        const sSnap = await tx.get(sessionRef);
        const pending = Number(sSnap.data()?.["pendingCount"] ?? 0);
        tx.set(doc.ref, {
          status: "expired",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        if (sSnap.exists) {
          tx.set(sessionRef, {pendingCount: Math.max(0, pending - 1)}, {merge: true});
        }
      });
      logger.info(`expireArenaClubPendingPayments: expirado ${doc.ref.path}`);
    } catch (e) {
      logger.error(`expireArenaClubPendingPayments: falha ${doc.ref.path}`, e);
    }
  }
});
