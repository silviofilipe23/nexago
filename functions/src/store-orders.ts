/**
 * Pedidos da Loja (telas 01 Visão geral, 02 Pedidos, 03 Detalhe): regras sem
 * banco. As callables em `store-orders-write.ts` leem, aplicam isto e gravam.
 *
 *   storeOrders/{id}       — o pedido (NX-xxxx), itens, pagamento, entrega e histórico.
 *   storeCounters/orders   — sequência do número.
 *
 * Status (códigos da spec):
 *   pag  aguardando pagamento        sep  pago, a separar
 *   sepd separando (ou separado, com `separatedAt`, aguardando remessa/envio)
 *   ret  na arena, pronto p/ retirar tra  em trânsito (entrega em casa)
 *   ent  entregue  rtd  retirado  can  cancelado
 *
 * A reserva de estoque acompanha o pedido desde a criação: no CD (ou direto na
 * arena, se ela já tinha a peça). Numa remessa 06b a transferência assume a
 * reserva (`reservation.active = false`) e devolve ao pedido, já na arena, no
 * recebimento.
 */

export type OrderStatus = "pag" | "sep" | "sepd" | "ret" | "tra" | "ent" | "rtd" | "can";
export type OrderChannel = "web" | "app_ios" | "app_android";
export type DeliveryType = "arena" | "casa";
export type PaymentMethod = "pix" | "cartao" | "saldo";
export type OrderAction =
  | "iniciar_separacao"
  | "marcar_separado"
  | "enviar"
  | "entregue"
  | "confirmar_retirada"
  | "cancelar";

export const ORDER_STATUSES: OrderStatus[] = ["pag", "sep", "sepd", "ret", "tra", "ent", "rtd", "can"];
export const ORDER_ACTIONS: OrderAction[] = [
  "iniciar_separacao", "marcar_separado", "enviar", "entregue", "confirmar_retirada", "cancelar",
];
export const ORDER_CHANNELS: OrderChannel[] = ["web", "app_ios", "app_android"];
export const PAYMENT_METHODS: PaymentMethod[] = ["pix", "cartao", "saldo"];

/** Local de saída de toda entrega em casa e de onde a retirada sai quando a arena não tem a peça. */
export const MAIN_LOCATION = "cd";
export const MAX_ORDER_LINES = 30;

export interface OrderReservation {
  locationId: string;
  /** `false` enquanto uma remessa carrega as peças (a transferência é quem reserva). */
  active: boolean;
}

/** O mínimo do pedido que as regras olham. */
export interface OrderState {
  status: OrderStatus;
  deliveryType: DeliveryType;
  separatedAt: unknown;
  reservation: OrderReservation | null;
  deliveryLocationId: string | null;
  transferId: string | null;
}

export function orderNumber(seq: number): string {
  return `NX-${String(seq).padStart(4, "0")}`;
}

/**
 * Próximo status de cada ação, ou `null` se a ação não vale agora.
 *
 * "Marcar como separado" numa retirada cuja reserva já está na própria arena
 * pula a remessa e vai direto para `ret`; senão fica `sepd` + `separatedAt`
 * esperando a remessa (retirada) ou o envio (entrega).
 */
export function nextOrderStatus(o: OrderState, action: OrderAction): OrderStatus | null {
  const separated = o.separatedAt != null;
  switch (action) {
    case "iniciar_separacao":
      return o.status === "sep" ? "sepd" : null;
    case "marcar_separado":
      if (!((o.status === "sep" || o.status === "sepd") && !separated)) return null;
      return separatedAtArena(o) ? "ret" : "sepd";
    case "enviar":
      return o.status === "sepd" && separated && o.deliveryType === "casa" ? "tra" : null;
    case "entregue":
      return o.status === "tra" ? "ent" : null;
    case "confirmar_retirada":
      return o.status === "ret" ? "rtd" : null;
    case "cancelar":
      return cancelBlockReason(o.status) === null ? "can" : null;
  }
}

/** Retirada separada no balcão da própria arena: a reserva já está lá. */
export function separatedAtArena(o: OrderState): boolean {
  return (
    o.deliveryType === "arena" &&
    o.reservation?.active === true &&
    o.deliveryLocationId != null &&
    o.reservation.locationId === o.deliveryLocationId
  );
}

/** Por que o pedido não pode ser cancelado; `null` = pode. */
export function cancelBlockReason(status: OrderStatus): string | null {
  switch (status) {
    case "tra":
      return "Pedido em trânsito não pode ser cancelado. Abra uma troca/devolução quando chegar.";
    case "ent":
    case "rtd":
      return "Pedido já entregue: abra uma troca/devolução.";
    case "can":
      return "Pedido já cancelado.";
    default:
      return null;
  }
}

/** Valor que ainda dá para devolver: o que foi pago (meios externos + saldo) menos o já reembolsado. */
export function refundableCents(o: {totalCents: number; walletCents: number; refundedCents?: number}): number {
  return Math.max(0, o.totalCents + o.walletCents - (o.refundedCents ?? 0));
}

export interface TotalsInput {
  subtotalCents: number;
  couponDiscountCents: number;
  pixDiscountCents: number;
  walletCents: number;
  shippingCents: number;
}

/** Total cobrado nos meios externos (Pix/cartão): subtotal − cupom − Pix − saldo + frete. */
export function orderTotalCents(t: TotalsInput): number {
  return t.subtotalCents - t.couponDiscountCents - t.pixDiscountCents - t.walletCents + t.shippingCents;
}

/** Pagamentos precisam fechar com o total: externos = total, saldo = `walletCents`. */
export function paymentsMatch(
  payments: {method: PaymentMethod; amountCents: number}[],
  totalCents: number,
  walletCents: number,
): boolean {
  const external = payments.filter((p) => p.method !== "saldo").reduce((n, p) => n + p.amountCents, 0);
  const wallet = payments.filter((p) => p.method === "saldo").reduce((n, p) => n + p.amountCents, 0);
  return external === totalCents && wallet === walletCents;
}

/** Unidades por SKU (`productId/skuId` → qtd), somando linhas repetidas e vários pedidos. */
export function unitsBySku(items: {productId: string; skuId: string; qty: number}[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) {
    const key = `${i.productId}/${i.skuId}`;
    out.set(key, (out.get(key) ?? 0) + i.qty);
  }
  return out;
}

/**
 * A remessa precisa carregar ao menos as peças dos pedidos que ela leva. Devolve
 * as chaves `productId/skuId` que faltam (vazio = cobre).
 */
export function transferCoversOrders(
  transferItems: {productId: string; skuId: string; qty: number}[],
  orderItems: {productId: string; skuId: string; qty: number}[],
): string[] {
  const sent = unitsBySku(transferItems);
  const missing: string[] = [];
  for (const [key, qty] of unitsBySku(orderItems)) {
    if ((sent.get(key) ?? 0) < qty) missing.push(key);
  }
  return missing;
}

/** Por que o pedido não pode entrar na remessa para `to`, saindo de `from`; `null` = pode. */
export function transferLinkError(o: OrderState, from: string, to: string, transferId: string): string | null {
  if (o.deliveryType !== "arena") return "Só pedidos de retirada vão em remessa.";
  if (o.status !== "sep" && o.status !== "sepd") return "Só pedidos pagos ainda não enviados vão em remessa.";
  if (o.deliveryLocationId !== to) return "O pedido é retirado em outra arena.";
  if (o.transferId && o.transferId !== transferId) return "O pedido já está em outra remessa.";
  if (!o.reservation?.active || o.reservation.locationId !== from) return "As peças do pedido não estão reservadas na origem.";
  return null;
}

/** Prazo da retirada: `days` dias corridos depois da chegada, às 22h de São Paulo (01:00 UTC do dia seguinte). */
export function pickupDeadline(arrivedAt: Date, days: number): Date {
  const sp = new Date(arrivedAt.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() + days, 22 + 3));
}

/** Separação atrasada: pago há mais que o prazo de manuseio e ainda em `sep`. */
export function isLateSeparation(status: OrderStatus, paidAt: Date | null, now: Date, handlingHours: number): boolean {
  return status === "sep" && paidAt !== null && now.getTime() - paidAt.getTime() > handlingHours * 3_600_000;
}

const DIGITS = /^\d{4}$/;
export function validPickupCode(code: unknown): code is string {
  return typeof code === "string" && DIGITS.test(code);
}

// ---------------------------------------------------------------------------
// Histórico e avisos
// ---------------------------------------------------------------------------

export interface HistoryActor {
  uid: string;
  name: string;
}

export function historyEntry(type: string, title: string, detail: string, actor: HistoryActor | null, at: Date) {
  return {type, title, detail, actor, at};
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "sáb, 18 out · 22h" no fuso de São Paulo. */
export function deadlineLabel(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3_600_000);
  return `${WEEKDAY[sp.getUTCDay()]}, ${sp.getUTCDate()} ${MONTH[sp.getUTCMonth()]} · ${sp.getUTCHours()}h`;
}

export interface OrderNotice {
  kind: "pickup_code" | "payment" | "shipped" | "canceled";
  uid: string | null;
  number: string;
  orderId: string;
  body: string;
}

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function pickupNotice(o: Doc, deadline: Date): OrderNotice {
  const place = o["delivery"]?.["placeName"] ?? "arena";
  return {
    kind: "pickup_code", uid: o["customer"]?.["uid"] ?? null, number: o["number"], orderId: o["id"] ?? "",
    body: `Seu pedido ${o["number"]} chegou na ${place}. Código de retirada: ${o["delivery"]?.["pickupCode"]}. ` +
      `Retire até ${deadlineLabel(deadline)}.`,
  };
}

// ---------------------------------------------------------------------------
// Remessa 06b: o pedido entra na transferência e chega com ela
// ---------------------------------------------------------------------------

/** Mexe na reserva de um SKU num local (a transação injeta `moveReserved`). */
export type Reserve = (productId: string, skuId: string, locationId: string, delta: number) => void;

export interface LinkedOrder<R> {
  ref: R;
  id: string;
  data: Doc;
}

interface TransferRef {
  id: string;
  code: string;
  fromLocationId: string;
  toLocationId: string;
}

function orderItems(o: Doc): {productId: string; skuId: string; qty: number}[] {
  return (o["items"] ?? []) as {productId: string; skuId: string; qty: number}[];
}

/** O que as regras puras olham do doc do pedido. */
export function orderStateOf(o: Doc): OrderState {
  return {
    status: o["status"], deliveryType: o["delivery"]?.["type"], separatedAt: o["separatedAt"] ?? null,
    reservation: o["reservation"] ?? null, deliveryLocationId: o["delivery"]?.["locationId"] ?? null,
    transferId: o["transferId"] ?? null,
  };
}

/**
 * "Criar transferência" com pedidos: a remessa assume a reserva deles na origem.
 * Solta a reserva do pedido ANTES da remessa reservar (senão a mesma peça conta
 * duas vezes e o disponível recusa). Devolve o erro em texto ou as gravações.
 */
export function linkOrdersPlan<R>(
  orders: LinkedOrder<R>[],
  transfer: TransferRef & {items: {productId: string; skuId: string; qty: number}[]},
  reserve: Reserve,
  actor: HistoryActor,
  now: Date,
): {error: string} | {writes: {ref: R; data: Doc}[]} {
  for (const o of orders) {
    const err = transferLinkError(orderStateOf(o.data), transfer.fromLocationId, transfer.toLocationId, transfer.id);
    if (err) return {error: `${o.data["number"] ?? o.id}: ${err}`};
  }
  const missing = transferCoversOrders(transfer.items, orders.flatMap((o) => orderItems(o.data)));
  if (missing.length > 0) return {error: "A remessa não leva todas as peças dos pedidos selecionados."};
  const writes = orders.map((o) => {
    for (const i of orderItems(o.data)) reserve(i.productId, i.skuId, transfer.fromLocationId, -i.qty);
    return {ref: o.ref, data: {
      transferId: transfer.id, transferCode: transfer.code,
      reservation: {locationId: transfer.fromLocationId, active: false},
      history: [...((o.data["history"] ?? []) as Doc[]),
        historyEntry("remessa", "Remessa criada", `${transfer.code} para a arena`, actor, now)],
      version: ((o.data["version"] ?? 0) as number) + 1, updatedAt: now, updatedBy: actor,
    }};
  });
  return {writes};
}

/** Recebimento da remessa: os pedidos que ela levou ficam prontos para retirar, com a reserva na arena. */
export function arriveOrdersPlan<R>(
  orders: LinkedOrder<R>[],
  transfer: TransferRef & {toName: string},
  reserve: Reserve,
  deadlineDays: number,
  actor: HistoryActor,
  now: Date,
): {writes: {ref: R; data: Doc}[]; notices: OrderNotice[]} {
  const writes: {ref: R; data: Doc}[] = [];
  const notices: OrderNotice[] = [];
  const deadline = pickupDeadline(now, deadlineDays);
  for (const {ref, id, data: o} of orders) {
    // Cancelado no caminho: as peças chegam livres na arena.
    if (o["transferId"] !== transfer.id || (o["status"] !== "sep" && o["status"] !== "sepd")) continue;
    for (const i of orderItems(o)) reserve(i.productId, i.skuId, transfer.toLocationId, i.qty);
    const delivery = {...(o["delivery"] ?? {}), pickupDeadline: deadline};
    writes.push({ref, data: {
      status: "ret", arrivedAt: now, separatedAt: o["separatedAt"] ?? now,
      reservation: {locationId: transfer.toLocationId, active: true}, delivery,
      history: [...((o["history"] ?? []) as Doc[]),
        historyEntry("na_arena", `Recebido na ${transfer.toName}`, `Remessa ${transfer.code}`, actor, now)],
      version: ((o["version"] ?? 0) as number) + 1, updatedAt: now, updatedBy: actor,
    }});
    notices.push(pickupNotice({...o, id, delivery}, deadline));
  }
  return {writes, notices};
}

/** Remessa cancelada na separação: a reserva volta para o pedido, na origem. */
export function releaseOrdersPlan<R>(
  orders: LinkedOrder<R>[],
  transfer: TransferRef,
  reserve: Reserve,
  actor: HistoryActor,
  now: Date,
): {ref: R; data: Doc}[] {
  const writes: {ref: R; data: Doc}[] = [];
  for (const {ref, data: o} of orders) {
    if (o["transferId"] !== transfer.id) continue;
    const alive = o["status"] !== "can";
    if (alive) for (const i of orderItems(o)) reserve(i.productId, i.skuId, transfer.fromLocationId, i.qty);
    writes.push({ref, data: {
      transferId: null, transferCode: null,
      reservation: alive ? {locationId: transfer.fromLocationId, active: true} : o["reservation"] ?? null,
      history: [...((o["history"] ?? []) as Doc[]),
        historyEntry("remessa", "Saiu da remessa", `${transfer.code} cancelada`, actor, now)],
      version: ((o["version"] ?? 0) as number) + 1, updatedAt: now, updatedBy: actor,
    }});
  }
  return writes;
}
