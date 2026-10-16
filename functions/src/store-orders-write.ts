/**
 * Escrita dos Pedidos da Loja (telas 02 e 03).
 *
 * Status e estoque andam juntos na mesma transação: a reserva nasce com o
 * pedido, a separação na arena prende a peça no balcão, a retirada/envio gera
 * a Saída e o cancelamento solta a reserva (ou, na arena, abre a transferência
 * de volta). Dinheiro (reembolso) fica registrado como pendente até o
 * Financeiro da Loja existir — como nas trocas.
 */
import {randomInt} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {getFirestore, type Firestore, type Transaction} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {type StockMovementItem} from "./store-catalog";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";
import {
  MAIN_LOCATION,
  MAX_ORDER_LINES,
  ORDER_CHANNELS,
  PAYMENT_METHODS,
  cancelBlockReason,
  deadlineLabel,
  historyEntry,
  nextOrderStatus,
  orderNumber,
  orderStateOf,
  orderTotalCents,
  paymentsMatch,
  pickupDeadline,
  pickupNotice,
  refundableCents,
  validPickupCode,
  type OrderAction,
  type OrderChannel,
  type OrderNotice,
  type OrderStatus,
  type PaymentMethod,
} from "./store-orders";
import {STORE_CONFIG, SHIPPING_CONFIG_ID, withShippingDefaults} from "./store-pickup";
import {ORDER_NOTIFY_SECRETS, notifyOrderCustomer} from "./store-order-notify";
import {availableAt, transferCode} from "./store-stock";
import {
  assertLocation,
  describe,
  loadProducts,
  locationName,
  moveReserved,
  moveStock,
  skuOf,
  writeProducts,
  type LoadedProduct,
} from "./store-stock-write";

const BACKOFFICE_CALLABLE = {
  region: CLIENT_FACING_REGIONS,
  invoker: "public" as const,
  secrets: ORDER_NOTIFY_SECRETS,
};

export const ORDERS = "storeOrders";
const MOVEMENTS = "storeStockMovements";
const TRANSFERS = "storeTransfers";
const LOCATIONS = "storeLocations";
const COUNTERS = "storeCounters";

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Quem age quando ninguém clicou: a varredura de retirada vencida. */
export const SYSTEM_ACTOR: Actor = {uid: "system", name: "Automático"};

type Data = FirebaseFirestore.DocumentData;

function invalid(fields: string[], message = "Dados inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields: [...new Set(fields)].sort()});
}

function conflict(existing: Data): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Este pedido foi alterado por outra pessoa. Recarregue antes de continuar.",
    {updatedBy: existing["updatedBy"], updatedAt: existing["updatedAt"]},
  );
}

const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isCents = (v: unknown): v is number => isInt(v) && v >= 0 && v <= 100_000_000;

export interface OrderItemDoc {
  productId: string;
  skuId: string;
  skuCode: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  qty: number;
  unitCents: number;
  totalCents: number;
  customization: {name: string; artUrl: string | null; status: string} | null;
}

/** O que as regras puras precisam saber do doc. */
export const stateOf = orderStateOf;

function itemsOf(o: Data): OrderItemDoc[] {
  return (o["items"] ?? []) as OrderItemDoc[];
}

function movementItems(products: Map<string, LoadedProduct>, items: OrderItemDoc[], locationId: string, sign: 1 | -1):
  StockMovementItem[] {
  return items.map((i) => {
    const sku = skuOf(products, i.productId, i.skuId);
    moveReserved(sku, locationId, -i.qty);
    const {before, after} = moveStock(sku, locationId, sign * i.qty);
    return {productId: i.productId, skuId: i.skuId, ...describe(products, i.productId, i.skuId),
      locationId, delta: sign * i.qty, before, after};
  });
}

// ---------------------------------------------------------------------------
// Criação (checkout / seed): numera, reserva e grava
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  orderId: string;
  channel: OrderChannel;
  customer: {uid: string | null; name: string; email: string; phone: string; cpf: string;
    level: number | null; orderIndex: number | null};
  items: {productId: string; skuId: string; qty: number; unitCents?: number | null;
    customization?: {name: string; artUrl: string | null; status: string} | null}[];
  couponId: string | null;
  couponCode: string | null;
  couponDiscountCents: number;
  pixDiscountCents: number;
  walletCents: number;
  shippingCents: number;
  payments: {method: PaymentMethod; amountCents: number; installments?: number | null;
    txid?: string | null; feeCents?: number}[];
  /** Pago na criação (`sep`) ou esperando o Pix/cartão (`pag`). */
  paid: boolean;
  pix: {copyPaste: string; expiresAt: Date} | null;
  delivery:
    | {type: "arena"; locationId: string; pickupPointId: string | null}
    | {type: "casa"; modeId: string; modeName: string; address: string; city: string; uf: string; zip: string};
}

function createErrors(input: CreateOrderInput): string[] {
  const fields: string[] = [];
  if (!ID_RE.test(text(input.orderId, 64))) fields.push("orderId");
  if (!ORDER_CHANNELS.includes(input.channel)) fields.push("channel");
  if (!text(input.customer?.name)) fields.push("customer");
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0 || items.length > MAX_ORDER_LINES) fields.push("items");
  if (items.some((i) => !text(i?.productId) || !text(i?.skuId, 120) || !isInt(i.qty) || i.qty < 1 || i.qty > 99 ||
    (i.unitCents != null && !isCents(i.unitCents)))) {
    fields.push("items");
  }
  for (const f of ["couponDiscountCents", "pixDiscountCents", "walletCents", "shippingCents"] as const) {
    if (!isCents(input[f])) fields.push(f);
  }
  const payments = Array.isArray(input.payments) ? input.payments : [];
  if (payments.length === 0 || payments.some((p) => !PAYMENT_METHODS.includes(p?.method) || !isCents(p.amountCents))) {
    fields.push("payments");
  }
  const d = input.delivery;
  if (d?.type === "arena") {
    if (!text(d.locationId, 64)) fields.push("delivery");
  } else if (d?.type === "casa") {
    if (!text(d.modeId, 40) || !text(d.address, 300) || !text(d.city, 80) || !/^[A-Z]{2}$/.test(d.uf ?? "")) fields.push("delivery");
  } else {
    fields.push("delivery");
  }
  return fields;
}

export async function createOrderCore(
  db: Firestore,
  input: CreateOrderInput,
  actor: Actor,
  now: Date,
): Promise<{orderId: string; number: string}> {
  const fields = createErrors(input ?? ({} as CreateOrderInput));
  if (fields.length > 0) throw invalid(fields, "Faltam dados do pedido.");
  const ref = db.collection(ORDERS).doc(input.orderId);
  const counterRef = db.collection(COUNTERS).doc("orders");

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    if ((await tx.get(ref)).exists) throw new HttpsError("already-exists", "Este pedido já existe.");
    const counter = await tx.get(counterRef);
    const products = await loadProducts(tx, db, input.items.map((i) => i.productId));
    const d = input.delivery;
    const arenaLoc = d.type === "arena" ? await assertLocation(tx, db, d.locationId, "delivery") : null;
    const arenaSnap = arenaLoc ? await tx.get(db.collection(LOCATIONS).doc(arenaLoc)) : null;
    const pointSnap = d.type === "arena" && d.pickupPointId ?
      await tx.get(db.collection("storePickupPoints").doc(d.pickupPointId)) : null;

    // ---------- cálculo ----------
    const items: OrderItemDoc[] = input.items.map((i) => {
      const product = products.get(i.productId)!;
      const sku = skuOf(products, i.productId, i.skuId);
      const unitCents = i.unitCents ?? ((sku.data["priceCents"] ?? product.data["priceCents"] ?? 0) as number);
      const photo = ((product.data["photos"] ?? []) as {url?: string}[])[0]?.url ?? null;
      return {
        productId: i.productId, skuId: i.skuId, ...describe(products, i.productId, i.skuId), imageUrl: photo,
        qty: i.qty, unitCents, totalCents: unitCents * i.qty,
        customization: i.customization ? {name: text(i.customization.name, 120), artUrl: i.customization.artUrl ?? null,
          status: text(i.customization.status, 20) || "aprovar"} : null,
      };
    });
    const subtotalCents = items.reduce((n, i) => n + i.totalCents, 0);
    const totalCents = orderTotalCents({subtotalCents, ...input});
    if (totalCents < 0) throw invalid(["couponDiscountCents", "pixDiscountCents", "walletCents"], "Descontos maiores que o pedido.");
    if (!paymentsMatch(input.payments, totalCents, input.walletCents)) {
      throw invalid(["payments"], "Os pagamentos não fecham com o total do pedido.");
    }

    // A retirada usa a peça da própria arena quando ela tem tudo; senão reserva no CD e vai por remessa.
    const fromArena = arenaLoc !== null && items.every((i) => {
      const need = items.filter((x) => x.productId === i.productId && x.skuId === i.skuId).reduce((n, x) => n + x.qty, 0);
      return availableAt(skuOf(products, i.productId, i.skuId).data, arenaLoc) >= need;
    });
    const reserveAt = fromArena ? arenaLoc! : MAIN_LOCATION;
    for (const i of items) {
      const sku = skuOf(products, i.productId, i.skuId);
      if (availableAt(sku.data, reserveAt) < i.qty) {
        throw new HttpsError("failed-precondition", `Sem estoque de ${i.productName} ${i.variantLabel}.`.trim(),
          {skuId: i.skuId, locationId: reserveAt});
      }
      moveReserved(sku, reserveAt, i.qty);
    }

    const seq = ((counter.data()?.["next"] ?? 1) as number);
    const number = orderNumber(seq);
    const point = pointSnap?.data();
    const delivery: Data = d.type === "arena" ? {
      type: "arena", locationId: arenaLoc, pickupPointId: d.pickupPointId ?? null,
      placeName: locationName(arenaSnap?.data(), arenaLoc!),
      counter: (point?.["counter"] ?? null) as string | null,
      address: (point?.["address"] ?? null) as string | null,
      pickupCode: String(randomInt(0, 10_000)).padStart(4, "0"),
      pickupDeadline: null,
    } : {
      type: "casa", modeId: text(d.modeId, 40), modeName: text(d.modeName, 60), address: text(d.address, 300),
      city: text(d.city, 80), uf: d.uf, zip: text(d.zip, 12), carrier: null, tracking: null, trackingUrl: null, eta: null,
    };
    const payments = input.payments.map((p) => ({
      method: p.method, amountCents: p.amountCents, installments: p.method === "cartao" ? (p.installments ?? 1) : null,
      txid: p.txid ?? null, feeCents: isCents(p.feeCents) ? p.feeCents : 0,
    }));
    const history = [historyEntry("criado", "Pedido criado", channelLabel(input.channel), null, now)];
    if (input.paid) history.push(historyEntry("pago", "Pagamento aprovado", paymentDetail(payments), null, now));

    // ---------- escritas ----------
    tx.set(counterRef, {next: seq + 1}, {merge: true});
    writeProducts(tx, products, actor, now);
    tx.set(ref, {
      number, seq, status: (input.paid ? "sep" : "pag") as OrderStatus, channel: input.channel,
      customer: {
        uid: input.customer.uid ?? null, name: text(input.customer.name, 120), email: text(input.customer.email, 160),
        phone: text(input.customer.phone, 40), cpf: text(input.customer.cpf, 20).replace(/\D+/g, ""),
        level: input.customer.level ?? null, orderIndex: input.customer.orderIndex ?? null,
      },
      items, productIds: [...new Set(items.map((i) => i.productId))], units: items.reduce((n, i) => n + i.qty, 0),
      subtotalCents, couponId: input.couponId ?? null, couponCode: input.couponCode ?? null,
      couponDiscountCents: input.couponDiscountCents, pixDiscountCents: input.pixDiscountCents,
      walletCents: input.walletCents, shippingCents: input.shippingCents, totalCents,
      payments, paymentMethods: [...new Set(payments.map((p) => p.method))],
      pix: input.paid ? null : input.pix ?? null,
      delivery, reservation: {locationId: reserveAt, active: true},
      transferId: null, transferCode: null, refundedCents: 0, refunds: [], internalNote: null,
      paidAt: input.paid ? now : null, separatedAt: null, arrivedAt: null, shippedAt: null, completedAt: null,
      canceledAt: null, cancelReason: null, lastNoticeAt: null,
      history, version: 1, createdAt: now, updatedAt: now, updatedBy: actor,
    });
    return {orderId: ref.id, number};
  });
}

const CHANNEL_LABEL: Record<OrderChannel, string> = {web: "Site", app_ios: "App iOS", app_android: "App Android"};
const channelLabel = (c: OrderChannel) => CHANNEL_LABEL[c] ?? c;

function paymentDetail(payments: Data[]): string {
  const pix = payments.find((p) => p["method"] === "pix");
  if (pix?.["txid"]) return `txid ${String(pix["txid"]).slice(0, 5)}…${String(pix["txid"]).slice(-4)}`;
  const card = payments.find((p) => p["method"] === "cartao");
  if (card) return `Cartão ${card["installments"] ?? 1}×`;
  return "Saldo da carteira";
}

// ---------------------------------------------------------------------------
// Ações de status (02 em massa, 03 botão primário, cancelar)
// ---------------------------------------------------------------------------

export interface OrderActionInput {
  orderId: string;
  version: number;
  action: OrderAction;
  /** Confirmar retirada: os 4 dígitos que o cliente mostra. */
  pickupCode?: string;
  /** Enviar: transportadora, rastreio e previsão (YYYY-MM-DD). */
  carrier?: string;
  tracking?: string;
  trackingUrl?: string;
  eta?: string;
  /** Cancelar: obrigatório, fica no histórico e no header. */
  reason?: string;
  /** Cancelar pago: para onde vai o reembolso (padrão: meio original). */
  refundTo?: "original" | "saldo";
}

export interface OrderActionResult {
  version: number;
  status: OrderStatus;
  /** Aviso ao cliente que a callable dispara depois da transação. */
  notice: OrderNotice | null;
  /** Cancelar na arena abre a transferência de volta em rascunho. */
  returnTransferId: string | null;
}

export async function orderActionCore(
  db: Firestore,
  input: OrderActionInput,
  actor: Actor,
  now: Date,
): Promise<OrderActionResult> {
  if (!ID_RE.test(text(input?.orderId, 64))) throw invalid(["orderId"]);
  const ref = db.collection(ORDERS).doc(input.orderId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Pedido não encontrado.");
    const o = snap.data()!;
    if (o["version"] !== input.version) throw conflict(o);
    const state = stateOf(o);
    if (input.action === "cancelar") {
      const block = cancelBlockReason(state.status);
      if (block) throw new HttpsError("failed-precondition", block, {current: state.status});
    }
    const status = nextOrderStatus(state, input.action);
    if (!status) {
      throw new HttpsError("failed-precondition", "Esta ação não vale para o status atual do pedido.", {current: state.status});
    }
    const items = itemsOf(o);
    const products = await loadProducts(tx, db, items.map((i) => i.productId));
    const shipping = withShippingDefaults((await tx.get(db.collection(STORE_CONFIG).doc(SHIPPING_CONFIG_ID))).data());
    const plan = await planAction(tx, db, o, input, status, products, shipping.pickupDeadlineDays, actor, now);

    // ---------- escritas ----------
    writeProducts(tx, products, actor, now);
    for (const m of plan.movements) tx.set(db.collection(MOVEMENTS).doc(), m);
    if (plan.returnTransfer) tx.set(plan.returnTransfer.ref, plan.returnTransfer.data);
    if (plan.counterNext !== null) tx.set(db.collection(COUNTERS).doc("transfers"), {next: plan.counterNext}, {merge: true});
    const version = input.version + 1;
    tx.set(ref, {
      ...plan.updates, status,
      history: [...((o["history"] ?? []) as Data[]), ...plan.history],
      version, updatedAt: now, updatedBy: actor,
    }, {merge: true});
    return {version, status, notice: plan.notice, returnTransferId: plan.returnTransfer?.ref.id ?? null};
  });
}

interface ActionPlan {
  updates: Data;
  history: Data[];
  movements: Data[];
  notice: OrderNotice | null;
  returnTransfer: {ref: FirebaseFirestore.DocumentReference; data: Data} | null;
  counterNext: number | null;
}

/** Tudo que a ação faz no estoque e no doc. Só lê antes de mexer nos SKUs carregados (sem escrita na transação). */
async function planAction(
  tx: Transaction,
  db: Firestore,
  o: Data,
  input: OrderActionInput,
  status: OrderStatus,
  products: Map<string, LoadedProduct>,
  deadlineDays: number,
  actor: Actor,
  now: Date,
): Promise<ActionPlan> {
  const plan: ActionPlan = {updates: {}, history: [], movements: [], notice: null, returnTransfer: null, counterNext: null};
  const items = itemsOf(o);
  const number = o["number"] as string;
  const delivery = (o["delivery"] ?? {}) as Data;
  const reservation = o["reservation"] as {locationId: string; active: boolean} | null;
  const saida = (locationId: string, reason: string) => ({
    type: "saida", status: "confirmada", fromLocationId: locationId, toLocationId: null,
    items: movementItems(products, items, locationId, -1), productIds: [...products.keys()],
    reference: `Pedido ${number}`, reason, orderId: input.orderId, actor, createdAt: now,
  });

  switch (input.action) {
    case "iniciar_separacao":
      plan.updates = {separationStartedAt: now};
      plan.history.push(historyEntry("separacao", "Separação iniciada", "", actor, now));
      break;

    case "marcar_separado": {
      const at = reservation?.locationId ?? MAIN_LOCATION;
      const locName = locationName((await tx.get(db.collection(LOCATIONS).doc(at))).data(), at);
      plan.updates = {separatedAt: now, separationStartedAt: o["separationStartedAt"] ?? now};
      plan.history.push(historyEntry("separado", `Separado ${at === MAIN_LOCATION ? "no" : "na"} ${locName}`, "", actor, now));
      if (status === "ret") {
        // Separado no balcão da própria arena: já está lá, a retirada abre agora.
        const deadline = pickupDeadline(now, deadlineDays);
        plan.updates = {...plan.updates, arrivedAt: now, "delivery": {...delivery, pickupDeadline: deadline}};
        plan.history.push(historyEntry("na_arena", "Pronto para retirada", `Prazo até ${deadlineLabel(deadline)}`, actor, now));
        plan.notice = pickupNotice({...o, id: input.orderId}, deadline);
      }
      break;
    }

    case "enviar": {
      const carrier = text(input.carrier, 60);
      const tracking = text(input.tracking, 60);
      if (!carrier) throw invalid(["carrier"], "Informe a transportadora.");
      if (input.eta && !/^\d{4}-\d{2}-\d{2}$/.test(input.eta)) throw invalid(["eta"]);
      const trackingUrl = text(input.trackingUrl, 500);
      if (trackingUrl && !trackingUrl.startsWith("https://")) throw invalid(["trackingUrl"]);
      const from = reservation?.locationId ?? MAIN_LOCATION;
      plan.movements.push(saida(from, `Envio para ${o["customer"]?.["name"] ?? "cliente"}`));
      plan.updates = {
        shippedAt: now, reservation: null,
        delivery: {...delivery, carrier, tracking: tracking || null, trackingUrl: trackingUrl || null, eta: input.eta || null},
      };
      plan.history.push(historyEntry("enviado", "Enviado", [carrier, tracking].filter(Boolean).join(" · "), actor, now));
      plan.notice = {kind: "shipped", uid: o["customer"]?.["uid"] ?? null, number, orderId: input.orderId,
        body: `Seu pedido ${number} saiu para entrega${tracking ? ` (rastreio ${tracking})` : ""}.`};
      break;
    }

    case "entregue":
      plan.updates = {completedAt: now};
      plan.history.push(historyEntry("entregue", "Entregue", "", actor, now));
      break;

    case "confirmar_retirada": {
      if (!validPickupCode(input.pickupCode) || input.pickupCode !== delivery["pickupCode"]) {
        throw invalid(["pickupCode"], "Código de retirada não confere.");
      }
      const at = (reservation?.locationId ?? delivery["locationId"]) as string;
      plan.movements.push(saida(at, `Retirada por ${o["customer"]?.["name"] ?? "cliente"}`));
      plan.updates = {completedAt: now, reservation: null};
      plan.history.push(historyEntry("retirado", "Retirado", `Código conferido por ${actor.name}`, actor, now));
      break;
    }

    case "cancelar": {
      const reason = text(input.reason, 500);
      if (!reason) throw invalid(["reason"], "Informe o motivo do cancelamento.");
      const notes: string[] = [];
      if (reservation?.active) {
        for (const i of items) moveReserved(skuOf(products, i.productId, i.skuId), reservation.locationId, -i.qty);
      } else if (o["transferId"]) {
        notes.push(`As peças seguem na remessa ${o["transferCode"] ?? ""} e ficam livres na arena.`.replace("  ", " "));
      }
      // Na arena, as peças precisam voltar: abre a transferência de volta em rascunho.
      if (o["status"] === "ret" && reservation && reservation.locationId !== MAIN_LOCATION) {
        const counter = await tx.get(db.collection(COUNTERS).doc("transfers"));
        const next = (counter.data()?.["next"] ?? 1) as number;
        const code = transferCode(next);
        plan.counterNext = next + 1;
        plan.returnTransfer = {
          ref: db.collection(TRANSFERS).doc(),
          data: {
            code, status: "rascunho", fromLocationId: reservation.locationId, toLocationId: MAIN_LOCATION,
            items: items.map((i) => ({productId: i.productId, skuId: i.skuId, qty: i.qty,
              ...describe(products, i.productId, i.skuId)})),
            productIds: [...products.keys()], units: items.reduce((n, i) => n + i.qty, 0),
            transport: "", departAt: "", arriveAt: "", receiver: "", note: `Volta do pedido cancelado ${number}`,
            orderIds: [], history: [{status: "rascunho", actor, at: now}], version: 1,
            createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
          },
        };
        notes.push(`Transferência de volta ${code} aberta em rascunho.`);
      }
      // Pago: o reembolso entra pendente para o Financeiro (o Pix/cartão ainda não estorna daqui).
      const refund = o["status"] === "pag" ? 0 : refundableCents(o as never);
      const refunds = [...((o["refunds"] ?? []) as Data[])];
      if (refund > 0) {
        refunds.push({amountCents: refund, destination: input.refundTo === "saldo" ? "saldo" : "original",
          items: null, reason, status: "pendente", actor, at: now});
        notes.push("Reembolso registrado como pendente no Financeiro.");
      }
      plan.updates = {
        canceledAt: now, cancelReason: reason, reservation: reservation ? {...reservation, active: false} : null,
        refunds, refundedCents: ((o["refundedCents"] ?? 0) as number) + refund,
      };
      plan.history.push(historyEntry("cancelado", "Pedido cancelado", [reason, ...notes].join(" "), actor, now));
      plan.notice = {kind: "canceled", uid: o["customer"]?.["uid"] ?? null, number, orderId: input.orderId,
        body: `Seu pedido ${number} foi cancelado.${refund > 0 ? " O reembolso está a caminho." : ""}`};
      break;
    }
  }
  return plan;
}

export const EXPIRED_REASON = "Prazo de retirada vencido";

// ---------------------------------------------------------------------------
// Reembolso, nota interna e avisos ao cliente
// ---------------------------------------------------------------------------

export interface RefundInput {
  orderId: string;
  version: number;
  /** `total` = o que ainda resta; `itens` = linhas escolhidas (índice → unidades). */
  mode: "total" | "itens";
  items?: {index: number; qty: number}[];
  destination: "original" | "saldo";
  reason: string;
}

/** Valor pago por unidade, com cupom/Pix/saldo rateados sobre os itens (frete fora). */
export function paidUnitCents(o: {subtotalCents: number; totalCents: number; walletCents: number; shippingCents: number},
  unitCents: number): number {
  if (o.subtotalCents <= 0) return 0;
  const goods = Math.max(0, o.totalCents + o.walletCents - o.shippingCents);
  return Math.round((unitCents * goods) / o.subtotalCents);
}

export async function refundOrderCore(
  db: Firestore,
  input: RefundInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; amountCents: number}> {
  if (!ID_RE.test(text(input?.orderId, 64))) throw invalid(["orderId"]);
  if (input.mode !== "total" && input.mode !== "itens") throw invalid(["mode"]);
  if (input.destination !== "original" && input.destination !== "saldo") throw invalid(["destination"]);
  const reason = text(input.reason, 500);
  if (!reason) throw invalid(["reason"], "Informe o motivo do reembolso.");
  const ref = db.collection(ORDERS).doc(input.orderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Pedido não encontrado.");
    const o = snap.data()!;
    if (o["version"] !== input.version) throw conflict(o);
    if (o["status"] === "pag") throw new HttpsError("failed-precondition", "Pedido ainda não foi pago.");
    const left = refundableCents(o as never);
    const items = itemsOf(o);
    let amount = left;
    let lines: {index: number; qty: number}[] | null = null;
    if (input.mode === "itens") {
      const done = new Map<number, number>();
      for (const r of (o["refunds"] ?? []) as Data[]) {
        for (const l of (r["items"] ?? []) as {index: number; qty: number}[]) done.set(l.index, (done.get(l.index) ?? 0) + l.qty);
      }
      lines = (Array.isArray(input.items) ? input.items : []).filter((l) => isInt(l?.qty) && l.qty > 0);
      if (lines.length === 0) throw invalid(["items"], "Escolha ao menos um item.");
      amount = 0;
      for (const l of lines) {
        const item = items[l.index];
        if (!isInt(l.index) || !item || l.qty > item.qty - (done.get(l.index) ?? 0)) throw invalid(["items"], "Quantidade acima do que resta no item.");
        amount += paidUnitCents(o as never, item.unitCents) * l.qty;
      }
      amount = Math.min(amount, left);
    }
    if (amount <= 0) throw new HttpsError("failed-precondition", "Não há valor a reembolsar.");
    const version = input.version + 1;
    tx.set(ref, {
      refunds: [...((o["refunds"] ?? []) as Data[]),
        {amountCents: amount, destination: input.destination, items: lines, reason, status: "pendente", actor, at: now}],
      refundedCents: ((o["refundedCents"] ?? 0) as number) + amount,
      history: [...((o["history"] ?? []) as Data[]), historyEntry("reembolso", "Reembolso registrado",
        `${(amount / 100).toFixed(2).replace(".", ",")} · ${input.destination === "saldo" ? "saldo na carteira" : "meio original"} · ${reason}`,
        actor, now)],
      version, updatedAt: now, updatedBy: actor,
    }, {merge: true});
    return {version, amountCents: amount};
  });
}

/** Nota interna: autosave, sem subir a versão (não briga com as ações de status). */
export async function saveOrderNoteCore(
  db: Firestore,
  input: {orderId: string; text: string},
  actor: Actor,
  now: Date,
): Promise<{at: Date}> {
  if (!ID_RE.test(text(input?.orderId, 64))) throw invalid(["orderId"]);
  if (typeof input.text !== "string" || input.text.length > 4000) throw invalid(["text"]);
  const ref = db.collection(ORDERS).doc(input.orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Pedido não encontrado.");
  await ref.set({internalNote: {text: input.text, by: actor, at: now}}, {merge: true});
  return {at: now};
}

export type NoticeKind = "pickup_code" | "payment";

/** "Reenviar" do código de retirada e "Reenviar cobrança": no máximo 1 por minuto. */
export async function resendNoticeCore(
  db: Firestore,
  input: {orderId: string; kind: NoticeKind},
  actor: Actor,
  now: Date,
): Promise<OrderNotice> {
  if (!ID_RE.test(text(input?.orderId, 64))) throw invalid(["orderId"]);
  if (input.kind !== "pickup_code" && input.kind !== "payment") throw invalid(["kind"]);
  const ref = db.collection(ORDERS).doc(input.orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Pedido não encontrado.");
    const o = snap.data()!;
    if (input.kind === "pickup_code" && o["status"] !== "ret") {
      throw new HttpsError("failed-precondition", "O código só vale com o pedido na arena.");
    }
    if (input.kind === "payment" && o["status"] !== "pag") {
      throw new HttpsError("failed-precondition", "O pedido não está aguardando pagamento.");
    }
    if (!o["customer"]?.["uid"]) throw new HttpsError("failed-precondition", "Cliente sem conta no app para receber o aviso.");
    const last = o["lastNoticeAt"] as {toDate?: () => Date} | Date | null;
    const lastMs = last instanceof Date ? last.getTime() : last?.toDate?.().getTime() ?? 0;
    if (now.getTime() - lastMs < 60_000) {
      throw new HttpsError("resource-exhausted", "Aviso enviado há menos de 1 minuto. Aguarde para reenviar.");
    }
    const number = o["number"] as string;
    const notice: OrderNotice = input.kind === "pickup_code" ?
      {...pickupNotice({...o, id: ref.id}, toDate(o["delivery"]?.["pickupDeadline"]) ?? now), kind: "pickup_code"} :
      {kind: "payment", uid: o["customer"]["uid"], number, orderId: ref.id,
        body: `Seu pedido ${number} está aguardando o pagamento. Abra o app para pagar com Pix.`};
    tx.set(ref, {
      lastNoticeAt: now,
      history: [...((o["history"] ?? []) as Data[]), historyEntry("aviso",
        input.kind === "pickup_code" ? "Código de retirada reenviado" : "Cobrança reenviada", "Push ao cliente", actor, now)],
    }, {merge: true});
    return notice;
  });
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const t = v as {toDate?: () => Date} | null;
  return t?.toDate ? t.toDate() : null;
}

// ---------------------------------------------------------------------------
// Retirada fora do prazo (07: "cancelar retirada vencida")
// ---------------------------------------------------------------------------

export async function sweepExpiredPickupsCore(
  db: Firestore,
  now: Date,
  notify: (n: OrderNotice) => Promise<unknown> = async () => undefined,
): Promise<{canceled: string[]}> {
  const config = withShippingDefaults((await db.collection(STORE_CONFIG).doc(SHIPPING_CONFIG_ID).get()).data());
  if (!config.cancelExpiredPickup) return {canceled: []};
  const snap = await db.collection(ORDERS)
    .where("status", "==", "ret")
    .where("delivery.pickupDeadline", "<", now)
    .limit(100)
    .get();
  const canceled: string[] = [];
  for (const d of snap.docs) {
    const o = d.data();
    try {
      const result = await orderActionCore(db, {orderId: d.id, version: o["version"], action: "cancelar",
        reason: EXPIRED_REASON, refundTo: config.refundAsWalletCredit ? "saldo" : "original"}, SYSTEM_ACTOR, now);
      if (result.notice) await notify(result.notice);
      canceled.push(d.id);
    } catch (err) {
      logger.warn("Retirada vencida não cancelada", {orderId: d.id, err});
    }
  }
  return {canceled};
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

async function actorOf(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return assertCatalogAdmin(uid);
}

export const storeOrderAction = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const result = await orderActionCore(getFirestore(), (request.data ?? {}) as OrderActionInput, actor, new Date());
  if (result.notice) await notifyOrderCustomer(result.notice);
  return {version: result.version, status: result.status, returnTransferId: result.returnTransferId};
});

export const refundStoreOrder = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return refundOrderCore(getFirestore(), (request.data ?? {}) as RefundInput, actor, new Date());
});

export const saveStoreOrderNote = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return saveOrderNoteCore(getFirestore(), (request.data ?? {}) as {orderId: string; text: string}, actor, new Date());
});

export const resendStoreOrderNotice = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const notice = await resendNoticeCore(getFirestore(), (request.data ?? {}) as {orderId: string; kind: NoticeKind},
    actor, new Date());
  const delivered = await notifyOrderCustomer(notice);
  return {sent: delivered.sent};
});

export const sweepExpiredStorePickups = onSchedule(
  {schedule: "every 60 minutes", timeZone: "America/Sao_Paulo", secrets: ORDER_NOTIFY_SECRETS},
  async () => {
    const {canceled} = await sweepExpiredPickupsCore(getFirestore(), new Date(), notifyOrderCustomer);
    if (canceled.length > 0) logger.info("Retiradas vencidas canceladas", {count: canceled.length, canceled});
  },
);
