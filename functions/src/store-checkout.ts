/**
 * Loja · checkout do atleta (web 03/04 · app 03/04/06/07): cotação, pedido com Pix, confirmação
 * do pagamento, Pix vencido e a visão do pedido para o atleta.
 *
 *   storeCarts/{uid}            — o que o atleta quer (gravável pelo dono; nada daqui é confiável)
 *   storeAddresses/{uid}        — endereços de entrega do atleta (só o dono)
 *   storeOrders/{id}            — o pedido do backoffice (só admin lê: CPF, código, reserva)
 *   storeOrderViews/{id}        — o pedido como o atleta vê (espelho saneado, por gatilho)
 *   storeCouponUses/{coupon_uid} — marcador do "uma vez por atleta" (reservado → usado; só servidor)
 *   storeCouponUses/{couponId}  — `reserved`: pedidos esperando o Pix com o cupom (entra no limite)
 *
 * O preço sai de `store-checkout-price.ts`; o pedido nasce em `createOrderCore` (reserva o
 * estoque) só DEPOIS da cobrança Pix existir. Contrato em `docs/business-rules/loja-checkout.md`.
 */
import {type Firestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";
import {HttpsError} from "firebase-functions/v2/https";
import {
  addressLine,
  priceCheckout,
  type CartLine,
  type CatalogProduct,
  type CheckoutAddress,
  type CheckoutChannel,
  type CheckoutDelivery,
  type CheckoutSnapshot,
  type CouponDoc,
  type PickupPoint,
  type Quote,
} from "./store-checkout-price";
import {withDiscountDefaults} from "./store-coupons";
import {CUSTOMIZATION, CUSTOM_ITEMS} from "./store-custom";
import {BLOCKLIST_DOC} from "./store-custom-cart";
import {historyEntry} from "./store-orders";
import {ORDERS, SYSTEM_ACTOR, createOrderCore, orderActionCore} from "./store-orders-write";
import {STORE_CONFIG, SHIPPING_CONFIG_ID, withShippingDefaults} from "./store-pickup";

type Data = Record<string, unknown>;

export const CARTS = "storeCarts";
export const ADDRESSES = "storeAddresses";
export const ORDER_VIEWS = "storeOrderViews";
export const COUPON_USES = "storeCouponUses";
const PRODUCTS = "storeProducts";
const COUPONS = "storeCoupons";
const COUPON_CODES = "storeCouponCodes";
const PICKUP_POINTS = "storePickupPoints";

/** Janela do Pix da Loja: depois disso o pedido cancela e o estoque volta. */
export const STORE_PIX_WINDOW_MS = 30 * 60 * 1000;
/** Prefixo do `externalReference` no Asaas — o webhook despacha por ele. */
export const STORE_ORDER_PAYMENT_REF_PREFIX = "storeOrder:";

const CHANNELS: CheckoutChannel[] = ["web", "app_ios", "app_android"];
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface CheckoutInput {
  channel: CheckoutChannel;
  delivery: CheckoutDelivery | null;
  couponCode: string | null;
}

export interface CreateCheckoutInput extends CheckoutInput {
  /** O total que o atleta viu; diferente do recalculado → `aborted` com a cotação nova. */
  expectedTotalCents: number;
  /** CPF digitado quando o perfil não tem (o Asaas exige). */
  cpf: string | null;
}

/** O que o checkout precisa do mundo de fora (Asaas, Auth). Injetável para teste. */
export interface CheckoutPayments {
  customer(uid: string, cpf: string | null): Promise<{
    name: string; email: string; phone: string; cpf: string; asaasCustomerId: string;
  }>;
  createPix(p: {
    orderId: string; customerId: string; totalCents: number; description: string; expiresAt: Date;
  }): Promise<{paymentId: string; copyPaste: string}>;
  cancelCharge(paymentId: string): Promise<void>;
}

function invalid(fields: string[], message = "Dados do checkout inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields});
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Valida a forma da entrada (o conteúdo é decidido na cotação). */
export function checkoutInputErrors(input: Partial<CheckoutInput> | null | undefined): string[] {
  const fields: string[] = [];
  if (!input || !CHANNELS.includes(input.channel as CheckoutChannel)) fields.push("channel");
  const d = input?.delivery;
  if (d != null) {
    if (d.type === "arena") {
      if (!ID_RE.test(str(d.arenaId, 128))) fields.push("delivery");
    } else if (d.type === "casa") {
      if (!ID_RE.test(str(d.addressId, 128)) || !ID_RE.test(str(d.modeId, 40))) fields.push("delivery");
    } else {
      fields.push("delivery");
    }
  }
  // Código fora do formato não derruba a cotação: vira "Cupom não encontrado" (o atleta remove).
  if (input?.couponCode != null && (typeof input.couponCode !== "string" || input.couponCode.length > 60)) {
    fields.push("couponCode");
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Leitura: carrinho + catálogo + config + entrega + cupom
// ---------------------------------------------------------------------------

export function cartLinesOf(data: Data | undefined): CartLine[] {
  const items = Array.isArray(data?.["items"]) ? (data!["items"] as Data[]) : [];
  return items
    .map((i) => ({
      productId: str(i?.["productId"], 128),
      skuId: str(i?.["skuId"], 120),
      qty: typeof i?.["qty"] === "number" ? Math.floor(i["qty"] as number) : 0,
      ...(str(i?.["lineId"], 128) ? {lineId: str(i["lineId"], 128)} : {}),
      ...(i?.["customization"] && typeof i["customization"] === "object" ? {customization: i["customization"] as Data} : {}),
    }))
    .filter((l) => l.productId !== "" && l.skuId !== "" && l.qty > 0);
}

export function addressesOf(data: Data | undefined): CheckoutAddress[] {
  const items = Array.isArray(data?.["items"]) ? (data!["items"] as Data[]) : [];
  return items.map((a) => ({
    id: str(a?.["id"], 128),
    label: str(a?.["label"], 40),
    recipient: str(a?.["recipient"], 120),
    phone: str(a?.["phone"], 40),
    zip: str(a?.["zip"], 12),
    street: str(a?.["street"], 160),
    number: str(a?.["number"], 20),
    complement: str(a?.["complement"], 120),
    district: str(a?.["district"], 120),
    city: str(a?.["city"], 80),
    uf: str(a?.["uf"], 2).toUpperCase(),
  })).filter((a) => a.id !== "" && a.street !== "" && a.city !== "" && /^[A-Z]{2}$/.test(a.uf));
}

export async function loadCheckoutSnapshot(
  db: Firestore,
  uid: string,
  input: CheckoutInput,
): Promise<CheckoutSnapshot> {
  const cartSnap = await db.collection(CARTS).doc(uid).get();
  const cart = cartLinesOf(cartSnap.data());
  const productIds = [...new Set(cart.map((l) => l.productId))];
  const catalog = new Map<string, CatalogProduct>();
  await Promise.all(productIds.map(async (id) => {
    const ref = db.collection(PRODUCTS).doc(id);
    const [snap, skus, custom] = await Promise.all([
      ref.get(), ref.collection("skus").get(), db.collection(CUSTOMIZATION).doc(id).get(),
    ]);
    if (!snap.exists) return;
    catalog.set(id, {
      data: snap.data()!,
      skus: new Map(skus.docs.map((d) => [d.id, d.data()])),
      customization: custom.exists ? custom.data()! : null,
    });
  }));

  const [discounts, shipping, blocklist] = await Promise.all([
    db.collection(STORE_CONFIG).doc("discounts").get(),
    db.collection(STORE_CONFIG).doc(SHIPPING_CONFIG_ID).get(),
    cart.some((l) => l.customization) ? db.doc(BLOCKLIST_DOC).get() : Promise.resolve(null),
  ]);
  const terms = blocklist?.data()?.["terms"];

  let pickupPoint: PickupPoint | null = null;
  let address: CheckoutAddress | null = null;
  const d = input.delivery;
  if (d?.type === "arena") {
    const p = await db.collection(PICKUP_POINTS).doc(d.arenaId).get();
    if (p.exists) {
      const data = p.data()!;
      pickupPoint = {
        arenaId: d.arenaId, name: str(data["name"], 120), active: data["active"] === true,
        locationId: str(data["locationId"], 64) || null,
      };
    }
  } else if (d?.type === "casa") {
    const a = await db.collection(ADDRESSES).doc(uid).get();
    address = addressesOf(a.data()).find((x) => x.id === d.addressId) ?? null;
  }

  let coupon: CouponDoc | null = null;
  const code = couponKey(input.couponCode);
  if (code) {
    const key = await db.collection(COUPON_CODES).doc(code).get();
    const couponId = str(key.data()?.["couponId"], 128);
    if (ID_RE.test(couponId)) {
      const [c, use, count] = await Promise.all([
        db.collection(COUPONS).doc(couponId).get(),
        db.collection(COUPON_USES).doc(`${couponId}_${uid}`).get(),
        db.collection(COUPON_USES).doc(couponId).get(),
      ]);
      if (c.exists) {
        coupon = {
          id: couponId, data: c.data()!,
          athleteUse: use.exists ? (use.data()?.["status"] === "reservado" ? "reservado" : "usado") : null,
          reserved: Math.max(0, Number(count.data()?.["reserved"] ?? 0) || 0),
        };
      }
    }
  }

  return {
    uid,
    blockedTerms: Array.isArray(terms) ? terms.filter((t): t is string => typeof t === "string") : [],
    cart, catalog,
    discounts: withDiscountDefaults(discounts.data()),
    shipping: withShippingDefaults(shipping.data()),
    pickupPoint, address, coupon,
  };
}

/** O código como chave de `storeCouponCodes` (só letras e números); fora disso, nenhum. */
function couponKey(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return /^[A-Z0-9]{1,20}$/.test(code) ? code : null;
}

// ---------------------------------------------------------------------------
// Reserva do cupom (pedido esperando o Pix)
// ---------------------------------------------------------------------------

export interface CouponReservation {
  couponId: string;
  /** Marcador do "uma vez por atleta" gravado junto. */
  marker: boolean;
  status: "reservado" | "usado" | "liberado";
}

/**
 * Segura o uso do cupom antes de cobrar: soma em `storeCouponUses/{couponId}.reserved` (entra no
 * limite) e, no "uma vez por atleta", grava o marcador como `reservado`. Em transação, para dois
 * pedidos ao mesmo tempo não passarem os dois.
 */
async function reserveCoupon(
  db: Firestore, couponId: string, uid: string, orderId: string, now: Date,
): Promise<CouponReservation> {
  const couponRef = db.collection(COUPONS).doc(couponId);
  const countRef = db.collection(COUPON_USES).doc(couponId);
  const markerRef = db.collection(COUPON_USES).doc(`${couponId}_${uid}`);
  return db.runTransaction(async (tx) => {
    const [c, count, marker] = await Promise.all([tx.get(couponRef), tx.get(countRef), tx.get(markerRef)]);
    const data = c.data() ?? {};
    const reserved = Math.max(0, Number(count.data()?.["reserved"] ?? 0) || 0);
    const limit = Number(data["usageLimit"] ?? 0) || 0;
    if (limit > 0 && (Number(data["uses"] ?? 0) || 0) + reserved >= limit) {
      throw new HttpsError("failed-precondition", "Esse cupom chegou ao limite de usos.", {reason: "coupon"});
    }
    const onePerAthlete = data["onePerAthlete"] === true;
    if (onePerAthlete && marker.exists) {
      throw new HttpsError("failed-precondition", marker.data()?.["status"] === "reservado" ?
        "Esse cupom está num pedido seu esperando o Pix." : "Você já usou esse cupom.", {reason: "coupon"});
    }
    tx.set(countRef, {reserved: reserved + 1, updatedAt: now}, {merge: true});
    if (onePerAthlete) tx.set(markerRef, {couponId, uid, orderId, status: "reservado", at: now});
    return {couponId, marker: onePerAthlete, status: "reservado" as const};
  });
}

/** Devolve a reserva (pedido não nasceu, ou cancelou sem pagar). Só mexe no que é desse pedido. */
async function releaseCoupon(db: Firestore, r: CouponReservation, uid: string, orderId: string, now: Date): Promise<void> {
  const countRef = db.collection(COUPON_USES).doc(r.couponId);
  const markerRef = db.collection(COUPON_USES).doc(`${r.couponId}_${uid}`);
  await db.runTransaction(async (tx) => {
    const [count, marker] = await Promise.all([tx.get(countRef), tx.get(markerRef)]);
    const reserved = Math.max(0, Number(count.data()?.["reserved"] ?? 0) || 0);
    tx.set(countRef, {reserved: Math.max(0, reserved - 1), updatedAt: now}, {merge: true});
    const m = marker.data();
    if (r.marker && m?.["orderId"] === orderId && m?.["status"] === "reservado") tx.delete(markerRef);
  });
}

/**
 * Gatilho do pedido: cancelado sem pagar (Pix vencido, backoffice) devolve o cupom reservado.
 * Idempotente pelo `couponReservation.status` do pedido.
 */
export async function releaseCouponOnCancelCore(db: Firestore, orderId: string, now: Date): Promise<boolean> {
  const ref = db.collection(ORDERS).doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const o = snap.data();
    const r = o?.["couponReservation"] as CouponReservation | undefined;
    if (!o || o["status"] !== "can" || o["paidAt"] || r?.status !== "reservado") return false;
    const uid = str((o["customer"] as Data | undefined)?.["uid"], 128);
    const countRef = db.collection(COUPON_USES).doc(r.couponId);
    const markerRef = db.collection(COUPON_USES).doc(`${r.couponId}_${uid}`);
    const [count, marker] = await Promise.all([tx.get(countRef), tx.get(markerRef)]);
    const reserved = Math.max(0, Number(count.data()?.["reserved"] ?? 0) || 0);
    tx.set(countRef, {reserved: Math.max(0, reserved - 1), updatedAt: now}, {merge: true});
    const m = marker.data();
    if (r.marker && m?.["orderId"] === orderId && m?.["status"] === "reservado") tx.delete(markerRef);
    tx.update(ref, {couponReservation: {...r, status: "liberado"}});
    return true;
  });
}

export async function quoteCheckoutCore(db: Firestore, uid: string, input: CheckoutInput, now: Date): Promise<Quote> {
  const fields = checkoutInputErrors(input);
  if (fields.length > 0) throw invalid(fields);
  const snap = await loadCheckoutSnapshot(db, uid, input);
  return priceCheckout(snap, input, now);
}

// ---------------------------------------------------------------------------
// Pedido com Pix
// ---------------------------------------------------------------------------

export interface CreateCheckoutResult {
  orderId: string;
  number: string;
  totalCents: number;
  pix: {copyPaste: string; expiresAt: string};
}

export async function createStoreOrderCore(
  db: Firestore,
  uid: string,
  input: CreateCheckoutInput,
  pay: CheckoutPayments,
  now: Date,
  newOrderId: () => string,
): Promise<CreateCheckoutResult> {
  const fields = checkoutInputErrors(input);
  if (!Number.isInteger(input?.expectedTotalCents) || input.expectedTotalCents < 0) fields.push("expectedTotalCents");
  if (fields.length > 0) throw invalid(fields);

  const snap = await loadCheckoutSnapshot(db, uid, input);
  const quote = priceCheckout(snap, input, now);
  if (quote.problems.length > 0) {
    throw new HttpsError("failed-precondition", "Revise o carrinho antes de pagar.", {problems: quote.problems, quote});
  }
  if (quote.coupon?.problem) {
    throw new HttpsError("failed-precondition", quote.coupon.message ?? "Cupom inválido.", {quote});
  }
  if (quote.totalCents !== input.expectedTotalCents) {
    throw new HttpsError("aborted", "Os valores do carrinho mudaram. Confira o novo total.", {quote});
  }
  if (quote.totalCents <= 0) {
    throw new HttpsError("failed-precondition", "O total do pedido precisa ser maior que zero.", {quote});
  }

  const buyer = await pay.customer(uid, input.cpf);
  const orderId = newOrderId();
  // Recusa no meio do caminho (cupom tomado, estoque acabou) volta com a cotação nova: a tela
  // marca a linha/o cupom em vez de deixar o "Pagar" liberado repetindo o mesmo erro.
  const withFreshQuote = async (e: unknown): Promise<unknown> => {
    if (!(e instanceof HttpsError) || e.code !== "failed-precondition") return e;
    const fresh = priceCheckout(await loadCheckoutSnapshot(db, uid, input), input, now);
    return new HttpsError(e.code, e.message, {...((e.details ?? {}) as Data), quote: fresh});
  };

  const couponId = quote.coupon?.problem === null ? quote.coupon.id : null;
  let reservation: CouponReservation | null = null;
  if (couponId) {
    try {
      reservation = await reserveCoupon(db, couponId, uid, orderId, now);
    } catch (e) {
      throw await withFreshQuote(e);
    }
  }
  const release = () => reservation ?
    releaseCoupon(db, reservation, uid, orderId, now).catch((err) =>
      logger.error("Loja: reserva do cupom não voltou", {orderId, couponId, error: String(err)})) :
    Promise.resolve();

  const expiresAt = new Date(now.getTime() + STORE_PIX_WINDOW_MS);
  let charge: {paymentId: string; copyPaste: string};
  try {
    charge = await pay.createPix({
      orderId, customerId: buyer.asaasCustomerId, totalCents: quote.totalCents,
      description: `Loja NexaGO · ${quote.units} ${quote.units === 1 ? "item" : "itens"}`, expiresAt,
    });
  } catch (e) {
    await release();
    throw e;
  }

  const d = input.delivery!;
  const point = snap.pickupPoint;
  const address = snap.address;
  const ship = d.type === "casa" ? snap.shipping.modes.find((m) => m.id === d.modeId) : null;
  const customLines = quote.lines
    .map((l, i) => ({line: l, cart: snap.cart[i]!}))
    .filter(({line}) => line.personalized)
    .map(({line, cart}) => ({
      key: line.key, productId: line.productId, skuId: line.skuId, qty: line.qty, productName: line.name,
      variantLabel: line.variantLabel, customization: cart.customization ?? null,
    }));

  let created: {orderId: string; number: string};
  try {
    created = await createOrderCore(db, {
      orderId,
      channel: input.channel,
      customer: {uid, name: buyer.name, email: buyer.email, phone: buyer.phone, cpf: buyer.cpf, level: null, orderIndex: null},
      items: quote.lines.map((l) => ({
        productId: l.productId, skuId: l.skuId, qty: l.qty, unitCents: l.unitCents,
        customization: l.personalized ? {name: l.customizationLabel ?? "Personalizada", artUrl: null, status: "aprovar"} : null,
      })),
      couponId: quote.coupon?.id ?? null,
      couponCode: quote.coupon?.code ?? null,
      couponDiscountCents: quote.coupon?.problem === null ? quote.coupon.discountCents : 0,
      pixDiscountCents: quote.pixDiscountCents,
      walletCents: 0,
      shippingCents: quote.shippingCents,
      payments: [{method: "pix", amountCents: quote.totalCents}],
      paid: false,
      pix: {copyPaste: charge.copyPaste, expiresAt},
      delivery: d.type === "arena" ?
        {type: "arena", locationId: point!.locationId!, pickupPointId: point!.arenaId} :
        {
          type: "casa", modeId: d.modeId, modeName: ship?.name ?? d.modeId, address: addressLine(address!),
          city: address!.city, uf: address!.uf, zip: address!.zip,
        },
      extra: {
        charge: {provider: "asaas", paymentId: charge.paymentId, method: "pix"},
        customLines,
        recipient: d.type === "casa" ? {name: address!.recipient, phone: address!.phone} : null,
        couponReservation: reservation,
      },
    }, {uid, name: buyer.name}, now);
  } catch (e) {
    // Sem pedido (estoque acabou entre a cotação e a reserva): a cobrança não pode ficar aberta.
    await pay.cancelCharge(charge.paymentId).catch(() => undefined);
    await release();
    throw await withFreshQuote(e);
  }

  // Tira do carrinho só o que virou pedido (o atleta pode ter mexido em outra aba). O pedido e o
  // Pix já existem: falhar aqui não pode virar erro, senão o "tentar de novo" duplica o pedido.
  const bought = new Set(quote.lines.map((l) => l.key));
  const cartRef = db.collection(CARTS).doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(cartRef);
      const items = (Array.isArray(cur.data()?.["items"]) ? cur.data()!["items"] : []) as Data[];
      const left = items.filter((i) => !bought.has(str(i["lineId"], 128) || `${str(i["productId"], 128)}/${str(i["skuId"], 120)}`));
      tx.set(cartRef, {items: left, updatedAt: now});
    });
  } catch (e) {
    logger.warn("Loja: carrinho não foi limpo depois do pedido", {orderId: created.orderId, error: String(e)});
  }

  return {
    orderId: created.orderId, number: created.number, totalCents: quote.totalCents,
    pix: {copyPaste: charge.copyPaste, expiresAt: expiresAt.toISOString()},
  };
}

// ---------------------------------------------------------------------------
// Pagamento confirmado (webhook / varredura)
// ---------------------------------------------------------------------------

export type ConfirmOutcome = "confirmed" | "already_paid" | "not_pending" | "value_mismatch" | "unknown_order";

/**
 * `pag` → `sep`: marca pago, conta o uso do cupom e abre a fila de arte das linhas personalizadas.
 * Idempotente pelo status: confirmar de novo devolve `already_paid`.
 */
export async function confirmStoreOrderPaymentCore(
  db: Firestore,
  orderId: string,
  payment: {paymentId: string; valueCents: number},
  now: Date,
): Promise<{outcome: ConfirmOutcome; uid: string | null; customItemIds: string[]}> {
  const ref = db.collection(ORDERS).doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return {outcome: "unknown_order" as const, uid: null, customItemIds: []};
    const o = snap.data()!;
    const uid = str((o["customer"] as Data | undefined)?.["uid"], 128) || null;
    const charge = (o["charge"] ?? {}) as Data;
    if (str(charge["paymentId"], 128) !== payment.paymentId) {
      return {outcome: "unknown_order" as const, uid, customItemIds: []};
    }
    if (o["status"] !== "pag") {
      return {outcome: (o["paidAt"] ? "already_paid" : "not_pending") as ConfirmOutcome, uid, customItemIds: []};
    }
    if (payment.valueCents < (o["totalCents"] as number)) {
      return {outcome: "value_mismatch" as const, uid, customItemIds: []};
    }

    const couponId = str(o["couponId"], 128);
    const reservation = o["couponReservation"] as CouponReservation | null | undefined;
    const couponRef = couponId ? db.collection(COUPONS).doc(couponId) : null;
    const couponSnap = couponRef ? await tx.get(couponRef) : null;
    const useRef = couponId && uid ? db.collection(COUPON_USES).doc(`${couponId}_${uid}`) : null;
    const useSnap = useRef ? await tx.get(useRef) : null;
    const countRef = couponId && reservation?.status === "reservado" ? db.collection(COUPON_USES).doc(couponId) : null;
    const countSnap = countRef ? await tx.get(countRef) : null;

    // ---------- escritas ----------
    const payments = ((o["payments"] ?? []) as Data[]).map((p) =>
      p["method"] === "pix" ? {...p, txid: payment.paymentId} : p);
    tx.update(ref, {
      status: "sep", paidAt: now, pix: null, payments,
      ...(reservation?.status === "reservado" ? {couponReservation: {...reservation, status: "usado"}} : {}),
      history: [...((o["history"] ?? []) as unknown[]), historyEntry("pago", "Pagamento aprovado", "Pix", null, now)],
      version: ((o["version"] as number) ?? 0) + 1, updatedAt: now, updatedBy: SYSTEM_ACTOR,
    });
    // `uses` só conta pedido pago; a reserva desse pedido sai do `reserved` e o marcador vira `usado`.
    if (couponRef && couponSnap?.exists) {
      tx.update(couponRef, {uses: ((couponSnap.data()?.["uses"] as number) ?? 0) + 1});
      if (countRef) {
        const reserved = Math.max(0, Number(countSnap?.data()?.["reserved"] ?? 0) || 0);
        tx.set(countRef, {reserved: Math.max(0, reserved - 1), updatedAt: now}, {merge: true});
      }
      if (useRef && (!useSnap?.exists || useSnap.data()?.["orderId"] === orderId)) {
        tx.set(useRef, {couponId, uid, orderId, status: "usado", at: now});
      }
    }

    const customer = (o["customer"] ?? {}) as Data;
    const customItemIds: string[] = [];
    ((o["customLines"] ?? []) as Data[]).forEach((line, i) => {
      const c = (line["customization"] ?? {}) as Data;
      const name = c["name"] as Data | undefined;
      const image = c["image"] as Data | undefined;
      const id = `${orderId}-${i + 1}`;
      customItemIds.push(id);
      tx.set(db.collection(CUSTOM_ITEMS).doc(id), {
        orderId, orderCode: o["number"], productId: line["productId"], productName: line["productName"],
        variantLabel: line["variantLabel"], qty: line["qty"],
        customer: {uid, name: customer["name"] ?? ""},
        status: "aprovar",
        name: name ? str(name["text"], 40) : null,
        font: name ? str(name["fontId"], 20) : null,
        nameColor: name ? str(name["color"], 7) : null,
        namePlacement: name ? str(name["placement"], 20) : null,
        image: image ? {
          url: null, path: str(image["path"], 300), widthPx: image["widthPx"] ?? null, heightPx: image["heightPx"] ?? null,
          format: str(image["format"], 4), sizeBytes: image["sizeBytes"] ?? null, backgroundRemoved: false,
          transform: image["transform"] ?? null, quality: image["quality"] ?? null,
        } : null,
        imageArea: image ? str(image["areaId"], 40) : null,
        // Costas abaixo do nome, no formato que a fila (tela 10) lê.
        back: backItemOf(c["back"] as Data | undefined),
        finalFiles: [], history: [], version: 1,
        createdAt: now, slaDueAt: new Date(now.getTime() + 4 * 3_600_000), updatedAt: now,
      });
    });
    return {outcome: "confirmed" as const, uid, customItemIds};
  });
}

/**
 * Pix pago depois do pedido cancelar (vencido): o estorno feito no Asaas entra no pedido, para o
 * backoffice e o atleta verem que o dinheiro entrou e voltou. Idempotente pelo `paymentId`.
 */
export async function recordLatePixRefundCore(
  db: Firestore, orderId: string, paymentId: string, valueCents: number, now: Date,
): Promise<void> {
  const ref = db.collection(ORDERS).doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const o = snap.data()!;
    const refunds = (o["refunds"] ?? []) as Data[];
    if (refunds.some((r) => r["paymentId"] === paymentId)) return;
    tx.update(ref, {
      refunds: [...refunds, {
        amountCents: valueCents, destination: "original", items: null, reason: "Pix pago depois do cancelamento",
        status: "concluido", paymentId, actor: SYSTEM_ACTOR, at: now,
      }],
      refundedCents: ((o["refundedCents"] ?? 0) as number) + valueCents,
      history: [...((o["history"] ?? []) as unknown[]), historyEntry("reembolso", "Pix estornado",
        `${(valueCents / 100).toFixed(2).replace(".", ",")} · pago depois do cancelamento`, null, now)],
      version: ((o["version"] as number) ?? 0) + 1, updatedAt: now, updatedBy: SYSTEM_ACTOR,
    });
  });
}

function backItemOf(back: Data | undefined): Data | null {
  if (back?.["type"] === "numero") return {type: "numero", number: str(back["number"], 3)};
  if (back?.["type"] === "imagem") {
    return {type: "imagem", image: {
      url: null, path: str(back["path"], 300), widthPx: back["widthPx"] ?? null, heightPx: back["heightPx"] ?? null,
      format: str(back["format"], 4), sizeBytes: back["sizeBytes"] ?? null, backgroundRemoved: false,
      transform: back["transform"] ?? null, quality: back["quality"] ?? null,
    }};
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pix vencido
// ---------------------------------------------------------------------------

export interface ExpiryDeps {
  /** Status no Asaas (`RECEIVED`, `PENDING`…) e o valor pago em centavos. */
  getPayment(paymentId: string): Promise<{status: string; valueCents: number}>;
  deleteCharge(paymentId: string): Promise<void>;
}

const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.has(status);
}

/**
 * Pedidos em `pag` com o Pix vencido: se o Asaas diz que pagou (webhook perdido), confirma;
 * senão apaga a cobrança e cancela (libera a reserva).
 */
export async function expireStorePixCore(
  db: Firestore,
  now: Date,
  deps: ExpiryDeps,
  limit = 50,
): Promise<{confirmed: string[]; canceled: string[]; failed: string[]; customItemIds: string[]}> {
  const snap = await db.collection(ORDERS)
    .where("status", "==", "pag")
    .where("pix.expiresAt", "<", now)
    .limit(limit)
    .get();
  const out = {confirmed: [] as string[], canceled: [] as string[], failed: [] as string[], customItemIds: [] as string[]};
  for (const doc of snap.docs) {
    const o = doc.data();
    const paymentId = str((o["charge"] as Data | undefined)?.["paymentId"], 128);
    try {
      if (paymentId) {
        const p = await deps.getPayment(paymentId);
        if (isPaidStatus(p.status)) {
          const r = await confirmStoreOrderPaymentCore(db, doc.id, {paymentId, valueCents: p.valueCents}, now);
          if (r.outcome === "confirmed" || r.outcome === "already_paid") {
            out.confirmed.push(doc.id);
            out.customItemIds.push(...r.customItemIds);
          } else {
            // Pago no Asaas mas não confirmou (valor diferente etc.): nunca cancelar dinheiro que entrou.
            logger.error("Loja: Pix pago que não confirma, ficou pra conferência", {orderId: doc.id, outcome: r.outcome});
            out.failed.push(doc.id);
          }
          continue;
        }
        await deps.deleteCharge(paymentId);
      }
      await orderActionCore(db, {
        orderId: doc.id, version: o["version"] as number, action: "cancelar", reason: "Pix expirou sem pagamento",
      }, SYSTEM_ACTOR, now);
      out.canceled.push(doc.id);
    } catch {
      out.failed.push(doc.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Visão do pedido para o atleta (espelho saneado)
// ---------------------------------------------------------------------------

function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  const ts = v as {toDate?: () => Date} | null | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate().toISOString() : null;
}

/**
 * O que o atleta pode ver do próprio pedido: sem CPF, custo, reserva ou nota interna. O código
 * de retirada só aparece quando o pedido está pronto na arena. `null` = pedido sem dono no app.
 */
export function buildOrderView(orderId: string, o: Data): Data | null {
  const customer = (o["customer"] ?? {}) as Data;
  const uid = str(customer["uid"], 128);
  if (!uid) return null;
  const status = str(o["status"], 8);
  const d = (o["delivery"] ?? {}) as Data;
  const pix = o["pix"] as Data | null | undefined;
  return {
    uid,
    orderId,
    number: str(o["number"], 20),
    status,
    channel: str(o["channel"], 20),
    items: ((o["items"] ?? []) as Data[]).map((i) => ({
      productId: str(i["productId"], 128),
      skuId: str(i["skuId"], 120),
      name: str(i["productName"], 160),
      variantLabel: str(i["variantLabel"], 120),
      imageUrl: (i["imageUrl"] as string | null) ?? null,
      qty: i["qty"] ?? 0,
      unitCents: i["unitCents"] ?? 0,
      totalCents: i["totalCents"] ?? 0,
      personalized: !!i["customization"],
      customizationLabel: (i["customization"] as Data | null)?.["name"] ?? null,
    })),
    units: o["units"] ?? 0,
    subtotalCents: o["subtotalCents"] ?? 0,
    couponCode: o["couponCode"] ?? null,
    couponDiscountCents: o["couponDiscountCents"] ?? 0,
    pixDiscountCents: o["pixDiscountCents"] ?? 0,
    shippingCents: o["shippingCents"] ?? 0,
    totalCents: o["totalCents"] ?? 0,
    paymentMethods: o["paymentMethods"] ?? [],
    pix: status === "pag" && pix ? {copyPaste: str(pix["copyPaste"], 600), expiresAt: iso(pix["expiresAt"])} : null,
    delivery: d["type"] === "arena" ? {
      type: "arena",
      placeName: d["placeName"] ?? null,
      counter: d["counter"] ?? null,
      address: d["address"] ?? null,
      pickupCode: status === "ret" ? (d["pickupCode"] ?? null) : null,
      pickupDeadline: iso(d["pickupDeadline"]),
    } : {
      type: "casa",
      modeName: d["modeName"] ?? null,
      address: d["address"] ?? null,
      city: d["city"] ?? null,
      uf: d["uf"] ?? null,
      zip: d["zip"] ?? null,
      carrier: d["carrier"] ?? null,
      tracking: d["tracking"] ?? null,
      trackingUrl: d["trackingUrl"] ?? null,
      eta: d["eta"] ?? null,
    },
    createdAt: iso(o["createdAt"]),
    paidAt: iso(o["paidAt"]),
    separatedAt: iso(o["separatedAt"]),
    arrivedAt: iso(o["arrivedAt"]),
    shippedAt: iso(o["shippedAt"]),
    completedAt: iso(o["completedAt"]),
    canceledAt: iso(o["canceledAt"]),
    cancelReason: o["cancelReason"] ?? null,
    refundedCents: o["refundedCents"] ?? 0,
    updatedAt: iso(o["updatedAt"]),
  };
}

/**
 * Gatilho: espelha o pedido na visão do dono (e apaga quando o pedido some). Relê o pedido em vez
 * de usar o `after` do evento: eventos chegam fora de ordem e o espelho não pode voltar no tempo.
 */
export async function syncOrderViewCore(db: Firestore, orderId: string): Promise<void> {
  const snap = await db.collection(ORDERS).doc(orderId).get();
  const ref = db.collection(ORDER_VIEWS).doc(orderId);
  const view = snap.exists ? buildOrderView(orderId, snap.data()!) : null;
  if (view) await ref.set(view);
  else await ref.delete();
}
