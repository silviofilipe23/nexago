/**
 * Estorno de um pagamento que teve cashback (`PAYMENT_REFUNDED`): o do
 * clubinho (`leaveArenaClubSession`, sessão cancelada) e qualquer estorno
 * feito à mão no painel do Asaas. Roda pelo roteador, fora dos handlers —
 * eles param no "já processado".
 *
 * Lote do pagamento: pendente é cancelado; disponível perde o que resta.
 * Saldo usado no pagamento: volta aos lotes de origem.
 */
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {refundCapturedHold, reverseLot} from "./athlete-wallet";
import {athleteWalletRef, type HoldDoc} from "./athlete-wallet-state";
import type {CashbackIntent} from "./cashback-intent";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {parseClubSessionPaymentRef} from "./arena-club-constants";
import {parseTournamentRegistrationExternalReference} from "./tournament-registration-pix-helpers";

/**
 * Devolve a reserva de saldo DESTE pagamento — a que o servidor ligou a ele
 * (`asaasPaymentId`), aberta ou já capturada (inclusive pela varredura de
 * 5 min, que captura quando o Asaas diz pago antes de o webhook chegar). Para
 * os caminhos em que o dinheiro volta (ou nunca vira serviço) em vez de ser
 * consumido. Idempotente (`refundCapturedHold` só age em aberta/capturada);
 * nunca lança. Devolve quantas reservas voltaram.
 */
export async function refundHoldOfPayment(
  db: Firestore,
  uid: string,
  paymentId: string,
  nowMs: number,
): Promise<number> {
  if (!uid || !paymentId) return 0;
  try {
    const snap = await athleteWalletRef(db, uid)
      .collection("holds")
      .where("asaasPaymentId", "==", paymentId)
      .get();
    let returned = 0;
    for (const doc of snap.docs) {
      const status = (doc.data() as HoldDoc).status;
      if (status !== "open" && status !== "captured") continue;
      await refundCapturedHold(db, uid, doc.id, nowMs);
      returned++;
    }
    if (returned > 0) {
      logger.info("cashback: saldo de pagamento sem consumo devolvido", {uid, paymentId, returned});
    }
    return returned;
  } catch (e) {
    logger.error("cashback: falha ao devolver o saldo do pagamento estornado", {
      uid,
      paymentId,
      error: String(e),
    });
    return 0;
  }
}

/**
 * Pagador de um pagamento sem intenção: pela referência da cobrança (gravada
 * pelo servidor na criação) ou pelo processado. Reserva de quadra lê o titular
 * — gravável, mas a reserva de saldo só é achada na carteira de quem tem uma
 * ligada a ESTE pagamento, então um titular forjado não acha nada.
 */
async function payerUidOfPayment(
  db: Firestore,
  processed: Record<string, unknown>,
  externalReference: string,
): Promise<string> {
  const registration = parseTournamentRegistrationExternalReference(externalReference);
  if (registration) return registration.payerUid;
  const club = parseClubSessionPaymentRef(externalReference);
  if (club) return club.athleteUid;
  if (typeof processed.payerUid === "string" && processed.payerUid) return processed.payerUid;
  if (processed.kind === "arenaClubSession" && typeof processed.participantId === "string") {
    return processed.participantId;
  }
  const bookingId = externalReference.startsWith(ARENA_BOOKING_PAYMENT_REF_PREFIX) ?
    externalReference.slice(ARENA_BOOKING_PAYMENT_REF_PREFIX.length).trim() :
    (processed.kind === "arenaBooking" && typeof processed.bookingId === "string" ? processed.bookingId : "");
  if (!bookingId) return "";
  const athleteId = (await db.collection("arenaBookings").doc(bookingId).get()).data()?.athleteId;
  return typeof athleteId === "string" ? athleteId : "";
}

export async function reverseCashbackForPayment(
  db: Firestore,
  processedRef: DocumentReference,
  paymentId: string,
  nowMs: number,
  opts: {externalReference?: string} = {},
): Promise<"reversed" | "skipped"> {
  const data = (await processedRef.get()).data() ?? {};
  const intent = data.cashback as CashbackIntent | undefined;
  if (!intent) {
    // Sem intenção não há lote, mas pode haver saldo usado: reserva capturada
    // pela varredura (webhook perdido ou que estornou em vez de consumir).
    // Nada é gravado no processado — um doc criado aqui faria o handler tratar
    // um evento futuro deste pagamento como "já processado".
    const uid = await payerUidOfPayment(db, data, (opts.externalReference ?? "").trim());
    return (await refundHoldOfPayment(db, uid, paymentId, nowMs)) > 0 ? "reversed" : "skipped";
  }
  if (intent.reversedAtMs != null) return "skipped";
  // Primeiro tira a intenção da fila: aplicada depois do estorno, ela capturaria
  // a reserva devolvida aqui e criaria o lote de um pagamento que não existe mais.
  // "reversing" (em vez de já ir para "reversed") deixa a varredura retomar se o
  // processo cair no meio — as operações abaixo são idempotentes, então rodar de
  // novo num doc já em "reversing" não tem efeito duplicado.
  await processedRef.set({cashbackStatus: "reversing"}, {merge: true});
  const lotOutcome = await reverseLot(db, intent.uid, paymentId, nowMs);
  const restoredCents = intent.holdId ?
    await refundCapturedHold(db, intent.uid, intent.holdId, nowMs) :
    0;
  await processedRef.set(
    {cashbackStatus: "reversed", cashback: {reversedAtMs: nowMs}},
    {merge: true},
  );
  logger.info("cashback: pagamento estornado", {
    paymentId,
    uid: intent.uid,
    lotOutcome,
    restoredCents,
  });
  return "reversed";
}
