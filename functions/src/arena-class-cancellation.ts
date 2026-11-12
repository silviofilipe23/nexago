/**
 * Cancelamento do plano de aula — callables (canvas "Cancelar plano de aula · aviso prévio e multa").
 *
 * Aluno (app): `previewMyClassCancellation` → `cancelMyClassEnrollment`. Cancelar vale na hora: a
 * matrícula ganha `endsOn` (fim do aviso ou do período pago) e segue com aulas e mensalidades até
 * lá; o agendador diário tira o aluno da turma depois. A multa (quebra de fidelidade) vira a
 * cobrança `{matrícula}_penalty` (vence em 3 dias); online quando a matrícula cobra online.
 * Não pagar não desfaz o cancelamento.
 *
 * Arena (portal, área `agenda`): `waiveClassCancellationPenalty` (isentar, com motivo) e
 * `undoClassCancellation` (desfazer: volta ao normal e cancela a multa em aberto). "Encerrar agora"
 * é o cancelamento normal da matrícula (`setArenaClassEnrollmentStatus`).
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser} from "./notification-delivery";
import {ARENA_CLASS_ASAAS_PAYMENTS, ARENA_CLASS_CHARGES, ARENA_CLASS_ENROLLMENTS, PREPAID_MONTHS, parseBillingMode} from "./arena-class-constants";
import {classAsaasGroupData} from "./arena-class-asaas-model";
import {openChargeData, parseCycle, requestGroupVoid, studentAgreementId} from "./arena-class-billing";
import {ARENA_AGREEMENTS} from "./arena-agreements-model";
import {
  CANCEL_REASON_LABEL,
  cancellationQuote,
  parseCancelReason,
  parseCancellationPolicy,
  penaltyChargeId,
  type CancellationQuote,
} from "./arena-class-cancellation-model";
import {requireClassManager, requireUid, str} from "./arena-class";
import {dayKeyFromEventDate} from "./event-timezone";

type Data = Record<string, unknown>;

function rec(v: unknown): Data {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
}

/** Conta do cancelamento a partir da matrícula (regras congeladas nela; antiga sem regra = padrão). */
export function quoteForEnrollment(e: Data, todayKey: string): CancellationQuote {
  const plan = rec(e["plan"]);
  const cycle = parseCycle(e["cycle"]);
  return cancellationQuote({
    policy: parseCancellationPolicy(e["cancellationPolicy"]),
    planKind: str(plan["kind"]) || "monthly",
    prepaidMonths: Number(e["prepaidMonths"] ?? PREPAID_MONTHS[cycle]) || 1,
    commitmentEndsOn: typeof e["commitmentEndsOn"] === "string" ? e["commitmentEndsOn"] : null,
    billedThrough: typeof e["billedThrough"] === "string" ? e["billedThrough"] : null,
    expiresOn: typeof e["expiresOn"] === "string" ? e["expiresOn"] : null,
    monthlyPriceReais: Number(plan["priceReais"] ?? 0),
    todayKey,
  });
}

async function myEnrollment(db: Firestore, uid: string, enrollmentId: string) {
  if (!enrollmentId || enrollmentId.includes("/")) throw new HttpsError("invalid-argument", "Matrícula inválida.");
  const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
  const snap = await ref.get();
  const e = snap.data();
  if (!e || e["athleteId"] !== uid) throw new HttpsError("not-found", "Matrícula não encontrada.");
  return {ref, e};
}

function assertCancellable(e: Data): void {
  if (e["status"] !== "active" && e["status"] !== "paused") {
    throw new HttpsError("failed-precondition", "Este plano não está ativo.");
  }
  if (typeof e["endsOn"] === "string") {
    throw new HttpsError("failed-precondition", `O cancelamento já está agendado para ${e["endsOn"]}.`);
  }
}

export async function previewCancellationCore(db: Firestore, uid: string, input: Data, todayKey: string) {
  const {e} = await myEnrollment(db, uid, str(input["enrollmentId"]));
  assertCancellable(e);
  return {...quoteForEnrollment(e, todayKey), planName: str(rec(e["plan"])["name"]) || "Plano"};
}

export const previewMyClassCancellation = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  previewCancellationCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data, dayKeyFromEventDate(new Date())));

export async function cancelMyEnrollmentCore(db: Firestore, uid: string, input: Data, now: Date) {
  const enrollmentId = str(input["enrollmentId"]);
  const reason = parseCancelReason(input["reason"]);
  const note = str(input["note"]).slice(0, 280) || null;
  const todayKey = dayKeyFromEventDate(now);
  const at = Timestamp.fromDate(now);
  const {ref} = await myEnrollment(db, uid, enrollmentId);
  const result = await db.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data() as Data;
    assertCancellable(e);
    const quote = quoteForEnrollment(e, todayKey);
    const agreementRef = db.collection(ARENA_AGREEMENTS).doc(studentAgreementId(enrollmentId));
    const agreement = await tx.get(agreementRef);
    tx.set(ref, {
      endsOn: quote.endsOn,
      cancelRequest: {
        requestedAt: at, requestedOn: todayKey, by: "athlete", reason, note,
        kind: quote.kind, remainingMonths: quote.remainingMonths, penaltyReais: quote.penalty.amountReais,
        penaltyStatus: quote.penalty.amountReais > 0 ? "open" : "none",
      },
      updatedAt: at,
    }, {merge: true});
    let chargeId: string | null = null;
    if (quote.penalty.amountReais > 0) {
      chargeId = penaltyChargeId(enrollmentId);
      const online = parseBillingMode(e["billingMode"]) === "asaas";
      const charge = {
        id: chargeId,
        description: `Multa por cancelamento · ${str(rec(e["plan"])["name"]) || "plano"} (${quote.remainingMonths} mensalidade${quote.remainingMonths === 1 ? "" : "s"} da fidelidade)`,
        period: null,
        amountReais: quote.penalty.amountReais,
        dueDate: quote.penaltyDueDate ?? todayKey,
      };
      const owner = {
        arenaId: e["arenaId"], studentId: e["studentId"], athleteId: e["athleteId"],
        name: e["name"], phone: e["phone"], paymentMethod: e["paymentMethod"],
      };
      tx.set(db.collection(ARENA_CLASS_CHARGES).doc(chargeId), {
        ...openChargeData(enrollmentId, owner, charge, online ? chargeId : null),
        kind: "cancellation_penalty",
      });
      if (online) {
        tx.set(db.collection(ARENA_CLASS_ASAAS_PAYMENTS).doc(chargeId), classAsaasGroupData({
          arenaId: str(e["arenaId"]), enrollmentId, studentId: str(e["studentId"]),
          athleteId: typeof e["athleteId"] === "string" ? e["athleteId"] : null, name: str(e["name"]),
        }, [charge]));
      }
    }
    if (agreement.exists) {
      tx.set(agreementRef, {endsOn: quote.endsOn, cancelRequestedAt: at, updatedAt: at}, {merge: true});
    }
    return {quote, chargeId, arenaId: str(e["arenaId"]), name: str(e["name"]), planName: str(rec(e["plan"])["name"]),
      online: parseBillingMode(e["billingMode"]) === "asaas"};
  });
  // A arena fica sabendo (o dono; gestores acompanham pela tela de Cancelamentos).
  try {
    const arena = (await db.collection("arenas").doc(result.arenaId).get()).data() ?? {};
    const owner = str(arena["managerUserId"]) || str(arena["ownerId"]);
    if (owner) {
      await deliverNotificationToUser({
        userId: owner,
        title: "Pedido de cancelamento",
        body: `${result.name} cancelou ${result.planName}. Última aula em ${result.quote.endsOn.split("-").reverse().join("/")}` +
          (result.quote.penalty.amountReais > 0 ? `; multa de R$ ${result.quote.penalty.amountReais.toFixed(2).replace(".", ",")}.` : "."),
        type: "arena_class_cancellation",
        data: {arenaId: result.arenaId, enrollmentId, webUrl: "/painel/aulas/cancelamentos"},
        requireInteraction: false,
      });
    }
  } catch (error) {
    logger.warn("cancelMyClassEnrollment: aviso à arena falhou", {enrollmentId, error});
  }
  logger.info("cancelMyClassEnrollment", {enrollmentId, reason, endsOn: result.quote.endsOn, penalty: result.quote.penalty.amountReais});
  return {
    ...result.quote,
    reasonLabel: CANCEL_REASON_LABEL[reason],
    penaltyChargeId: result.chargeId,
    penaltyOnline: result.chargeId != null && result.online,
  };
}

export const cancelMyClassEnrollment = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  cancelMyEnrollmentCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data, new Date()));

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

async function staffEnrollment(db: Firestore, uid: string, enrollmentId: string) {
  if (!enrollmentId || enrollmentId.includes("/")) throw new HttpsError("invalid-argument", "Matrícula inválida.");
  const ref = db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId);
  const e = (await ref.get()).data();
  if (!e) throw new HttpsError("not-found", "Matrícula não encontrada.");
  await requireClassManager(db, str(e["arenaId"]), uid);
  return {ref, e};
}

/** Cancela a multa em aberto (e a fatura online dela). */
function voidPenalty(tx: FirebaseFirestore.Transaction, db: Firestore, enrollmentId: string, charge: FirebaseFirestore.DocumentSnapshot, at: Timestamp, reason: string): boolean {
  if (!charge.exists || charge.data()?.["status"] !== "open") return false;
  tx.set(charge.ref, {status: "canceled", canceledAt: at, cancelReason: reason}, {merge: true});
  if (parseBillingMode(charge.data()?.["billingMode"]) === "asaas") requestGroupVoid(tx, db, penaltyChargeId(enrollmentId), reason);
  return true;
}

export async function waivePenaltyCore(db: Firestore, uid: string, input: Data, now: Date) {
  const enrollmentId = str(input["enrollmentId"]);
  const reason = str(input["reason"]).slice(0, 280);
  if (reason.length < 3) throw new HttpsError("invalid-argument", "Conte o motivo da isenção.");
  const {ref} = await staffEnrollment(db, uid, enrollmentId);
  const at = Timestamp.fromDate(now);
  return db.runTransaction(async (tx) => {
    const charge = await tx.get(db.collection(ARENA_CLASS_CHARGES).doc(penaltyChargeId(enrollmentId)));
    const current = (await tx.get(ref)).data() ?? {};
    if (!voidPenalty(tx, db, enrollmentId, charge, at, "waived")) {
      throw new HttpsError("failed-precondition", "Não há multa em aberto para isentar.");
    }
    tx.set(ref, {
      cancelRequest: {...rec(current["cancelRequest"]), penaltyStatus: "waived", waivedBy: uid, waivedReason: reason, waivedAt: at},
      updatedAt: at,
    }, {merge: true});
    return {status: "waived"};
  });
}

export const waiveClassCancellationPenalty = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  waivePenaltyCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data, new Date()));

export async function undoCancellationCore(db: Firestore, uid: string, input: Data, now: Date) {
  const enrollmentId = str(input["enrollmentId"]);
  const {ref} = await staffEnrollment(db, uid, enrollmentId);
  const at = Timestamp.fromDate(now);
  return db.runTransaction(async (tx) => {
    const e = (await tx.get(ref)).data() as Data;
    if (typeof e["endsOn"] !== "string") throw new HttpsError("failed-precondition", "Não há cancelamento agendado.");
    if (e["status"] !== "active" && e["status"] !== "paused") {
      throw new HttpsError("failed-precondition", "A matrícula já foi encerrada — faça uma nova.");
    }
    const charge = await tx.get(db.collection(ARENA_CLASS_CHARGES).doc(penaltyChargeId(enrollmentId)));
    const agreementRef = db.collection(ARENA_AGREEMENTS).doc(studentAgreementId(enrollmentId));
    const agreement = await tx.get(agreementRef);
    const penaltyPaid = charge.exists && charge.data()?.["status"] === "paid";
    voidPenalty(tx, db, enrollmentId, charge, at, "cancellation_undone");
    tx.set(ref, {
      endsOn: null,
      cancelRequest: null,
      cancelUndone: {at, by: uid, penaltyPaid},
      updatedAt: at,
    }, {merge: true});
    if (agreement.exists) tx.set(agreementRef, {endsOn: null, updatedAt: at}, {merge: true});
    // Multa já paga não volta sozinha: a arena devolve por fora se quiser (fica registrado).
    return {status: "active", penaltyPaid};
  });
}

export const undoClassCancellation = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  undoCancellationCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data, new Date()));
