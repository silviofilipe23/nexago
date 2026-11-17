/**
 * Loja × NexaSquad: o código de embaixador no checkout da Loja.
 *
 *   cotação/pedido ──► resolveStoreSquad   (código digitado vence o link; Loja precisa estar
 *                                           ligada na regra global, no nível e no contrato)
 *   pedido criado ───► recordStoreSquadQuietly (desconto `kind: store` + comissão pendente da
 *                                           1ª compra na Loja)
 *   pedido muda ─────► syncStoreSquadOnOrderWriteCore (pago → comissão liberada e desconto usado;
 *                                           cancelado sem pagar → comissão cancelada)
 *
 * Um desconto só por pedido: o maior entre o cupom da Loja e o embaixador (`pickPromo`). Quando o
 * cupom vence, o pedido sai sem embaixador. Regras em
 * `docs/superpowers/specs/2026-11-17-loja-codigo-de-embaixador-design.md`.
 *
 * Tudo aqui é melhor esforço depois que o pedido existe: o Squad nunca derruba a compra.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore} from "firebase-admin/firestore";
import {resolveRegistrationAttribution, type ResolvedAttribution} from "./squad-attribution";
import {
  applySquadPaymentEvent,
  createStoreCommission,
  followerPctOf,
  markChargeDiscountConfirmed,
  payerUsedDiscount,
  recordChargeDiscount,
} from "./squad-commission-lifecycle";
import {loadAttributionRules} from "./squad-rules";
import type {Quote, SquadOffer} from "./store-checkout-price";

const ORDERS = "storeOrders";

export interface StoreSquadResolution {
  squad: SquadOffer | null;
  squadError: {code: string; message: string} | null;
  attribution: ResolvedAttribution | null;
}

const NONE: StoreSquadResolution = {squad: null, squadError: null, attribution: null};

/**
 * Indicação desta compra na Loja. Código digitado que não vale vira `squadError` (texto do servidor
 * para o campo); falha de leitura vira "sem embaixador", nunca erro de checkout.
 */
export async function resolveStoreSquad(db: Firestore, uid: string, typedCode: unknown, now: Date): Promise<StoreSquadResolution> {
  const typed = typeof typedCode === "string" ? typedCode.trim().toUpperCase() : "";
  let attribution: ResolvedAttribution | null;
  try {
    attribution = await resolveRegistrationAttribution(
      db, {payerUid: uid, athleteUids: [uid], typedCode: typed, purpose: "store"}, now,
    );
  } catch (e) {
    if (e instanceof HttpsError && typed) return {...NONE, squadError: {code: typed, message: e.message}};
    logger.warn("Loja: indicação do Squad indisponível", {uid, error: String(e)});
    return NONE;
  }
  if (!attribution) return NONE;
  try {
    const rules = await loadAttributionRules(db);
    const used = rules.followerDiscountFirstOnly && await payerUsedDiscount(db, uid, "store");
    const pct = used ? 0 : await followerPctOf(db, attribution.ambassador);
    const {ambassador, origin} = attribution;
    return {
      attribution,
      squadError: null,
      squad: {ambassadorId: ambassador.uid, ambassadorName: ambassador.displayName, code: ambassador.code, origin, pct},
    };
  } catch (e) {
    logger.warn("Loja: desconto do Squad indisponível", {uid, error: String(e)});
    return NONE;
  }
}

/** O bloco `squad` do pedido (só quando o embaixador entrou no pedido). */
export function orderSquadOf(quote: Quote, offer: SquadOffer | null | undefined): Record<string, unknown> | null {
  if (!quote.squad?.applied || !offer) return null;
  return {
    ambassadorId: offer.ambassadorId, code: offer.code, origin: offer.origin, pct: offer.pct,
    discountCents: quote.squadDiscountCents,
  };
}

/** Depois do pedido criado: registra o desconto (se houve) e a comissão pendente da 1ª compra. */
export async function recordStoreSquadQuietly(
  db: Firestore,
  input: {
    orderId: string; orderNumber: string; paymentId: string; uid: string;
    quote: Quote; attribution: ResolvedAttribution | null;
  },
  now: Date,
): Promise<void> {
  const {quote, attribution} = input;
  if (!quote.squad?.applied || !attribution) return;
  try {
    if (quote.squadDiscountCents > 0) {
      await recordChargeDiscount(db, {
        paymentId: input.paymentId, payerUid: input.uid, ambassadorId: attribution.ambassador.uid,
        cents: quote.squadDiscountCents, pct: quote.squad.pct, kind: "store", sourceId: input.orderId,
      }, now);
    }
    await createStoreCommission(db, {
      orderId: input.orderId, orderNumber: input.orderNumber, paymentId: input.paymentId, payerUid: input.uid,
      totalCents: quote.totalCents,
      productsCents: Math.max(0, quote.totalCents - quote.shippingCents - quote.cardFeeCents),
      attribution,
    }, now);
  } catch (e) {
    logger.error("Loja: desconto/comissão do Squad não registrados", {orderId: input.orderId, error: String(e)});
  }
}

/**
 * A cada mudança do pedido (webhook, varredura, backoffice): pago → comissão liberada e desconto
 * contado como usado; cancelado sem pagar → comissão cancelada. Idempotente (o evento fica marcado).
 */
export async function syncStoreSquadOnOrderWriteCore(db: Firestore, orderId: string, now: Date): Promise<void> {
  const o = (await db.collection(ORDERS).doc(orderId).get()).data();
  const squad = o?.["squad"] as {discountCents?: number} | null | undefined;
  if (!o || !squad) return;
  const paymentId = String((o["charge"] as Record<string, unknown> | undefined)?.["paymentId"] ?? "");
  if (!paymentId) return;
  const commissionId = `store_${orderId}`;
  if (o["paidAt"]) {
    await applySquadPaymentEvent(db, {
      commissionId, paymentId, event: "confirmed", valueCents: Number(o["totalCents"] ?? 0),
    }, now);
    if ((squad.discountCents ?? 0) > 0) await markChargeDiscountConfirmed(db, paymentId, now);
    return;
  }
  if (o["status"] === "can") {
    await applySquadPaymentEvent(db, {commissionId, paymentId, event: "failed"}, now);
  }
}

/** Para o webhook da Loja: já com o líquido do Asaas; falha só vai pro log. */
export async function confirmStoreSquadQuietly(
  db: Firestore,
  input: {orderId: string; paymentId: string; valueCents: number; netValueCents: number | null},
  now: Date,
): Promise<void> {
  try {
    await applySquadPaymentEvent(db, {
      commissionId: `store_${input.orderId}`, paymentId: input.paymentId, event: "confirmed",
      valueCents: input.valueCents, netValueCents: input.netValueCents,
    }, now);
  } catch (e) {
    logger.error("Loja: comissão do Squad não liberada no webhook", {...input, error: String(e)});
  }
}
