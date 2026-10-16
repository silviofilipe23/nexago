/**
 * Escrita do estoque da Loja: entrada (06a) e transferência (06b).
 *
 * Saldo nunca é editado direto: toda mudança passa por aqui numa transação que
 * altera o SKU, recalcula os rollups do produto, sobe a versão dele (a grade da
 * tela 05 não pode sobrescrever o que entrou no meio) e grava a movimentação.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore, type Transaction} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {lowStockSkuCount, variantLabelOf, type Axis, type StockMovementItem} from "./store-catalog";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";
import {
  ENTRY_SUBTYPES,
  MAX_STOCK_LINES,
  availableAt,
  nextTransferStatus,
  nfKey,
  transferCode,
  unitCostsWithFreight,
  weightedAverageCost,
  type EntrySubtype,
  type TransferAction,
  type TransferStatus,
} from "./store-stock";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

const PRODUCTS = "storeProducts";
const COSTS = "storeProductCosts";
const KEYS = "storeCatalogKeys";
const LOCATIONS = "storeLocations";
const MOVEMENTS = "storeStockMovements";
const DRAFTS = "storeStockDrafts";
const TRANSFERS = "storeTransfers";
const COUNTERS = "storeCounters";

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ATTACHMENT_TYPES = /^(application\/pdf|application\/xml|text\/xml|image\/(jpeg|png|webp))$/;

type Data = FirebaseFirestore.DocumentData;

function invalid(fields: string[], message = "Dados inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields: [...new Set(fields)].sort()});
}

function conflict(existing: Data): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Este registro foi alterado por outra pessoa. Recarregue antes de salvar.",
    {updatedBy: existing["updatedBy"], updatedAt: existing["updatedAt"]},
  );
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lineKey = (productId: string, skuId: string) => `${productId}/${skuId}`;

// ---------------------------------------------------------------------------
// Leitura e gravação dos SKUs tocados, compartilhada por entrada e transferência
// ---------------------------------------------------------------------------

interface LoadedSku {
  ref: FirebaseFirestore.DocumentReference;
  data: Data;
  touched: boolean;
}

interface LoadedProduct {
  ref: FirebaseFirestore.DocumentReference;
  data: Data;
  skus: Map<string, LoadedSku>;
  costsRef: FirebaseFirestore.DocumentReference;
  costs: Data;
}

/** Só leituras: a transação recusa ler depois de escrever. */
async function loadProducts(tx: Transaction, db: Firestore, productIds: string[]): Promise<Map<string, LoadedProduct>> {
  const out = new Map<string, LoadedProduct>();
  for (const productId of [...new Set(productIds)]) {
    const ref = db.collection(PRODUCTS).doc(productId);
    const costsRef = db.collection(COSTS).doc(productId);
    const [snap, skusSnap, costsSnap] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("skus")),
      tx.get(costsRef),
    ]);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Produto não encontrado.", {productId});
    }
    const skus = new Map<string, LoadedSku>();
    for (const d of skusSnap.docs) skus.set(d.id, {ref: d.ref, data: {...d.data()}, touched: false});
    out.set(productId, {ref, data: snap.data()!, skus, costsRef, costs: costsSnap.exists ? {...costsSnap.data()} : {}});
  }
  return out;
}

function skuOf(products: Map<string, LoadedProduct>, productId: string, skuId: string): LoadedSku {
  const sku = products.get(productId)?.skus.get(skuId);
  if (!sku) {
    throw new HttpsError("not-found", "Variação não encontrada.", {productId, skuId});
  }
  return sku;
}

function describe(products: Map<string, LoadedProduct>, productId: string, skuId: string) {
  const product = products.get(productId)!;
  const sku = skuOf(products, productId, skuId);
  return {
    skuCode: (sku.data["code"] ?? "") as string,
    productName: (product.data["name"] ?? "") as string,
    variantLabel: variantLabelOf(
      (sku.data["axisValues"] ?? {}) as Record<string, string>,
      (product.data["axes"] ?? []) as Axis[],
    ),
  };
}

/** Muda o saldo de um SKU num local e devolve o antes/depois para a movimentação. */
function moveStock(sku: LoadedSku, locationId: string, delta: number): {before: number; after: number} {
  const byLocation = {...((sku.data["stockByLocation"] ?? {}) as Record<string, number>)};
  const before = byLocation[locationId] ?? 0;
  const after = before + delta;
  if (after < 0) {
    throw new HttpsError("failed-precondition", "O saldo ficaria negativo.", {locationId, before, delta});
  }
  byLocation[locationId] = after;
  sku.data["stockByLocation"] = byLocation;
  sku.data["stock"] = Object.values(byLocation).reduce((n, q) => n + q, 0);
  sku.touched = true;
  return {before, after};
}

function moveReserved(sku: LoadedSku, locationId: string, delta: number): void {
  const reserved = {...((sku.data["reservedByLocation"] ?? {}) as Record<string, number>)};
  reserved[locationId] = Math.max(0, (reserved[locationId] ?? 0) + delta);
  sku.data["reservedByLocation"] = reserved;
  sku.touched = true;
}

/** Grava os SKUs tocados e recalcula os rollups de cada produto (sobe a versão). */
function writeProducts(tx: Transaction, products: Map<string, LoadedProduct>, actor: Actor, now: Date): void {
  for (const product of products.values()) {
    const touched = [...product.skus.values()].filter((s) => s.touched);
    if (touched.length === 0) continue;
    for (const sku of touched) {
      tx.set(
        sku.ref,
        {
          stockByLocation: sku.data["stockByLocation"] ?? {},
          stock: sku.data["stock"] ?? 0,
          reservedByLocation: sku.data["reservedByLocation"] ?? {},
        },
        {merge: true},
      );
    }
    const all = [...product.skus.values()].map((s) => ({stock: (s.data["stock"] ?? 0) as number}));
    tx.set(
      product.ref,
      {
        stockTotal: all.reduce((n, s) => n + s.stock, 0),
        lowStockSkuCount: lowStockSkuCount(all, (product.data["lowStockThreshold"] ?? 0) as number),
        version: ((product.data["version"] ?? 0) as number) + 1,
        updatedAt: now,
        updatedBy: actor,
      },
      {merge: true},
    );
  }
}

async function assertLocation(tx: Transaction, db: Firestore, id: unknown, field: string): Promise<string> {
  if (typeof id !== "string" || id === "") throw invalid([field]);
  const snap = await tx.get(db.collection(LOCATIONS).doc(id));
  if (!snap.exists || snap.data()?.["active"] === false) {
    throw new HttpsError("invalid-argument", "Local de estoque não cadastrado.", {fields: [field]});
  }
  return id;
}

function locationName(snapData: Data | undefined, id: string): string {
  return (snapData?.["name"] as string | undefined) ?? id;
}

// ---------------------------------------------------------------------------
// 06a · Entrada
// ---------------------------------------------------------------------------

export interface EntryLineInput {
  productId: string;
  skuId: string;
  qty: number;
  unitCostCents: number;
}

export interface EntryAttachment {
  name: string;
  path: string;
  url: string;
  contentType: string;
}

export interface StockEntryInput {
  entryId: string;
  subtype: EntrySubtype;
  supplier: string;
  nfNumber: string;
  purchaseOrder: string;
  originOrder: string;
  reason: string;
  toLocationId: string;
  receivedAt: string;
  freightCents: number;
  items: EntryLineInput[];
  note: string;
  attachments: EntryAttachment[];
  options: {updateAvgCost: boolean};
}

function sanitizeEntry(input: StockEntryInput): StockEntryInput {
  return {
    entryId: text(input.entryId, 64),
    subtype: input.subtype,
    supplier: text(input.supplier, 120),
    nfNumber: text(input.nfNumber, 40),
    purchaseOrder: text(input.purchaseOrder, 40),
    originOrder: text(input.originOrder, 40),
    reason: text(input.reason, 200),
    toLocationId: text(input.toLocationId, 64),
    receivedAt: text(input.receivedAt, 10),
    freightCents: input.subtype === "compra" && isInt(input.freightCents) ? input.freightCents : 0,
    items: (Array.isArray(input.items) ? input.items : []).map((i) => ({
      productId: text(i?.productId, 64),
      skuId: text(i?.skuId, 120),
      qty: i?.qty as number,
      unitCostCents: i?.unitCostCents as number,
    })),
    note: text(input.note, 2000),
    attachments: (Array.isArray(input.attachments) ? input.attachments : []).slice(0, 10).map((a) => ({
      name: text(a?.name, 160),
      path: text(a?.path, 300),
      url: text(a?.url, 2000),
      contentType: text(a?.contentType, 60),
    })),
    options: {updateAvgCost: input.options?.updateAvgCost !== false},
  };
}

/** O que o rascunho aceita: estrutura válida, sem cobrar os obrigatórios. */
function shapeErrors(e: StockEntryInput): string[] {
  const fields: string[] = [];
  if (!ID_RE.test(e.entryId)) fields.push("entryId");
  if (!ENTRY_SUBTYPES.includes(e.subtype)) fields.push("subtype");
  if (e.receivedAt !== "" && !DATE_RE.test(e.receivedAt)) fields.push("receivedAt");
  if (!isInt(e.freightCents) || e.freightCents < 0) fields.push("freightCents");
  if (e.items.length > MAX_STOCK_LINES) fields.push("items");
  const seen = new Set<string>();
  for (const item of e.items) {
    const key = lineKey(item.productId, item.skuId);
    if (!item.productId || !item.skuId || seen.has(key)) fields.push("items");
    if (!isInt(item.qty) || !isInt(item.unitCostCents) || item.unitCostCents < 0) fields.push("items");
    seen.add(key);
  }
  const prefix = `store/stock/${e.entryId}/`;
  for (const a of e.attachments) {
    if (!a.path.startsWith(prefix) || a.path.includes("..") || !a.url.startsWith("https://") || !ATTACHMENT_TYPES.test(a.contentType)) {
      fields.push("attachments");
    }
  }
  return fields;
}

/** Obrigatórios para confirmar; mudam com a origem da entrada. */
function confirmErrors(e: StockEntryInput): string[] {
  const fields = shapeErrors(e);
  if (!e.toLocationId) fields.push("toLocationId");
  if (!DATE_RE.test(e.receivedAt)) fields.push("receivedAt");
  if (e.items.length === 0) fields.push("items");
  if (e.subtype === "compra") {
    if (!e.supplier) fields.push("supplier");
    if (!e.nfNumber) fields.push("nfNumber");
  }
  if (e.subtype === "devolucao") {
    if (!e.originOrder) fields.push("originOrder");
    if (!e.reason) fields.push("reason");
  }
  if (e.subtype === "ajuste" && !e.reason) fields.push("reason");
  for (const item of e.items) {
    // Só o ajuste de inventário pode tirar unidades; zero não é movimentação.
    if (e.subtype === "ajuste" ? item.qty === 0 : item.qty < 1) fields.push("items");
  }
  return fields;
}

function entryReference(e: StockEntryInput): string {
  switch (e.subtype) {
    case "compra":
      return `NF ${e.nfNumber} · ${e.supplier}`;
    case "devolucao":
      return `Devolução · pedido ${e.originOrder}`;
    case "ajuste":
      return e.reason;
    case "producao":
      return "Produção própria";
  }
}

export async function saveStockEntryDraftCore(
  db: Firestore,
  raw: StockEntryInput,
  actor: Actor,
  now: Date,
): Promise<{entryId: string}> {
  const e = sanitizeEntry(raw);
  const fields = shapeErrors(e);
  if (fields.length > 0) throw invalid(fields);
  const ref = db.collection(DRAFTS).doc(e.entryId);
  return db.runTransaction(async (tx) => {
    const [draft, done] = await Promise.all([tx.get(ref), tx.get(db.collection(MOVEMENTS).doc(e.entryId))]);
    if (done.exists) {
      throw new HttpsError("failed-precondition", "Esta entrada já foi confirmada.");
    }
    tx.set(ref, {
      kind: "entrada",
      ...e,
      createdAt: draft.exists ? draft.data()!["createdAt"] : now,
      updatedAt: now,
      updatedBy: actor,
    });
    return {entryId: e.entryId};
  });
}

export async function deleteStockDraftCore(db: Firestore, input: {entryId: string}): Promise<void> {
  if (!ID_RE.test(input?.entryId ?? "")) throw invalid(["entryId"]);
  await db.collection(DRAFTS).doc(input.entryId).delete();
}

export async function confirmStockEntryCore(
  db: Firestore,
  raw: StockEntryInput,
  actor: Actor,
  now: Date,
): Promise<{movementId: string; units: number}> {
  const e = sanitizeEntry(raw);
  const fields = confirmErrors(e);
  if (fields.length > 0) throw invalid(fields, "Faltam campos para confirmar a entrada.");

  const movementRef = db.collection(MOVEMENTS).doc(e.entryId);
  const keyRef = e.subtype === "compra" ? db.collection(KEYS).doc(nfKey(e.supplier, e.nfNumber)) : null;

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    if ((await tx.get(movementRef)).exists) {
      throw new HttpsError("failed-precondition", "Esta entrada já foi confirmada.");
    }
    if (keyRef) {
      const key = await tx.get(keyRef);
      if (key.exists) {
        const at = key.data()!["receivedAt"] ?? "";
        throw new HttpsError("already-exists", `Esta NF já foi registrada em ${at}.`, {fields: ["nfNumber"], receivedAt: at});
      }
    }
    await assertLocation(tx, db, e.toLocationId, "toLocationId");
    const products = await loadProducts(tx, db, e.items.map((i) => i.productId));

    // ---------- cálculo ----------
    const withFreight = unitCostsWithFreight(
      e.items.map((i) => ({qty: i.qty, unitCostCents: i.unitCostCents})),
      e.freightCents,
    );
    const items: (StockMovementItem & {qty: number; unitCostCents: number; unitCostWithFreightCents: number})[] = [];
    e.items.forEach((item, idx) => {
      const product = products.get(item.productId)!;
      const sku = skuOf(products, item.productId, item.skuId);
      const totalBefore = (sku.data["stock"] ?? 0) as number;
      const reserved = ((sku.data["reservedByLocation"] ?? {}) as Record<string, number>)[e.toLocationId] ?? 0;
      const {before, after} = moveStock(sku, e.toLocationId, item.qty);
      if (item.qty < 0 && after < reserved) {
        throw new HttpsError("failed-precondition", "O ajuste tiraria unidades já reservadas.", {skuId: item.skuId});
      }
      if (item.qty > 0 && e.options.updateAvgCost) {
        const skuCosts = {...((product.costs["skuCosts"] ?? {}) as Record<string, number>)};
        const currentAvg = skuCosts[item.skuId] ?? (product.costs["costCents"] as number | null | undefined) ?? null;
        skuCosts[item.skuId] = weightedAverageCost(totalBefore, currentAvg, item.qty, withFreight[idx]!);
        product.costs["skuCosts"] = skuCosts;
      }
      if (e.subtype === "compra") {
        // "Última compra" sem frete: é o número que o fornecedor cobrou, o que o alerta compara.
        product.costs["lastPurchaseCents"] = {
          ...((product.costs["lastPurchaseCents"] ?? {}) as Record<string, number>),
          [item.skuId]: item.unitCostCents,
        };
      }
      items.push({
        productId: item.productId,
        skuId: item.skuId,
        ...describe(products, item.productId, item.skuId),
        locationId: e.toLocationId,
        delta: item.qty,
        before,
        after,
        qty: item.qty,
        unitCostCents: item.unitCostCents,
        unitCostWithFreightCents: withFreight[idx]!,
      });
    });

    // ---------- escritas ----------
    writeProducts(tx, products, actor, now);
    for (const product of products.values()) {
      if (product.costs["skuCosts"] || product.costs["lastPurchaseCents"]) {
        tx.set(
          product.costsRef,
          {
            skuCosts: product.costs["skuCosts"] ?? {},
            lastPurchaseCents: product.costs["lastPurchaseCents"] ?? {},
            updatedAt: now,
          },
          {merge: true},
        );
      }
    }
    const units = e.items.reduce((n, i) => n + i.qty, 0);
    tx.set(movementRef, {
      type: e.subtype === "ajuste" ? "ajuste" : "entrada",
      status: "confirmada",
      subtype: e.subtype,
      fromLocationId: null,
      toLocationId: e.toLocationId,
      items,
      productIds: [...products.keys()],
      reference: entryReference(e),
      reason: e.reason || null,
      supplier: e.supplier || null,
      nfNumber: e.nfNumber || null,
      purchaseOrder: e.purchaseOrder || null,
      originOrder: e.originOrder || null,
      receivedAt: e.receivedAt,
      freightCents: e.freightCents,
      totalCostCents: e.items.reduce((n, i) => n + Math.max(0, i.qty) * i.unitCostCents, 0) + e.freightCents,
      note: e.note,
      attachments: e.attachments,
      options: e.options,
      actor,
      createdAt: now,
    });
    if (keyRef) tx.set(keyRef, {movementId: e.entryId, receivedAt: e.receivedAt});
    tx.delete(db.collection(DRAFTS).doc(e.entryId));
    return {movementId: e.entryId, units};
  });
}

// ---------------------------------------------------------------------------
// 06b · Transferência
// ---------------------------------------------------------------------------

export interface TransferInput {
  transferId?: string;
  version?: number;
  fromLocationId: string;
  toLocationId: string;
  items: {productId: string; skuId: string; qty: number}[];
  transport: string;
  departAt: string;
  arriveAt: string;
  receiver: string;
  note: string;
  /** true = "Criar transferência": sai do rascunho para a separação e reserva na origem. */
  submit: boolean;
}

function transferFields(input: TransferInput): string[] {
  const fields: string[] = [];
  if (!input.fromLocationId) fields.push("fromLocationId");
  if (!input.toLocationId) fields.push("toLocationId");
  if (input.fromLocationId && input.fromLocationId === input.toLocationId) fields.push("toLocationId");
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length > MAX_STOCK_LINES) fields.push("items");
  if (input.submit && items.length === 0) fields.push("items");
  const seen = new Set<string>();
  for (const item of items) {
    const key = lineKey(item?.productId, item?.skuId);
    if (!item?.productId || !item?.skuId || seen.has(key) || !isInt(item.qty) || item.qty < 1) fields.push("items");
    seen.add(key);
  }
  return fields;
}

export async function saveTransferCore(
  db: Firestore,
  raw: TransferInput,
  actor: Actor,
  now: Date,
): Promise<{transferId: string; code: string; version: number; status: TransferStatus}> {
  const input: TransferInput = {...raw, items: Array.isArray(raw?.items) ? raw.items : [], submit: raw?.submit === true};
  const fields = transferFields(input);
  if (fields.length > 0) throw invalid(fields);
  const ref = input.transferId ? db.collection(TRANSFERS).doc(input.transferId) : db.collection(TRANSFERS).doc();
  const counterRef = db.collection(COUNTERS).doc("transfers");

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data()! : null;
    if (input.transferId && !existing) throw new HttpsError("not-found", "Transferência não encontrada.");
    if (existing && existing["version"] !== input.version) throw conflict(existing);
    if (existing && existing["status"] !== "rascunho") {
      throw new HttpsError("failed-precondition", "Só o rascunho pode ser editado.");
    }
    const counter = existing ? null : await tx.get(counterRef);
    await assertLocation(tx, db, input.fromLocationId, "fromLocationId");
    await assertLocation(tx, db, input.toLocationId, "toLocationId");
    const products = await loadProducts(tx, db, input.items.map((i) => i.productId));

    // ---------- cálculo ----------
    const items = input.items.map((item) => {
      const sku = skuOf(products, item.productId, item.skuId);
      if (input.submit) {
        const max = availableAt(sku.data, input.fromLocationId);
        if (item.qty > max) {
          throw new HttpsError("failed-precondition", `Quantidade acima do disponível na origem (máx. ${max}).`, {
            fields: ["items"],
            skuId: item.skuId,
            max,
          });
        }
        moveReserved(sku, input.fromLocationId, item.qty);
      }
      return {productId: item.productId, skuId: item.skuId, qty: item.qty, ...describe(products, item.productId, item.skuId)};
    });
    const status: TransferStatus = input.submit ? "separacao" : "rascunho";
    const next = ((counter?.data()?.["next"] ?? 1) as number);
    const code = (existing?.["code"] as string | undefined) ?? transferCode(next);
    const version = ((existing?.["version"] ?? 0) as number) + 1;
    const history = [...((existing?.["history"] ?? []) as Data[])];
    if (!existing) history.push({status: "rascunho", actor, at: now});
    if (input.submit) history.push({status: "separacao", actor, at: now});

    // ---------- escritas ----------
    if (counter) tx.set(counterRef, {next: next + 1}, {merge: true});
    if (input.submit) writeProducts(tx, products, actor, now);
    tx.set(ref, {
      code,
      status,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      items,
      productIds: [...products.keys()],
      units: items.reduce((n, i) => n + i.qty, 0),
      transport: text(input.transport, 120),
      departAt: text(input.departAt, 20),
      arriveAt: text(input.arriveAt, 20),
      receiver: text(input.receiver, 120),
      note: text(input.note, 2000),
      history,
      version,
      createdAt: existing?.["createdAt"] ?? now,
      createdBy: existing?.["createdBy"] ?? actor,
      updatedAt: now,
      updatedBy: actor,
    });
    return {transferId: ref.id, code, version, status};
  });
}

export interface AdvanceTransferInput {
  transferId: string;
  version: number;
  action: TransferAction;
  /** Conferência na arena: `productId/skuId` → unidades recebidas. Omitido = recebeu tudo. */
  received?: Record<string, number>;
  reason?: string;
}

export async function advanceTransferCore(
  db: Firestore,
  input: AdvanceTransferInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; status: TransferStatus}> {
  if (typeof input?.transferId !== "string" || input.transferId === "") throw invalid(["transferId"]);
  if (input.action === "separacao") {
    throw new HttpsError("invalid-argument", "Use \"Criar transferência\" para sair do rascunho.");
  }
  const ref = db.collection(TRANSFERS).doc(input.transferId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Transferência não encontrada.");
    const t = snap.data()!;
    if (t["version"] !== input.version) throw conflict(t);
    const current = t["status"] as TransferStatus;
    const status = nextTransferStatus(current, input.action);
    if (!status) {
      throw new HttpsError("failed-precondition", "Esta ação não vale para o status atual da transferência.", {current});
    }
    const from = t["fromLocationId"] as string;
    const to = t["toLocationId"] as string;
    const items = (t["items"] ?? []) as {productId: string; skuId: string; qty: number; skuCode: string; productName: string; variantLabel: string}[];
    const products = await loadProducts(tx, db, items.map((i) => i.productId));
    const [fromSnap, toSnap] = await Promise.all([
      tx.get(db.collection(LOCATIONS).doc(from)),
      tx.get(db.collection(LOCATIONS).doc(to)),
    ]);
    const code = t["code"] as string;

    // ---------- cálculo + escritas ----------
    const movement = (type: string, its: StockMovementItem[], extra: Data) =>
      tx.set(db.collection(MOVEMENTS).doc(), {
        type,
        status: "confirmada",
        fromLocationId: from,
        toLocationId: to,
        items: its,
        productIds: [...products.keys()],
        reference: `${code} → ${locationName(toSnap.data(), to)}`,
        transferId: ref.id,
        actor,
        createdAt: now,
        ...extra,
      });
    let updates: Data = {};

    if (input.action === "cancelar" && current === "separacao") {
      for (const i of items) moveReserved(skuOf(products, i.productId, i.skuId), from, -i.qty);
    }

    if (input.action === "em_transito") {
      const out: StockMovementItem[] = items.map((i) => {
        const sku = skuOf(products, i.productId, i.skuId);
        moveReserved(sku, from, -i.qty);
        const {before, after} = moveStock(sku, from, -i.qty);
        return {...i, ...describe(products, i.productId, i.skuId), locationId: from, delta: -i.qty, before, after};
      });
      movement("transferencia", out, {reason: `Saída para ${locationName(toSnap.data(), to)}`});
      updates = {shippedAt: now};
    }

    if (input.action === "recebido") {
      const received = input.received ?? {};
      const inItems: StockMovementItem[] = [];
      const diffs: StockMovementItem[] = [];
      const withReceived = items.map((i) => {
        const raw = received[lineKey(i.productId, i.skuId)];
        const got = raw === undefined ? i.qty : raw;
        if (!isInt(got) || got < 0) throw invalid(["received"]);
        const sku = skuOf(products, i.productId, i.skuId);
        const info = describe(products, i.productId, i.skuId);
        // Entra o que foi enviado; a divergência sai num ajuste à parte, com motivo.
        const sent = moveStock(sku, to, i.qty);
        inItems.push({...i, ...info, locationId: to, delta: i.qty, before: sent.before, after: sent.after});
        if (got !== i.qty) {
          const adj = moveStock(sku, to, got - i.qty);
          diffs.push({...i, ...info, locationId: to, delta: got - i.qty, before: adj.before, after: adj.after});
        }
        return {...i, receivedQty: got};
      });
      movement("transferencia", inItems, {reason: `Recebido de ${locationName(fromSnap.data(), from)}`});
      if (diffs.length > 0) {
        movement("ajuste", diffs, {
          reference: `Divergência no recebimento ${code}`,
          reason: text(input.reason, 200) || `Divergência no recebimento ${code}`,
        });
      }
      updates = {items: withReceived, receivedAt: now, receivedBy: actor};
    }

    writeProducts(tx, products, actor, now);
    const version = input.version + 1;
    tx.set(
      ref,
      {
        ...updates,
        status,
        history: [...((t["history"] ?? []) as Data[]), {status, actor, at: now}],
        version,
        updatedAt: now,
        updatedBy: actor,
      },
      {merge: true},
    );
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

export const saveStockEntryDraft = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return saveStockEntryDraftCore(getFirestore(), (request.data ?? {}) as StockEntryInput, actor, new Date());
});

export const deleteStockDraft = onCall(BACKOFFICE_CALLABLE, async (request) => {
  await actorOf(request.auth?.uid);
  await deleteStockDraftCore(getFirestore(), (request.data ?? {}) as {entryId: string});
  return {ok: true};
});

export const confirmStockEntry = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return confirmStockEntryCore(getFirestore(), (request.data ?? {}) as StockEntryInput, actor, new Date());
});

export const saveStoreTransfer = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return saveTransferCore(getFirestore(), (request.data ?? {}) as TransferInput, actor, new Date());
});

export const advanceStoreTransfer = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return advanceTransferCore(getFirestore(), (request.data ?? {}) as AdvanceTransferInput, actor, new Date());
});
