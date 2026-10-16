/**
 * Escrita de Trocas & devoluções (tela 09).
 *
 * O status e o estoque andam juntos na mesma transação: aprovar uma troca
 * reserva a nova variação; receber o produto devolve ao saldo (entrada
 * "devolução") e entrega a nova variação (saída). Dinheiro (estorno, carteira)
 * fica registrado como pendente até o Financeiro da Loja existir.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {type StockMovementItem} from "./store-catalog";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";
import {STORE_CONFIG} from "./store-pickup";
import {availableAt} from "./store-stock";
import {
  assertLocation,
  describe,
  loadProducts,
  moveReserved,
  moveStock,
  skuOf,
  writeProducts,
  type LoadedProduct,
} from "./store-stock-write";
import {
  RETURNS_CONFIG_ID,
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  canSkipReturn,
  nextReturnStatus,
  returnCode,
  returnShipping,
  withReturnsDefaults,
  withinWindow,
  type ReturnAction,
  type ReturnMethodType,
  type ReturnReason,
  type ReturnResolution,
  type ReturnStatus,
} from "./store-returns";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};
const RETURNS = "storeReturns";
const MOVEMENTS = "storeStockMovements";
const COUNTERS = "storeCounters";
/** Saída de reenvio e devolução pelos Correios: sempre o CD principal. */
const MAIN_LOCATION = "cd";

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Data = FirebaseFirestore.DocumentData;

const RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  troca: "Troca",
  reembolso: "Reembolso",
  saldo: "Saldo na carteira",
  reenvio: "Reenvio",
};

function invalid(fields: string[], message = "Dados inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields: [...new Set(fields)].sort()});
}

function conflict(existing: Data): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Esta solicitação foi alterada por outra pessoa. Recarregue antes de continuar.",
    {updatedBy: existing["updatedBy"], updatedAt: existing["updatedAt"]},
  );
}

const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

async function readConfig(tx: FirebaseFirestore.Transaction, db: Firestore) {
  const snap = await tx.get(db.collection(STORE_CONFIG).doc(RETURNS_CONFIG_ID));
  return withReturnsDefaults(snap.data());
}

// ---------------------------------------------------------------------------
// Abertura (balcão)
// ---------------------------------------------------------------------------

export interface CreateReturnInput {
  returnId: string;
  customerName: string;
  customerContact: string;
  orderRef: string;
  orderDate: string;
  deliveredAt: string;
  productId: string;
  skuId: string;
  newSkuId: string | null;
  reason: ReturnReason;
  message: string;
  photos: {url: string; path: string}[];
  resolution: ReturnResolution;
  returnMethod: {type: ReturnMethodType; locationId: string | null};
  /** Valor pago no item (com cupom/Pix rateados): base do reembolso/crédito. */
  paidCents: number | null;
}

function createErrors(input: CreateReturnInput): string[] {
  const fields: string[] = [];
  if (!ID_RE.test(text(input.returnId, 64))) fields.push("returnId");
  if (!text(input.customerName)) fields.push("customerName");
  if (!text(input.productId) || !text(input.skuId, 120)) fields.push("skuId");
  if (!RETURN_REASONS.includes(input.reason)) fields.push("reason");
  if (!RETURN_RESOLUTIONS.includes(input.resolution)) fields.push("resolution");
  if (input.resolution === "troca" && (!input.newSkuId || input.newSkuId === input.skuId)) fields.push("newSkuId");
  if (input.orderDate && !DATE_RE.test(input.orderDate)) fields.push("orderDate");
  if (input.deliveredAt && !DATE_RE.test(input.deliveredAt)) fields.push("deliveredAt");
  const type = input.returnMethod?.type;
  if (type !== "arena" && type !== "correios") fields.push("returnMethod");
  if (type === "arena" && !input.returnMethod?.locationId) fields.push("returnMethod");
  if (input.paidCents != null && (!isInt(input.paidCents) || input.paidCents < 0)) fields.push("paidCents");
  const photos = Array.isArray(input.photos) ? input.photos : [];
  const prefix = `store/returns/${input.returnId}/`;
  if (photos.length > 3 || photos.some((p) => !text(p?.path, 300).startsWith(prefix) || !text(p?.url, 2000).startsWith("https://"))) {
    fields.push("photos");
  }
  return fields;
}

export async function createReturnCore(
  db: Firestore,
  input: CreateReturnInput,
  actor: Actor,
  now: Date,
): Promise<{returnId: string; code: string}> {
  const fields = createErrors(input ?? ({} as CreateReturnInput));
  if (fields.length > 0) throw invalid(fields, "Faltam dados da solicitação.");
  const ref = db.collection(RETURNS).doc(input.returnId);
  const counterRef = db.collection(COUNTERS).doc("returns");

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    if ((await tx.get(ref)).exists) throw new HttpsError("already-exists", "Esta solicitação já foi aberta.");
    const counter = await tx.get(counterRef);
    const config = await readConfig(tx, db);
    const products = await loadProducts(tx, db, [input.productId]);
    const item = describe(products, input.productId, input.skuId);
    const newItem = input.newSkuId ? describe(products, input.productId, input.newSkuId) : null;
    const locationId = input.returnMethod.type === "arena" ? text(input.returnMethod.locationId, 64) : null;
    if (locationId) await assertLocation(tx, db, locationId, "returnMethod");

    // ---------- escritas ----------
    const next = (counter.data()?.["next"] ?? 1) as number;
    const code = returnCode(next);
    tx.set(counterRef, {next: next + 1}, {merge: true});
    tx.set(ref, {
      code,
      source: "balcao",
      status: "analisar" as ReturnStatus,
      customer: {name: text(input.customerName, 120), contact: text(input.customerContact, 120)},
      orderRef: text(input.orderRef, 40),
      orderDate: input.orderDate || null,
      deliveredAt: input.deliveredAt || null,
      item: {productId: input.productId, skuId: input.skuId, ...item},
      newItem: newItem ? {productId: input.productId, skuId: input.newSkuId, ...newItem} : null,
      reason: input.reason,
      message: text(input.message, 1000),
      photos: (input.photos ?? []).map((p) => ({url: p.url, path: p.path})),
      resolution: input.resolution,
      returnMethod: {type: input.returnMethod.type, locationId, ...returnShipping(input.returnMethod.type, input.reason, config)},
      paidCents: input.paidCents ?? null,
      history: [{status: "analisar", actor, at: now, note: "Aberta no balcão"}],
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor,
    });
    return {returnId: ref.id, code};
  });
}

// ---------------------------------------------------------------------------
// Decisão e andamento
// ---------------------------------------------------------------------------

export interface ReturnActionInput {
  returnId: string;
  version: number;
  action: ReturnAction;
  /** Recusar: obrigatório, vai para o cliente. */
  refusalReason?: string;
  /** Aprovar: troca de resolução ("alterar resolução") e variação nova. */
  resolution?: ReturnResolution;
  newSkuId?: string | null;
  skipReturn?: boolean;
  /** Fora do prazo, aprovar exige confirmação explícita. */
  confirmOutOfWindow?: boolean;
  /** Receber: conferência do produto devolvido. */
  inspection?: "ok" | "avariado";
}

/** Onde a peça nova sai: na arena de devolução (troca em mãos) ou no CD. */
function reservationLocation(r: Data, resolution: ReturnResolution): string {
  if (resolution === "troca" && r["returnMethod"]?.type === "arena" && r["returnMethod"]?.locationId) {
    return r["returnMethod"].locationId as string;
  }
  return MAIN_LOCATION;
}

function movementItem(
  products: Map<string, LoadedProduct>,
  productId: string,
  skuId: string,
  locationId: string,
  delta: number,
  before: number,
  after: number,
): StockMovementItem {
  return {productId, skuId, ...describe(products, productId, skuId), locationId, delta, before, after};
}

export async function returnActionCore(
  db: Firestore,
  input: ReturnActionInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; status: ReturnStatus}> {
  if (!ID_RE.test(text(input?.returnId, 64))) throw invalid(["returnId"]);
  const ref = db.collection(RETURNS).doc(input.returnId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Solicitação não encontrada.");
    const r = snap.data()!;
    if (r["version"] !== input.version) throw conflict(r);
    const config = await readConfig(tx, db);

    const resolution: ReturnResolution =
      input.action === "aprovar" && input.resolution && RETURN_RESOLUTIONS.includes(input.resolution)
        ? input.resolution
        : (r["resolution"] as ReturnResolution);
    const skipReturn =
      input.action === "aprovar" ? input.skipReturn === true : r["skipReturn"] === true;
    const status = nextReturnStatus(r["status"] as ReturnStatus, input.action, {resolution, skipReturn});
    if (!status) {
      throw new HttpsError("failed-precondition", "Esta ação não vale para o status atual da solicitação.", {current: r["status"]});
    }

    const productId = r["item"]["productId"] as string;
    const products = await loadProducts(tx, db, [productId]);
    const code = r["code"] as string;
    const history = [...((r["history"] ?? []) as Data[])];
    let updates: Data = {};

    if (input.action === "recusar") {
      const reason = text(input.refusalReason, 500);
      if (!reason) throw invalid(["refusalReason"], "Informe o motivo da recusa (ele vai para o cliente).");
      updates = {refusalReason: reason};
      history.push({status, actor, at: now, note: reason});
    }

    if (input.action === "aprovar") {
      if (!withinWindow(r["deliveredAt"] ?? null, now, config) && input.confirmOutOfWindow !== true) {
        throw new HttpsError("failed-precondition", `Fora do prazo de ${config.windowDays} dias. Confirme para aprovar mesmo assim.`, {outOfWindow: true});
      }
      if (skipReturn && !canSkipReturn(r["reason"] as ReturnReason, resolution)) {
        throw invalid(["skipReturn"], "Só reenvio por defeito ou avaria dispensa a volta do produto.");
      }
      const newSkuId = resolution === "troca" ? (input.newSkuId ?? r["newItem"]?.["skuId"] ?? null) : null;
      if (resolution === "troca" && (!newSkuId || newSkuId === r["item"]["skuId"])) {
        throw invalid(["newSkuId"], "Escolha a variação nova da troca.");
      }
      // Troca e reenvio prendem uma peça: troca, da variação nova; reenvio, da mesma.
      let reservation: Data | null = null;
      if (resolution === "troca" || resolution === "reenvio") {
        const skuId = (resolution === "troca" ? newSkuId : r["item"]["skuId"]) as string;
        const locationId = reservationLocation(r, resolution);
        const sku = skuOf(products, productId, skuId);
        if (availableAt(sku.data, locationId) < 1) {
          throw new HttpsError(
            "failed-precondition",
            "Sem estoque da variação para reservar. Aprove como saldo na carteira ou faça uma transferência antes.",
            {noStock: true, locationId},
          );
        }
        moveReserved(sku, locationId, 1);
        reservation = {productId, skuId, locationId, qty: 1};
      }
      updates = {
        resolution,
        skipReturn,
        reservation,
        newItem: newSkuId ? {productId, skuId: newSkuId, ...describe(products, productId, newSkuId)} : null,
        approvedOutOfWindow: !withinWindow(r["deliveredAt"] ?? null, now, config),
      };
      history.push({status, actor, at: now, note: `Aprovada: ${RESOLUTION_LABEL[resolution]}`});
    }

    if (input.action === "em_transito") {
      history.push({status, actor, at: now, note: "Cliente enviou / vai entregar na arena"});
    }

    if (input.action === "receber" || input.action === "concluir") {
      const movements: {type: string; items: StockMovementItem[]; reference: string; reason: string; subtype?: string; toLocationId?: string | null}[] = [];

      if (input.action === "receber") {
        if (input.inspection !== "ok" && input.inspection !== "avariado") throw invalid(["inspection"], "Informe a conferência do produto.");
        const at = r["returnMethod"]?.type === "arena" && r["returnMethod"]?.locationId ? (r["returnMethod"].locationId as string) : MAIN_LOCATION;
        if (input.inspection === "ok") {
          const sku = skuOf(products, productId, r["item"]["skuId"]);
          const {before, after} = moveStock(sku, at, 1);
          movements.push({
            type: "entrada", subtype: "devolucao", toLocationId: at,
            items: [movementItem(products, productId, r["item"]["skuId"], at, 1, before, after)],
            reference: `Devolução ${code}`, reason: "Produto devolvido conferido",
          });
        }
        updates = {inspection: input.inspection, receivedAt: now};
        history.push({status, actor, at: now, note: input.inspection === "ok" ? "Produto recebido e conferido" : "Produto avariado: não volta ao estoque"});
      } else {
        history.push({status, actor, at: now, note: "Reenvio saiu sem esperar o retorno"});
      }

      // A peça reservada sai para o cliente: troca entregue / reenvio despachado.
      const res = r["reservation"] as {productId: string; skuId: string; locationId: string; qty: number} | null;
      if (res) {
        const sku = skuOf(products, res.productId, res.skuId);
        moveReserved(sku, res.locationId, -res.qty);
        const {before, after} = moveStock(sku, res.locationId, -res.qty);
        movements.push({
          type: "saida", toLocationId: null,
          items: [movementItem(products, res.productId, res.skuId, res.locationId, -res.qty, before, after)],
          reference: `${RESOLUTION_LABEL[r["resolution"] as ReturnResolution]} ${code}`,
          reason: `${RESOLUTION_LABEL[r["resolution"] as ReturnResolution]} para ${r["customer"]?.["name"] ?? "cliente"}`,
        });
      }
      for (const m of movements) {
        tx.set(db.collection(MOVEMENTS).doc(), {
          type: m.type, status: "confirmada", ...(m.subtype ? {subtype: m.subtype} : {}),
          fromLocationId: null, toLocationId: m.toLocationId ?? null,
          items: m.items, productIds: [productId], reference: m.reference, reason: m.reason,
          returnId: ref.id, actor, createdAt: now,
        });
      }
      // Dinheiro ainda não sai daqui: fica pendente para o Financeiro da Loja.
      const kind = r["resolution"] as ReturnResolution;
      if (kind === "reembolso" || kind === "saldo") {
        updates = {...updates, settlement: {type: kind, amountCents: r["paidCents"] ?? null, status: "pendente"}};
      }
      updates = {...updates, completedAt: now};
    }

    // ---------- escritas ----------
    writeProducts(tx, products, actor, now);
    const version = input.version + 1;
    tx.set(ref, {...updates, status, history, version, updatedAt: now, updatedBy: actor}, {merge: true});
    return {version, status};
  });
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

async function actorOf(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return assertCatalogAdmin(uid);
}

export const createStoreReturn = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return createReturnCore(getFirestore(), (request.data ?? {}) as CreateReturnInput, actor, new Date());
});

export const storeReturnAction = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return returnActionCore(getFirestore(), (request.data ?? {}) as ReturnActionInput, actor, new Date());
});
