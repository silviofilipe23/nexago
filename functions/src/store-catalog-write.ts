/**
 * Escrita do catálogo da Loja.
 *
 * Toda escrita passa por aqui: rollup consistente, unicidade de slug e de
 * código de SKU, e a versão que detecta conflito são decisões de servidor.
 * As rules do catálogo negam escrita a qualquer cliente.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore, type Transaction} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  MAX_SKUS_PER_PRODUCT,
  publishValidationErrors,
  rollupsOf,
  skuCodeFrom,
  skuIdFromAxisValues,
  slugify,
  sumStock,
  type Axis,
  type ProductBadge,
  type ProductStatus,
  type SkuDoc,
} from "./store-catalog";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

const PRODUCTS = "storeProducts";
const COSTS = "storeProductCosts";
const KEYS = "storeCatalogKeys";

export interface Actor {
  uid: string;
  name: string;
}

export interface SaveProductInput {
  productId?: string;
  version?: number;
  name: string;
  baseSku: string;
  category: string;
  collection: string | null;
  brand: string;
  description: string;
  technicalDetails: {label: string; value: string}[];
  badge: ProductBadge | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  /** Ausente/null = não informado. Zero é custo informado. */
  costCents: number | null;
  channels: {app: boolean; web: boolean};
  fulfillment: {pickup: boolean; delivery: boolean};
  featured: boolean;
  shipping: {weightGrams: number; lengthCm: number; widthCm: number; heightCm: number} | null;
  lowStockThreshold: number;
  status: ProductStatus;
  active: boolean;
}

/** `failed-precondition` com quem salvou antes: é o que o banner de conflito mostra. */
function conflict(existing: FirebaseFirestore.DocumentData): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Este produto foi alterado por outra pessoa. Recarregue antes de salvar.",
    {updatedBy: existing["updatedBy"], updatedAt: existing["updatedAt"]},
  );
}

/**
 * Confere se a chave de unicidade está livre para este produto. **Só lê** — a
 * escrita vem depois, no bloco de escritas, porque a transação do Firestore
 * recusa uma leitura feita após qualquer escrita.
 */
async function assertKeyFree(
  tx: Transaction,
  db: Firestore,
  key: string,
  productId: string,
): Promise<void> {
  const snap = await tx.get(db.collection(KEYS).doc(key));
  if (snap.exists && snap.data()?.["productId"] !== productId) {
    throw new HttpsError("invalid-argument", `Já existe outro produto com ${key}.`, {key});
  }
}

function writeKey(
  tx: Transaction,
  db: Firestore,
  key: string,
  owner: {productId: string; skuId?: string},
): void {
  tx.set(db.collection(KEYS).doc(key), owner);
}

/** Acha um slug livre: o nome repetido vira `-2`, `-3`… em vez de recusar o produto. */
async function freeSlug(
  tx: Transaction,
  db: Firestore,
  base: string,
  productId: string,
): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const snap = await tx.get(db.collection(KEYS).doc(`slug:${candidate}`));
    if (!snap.exists || snap.data()?.["productId"] === productId) {
      return candidate;
    }
  }
  throw new HttpsError("invalid-argument", "Escolha outro nome: este já tem cópias demais.");
}

export async function saveStoreProductCore(
  db: Firestore,
  input: SaveProductInput,
  actor: Actor,
  now: Date,
): Promise<{productId: string; version: number; slug: string}> {
  if (input.status === "ativo") {
    const fields = publishValidationErrors(input);
    if (fields.length > 0) {
      throw new HttpsError("invalid-argument", "Faltam campos para publicar.", {fields});
    }
  }

  const productId = input.productId ?? db.collection(PRODUCTS).doc().id;
  const ref = db.collection(PRODUCTS).doc(productId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data()! : null;

    if (existing && existing["version"] !== input.version) {
      throw conflict(existing);
    }

    const slug = await freeSlug(tx, db, slugify(input.name), productId);

    // ---------- escritas ----------
    const previousSlug = existing?.["slug"] as string | undefined;
    if (previousSlug && previousSlug !== slug) {
      tx.delete(db.collection(KEYS).doc(`slug:${previousSlug}`));
    }
    writeKey(tx, db, `slug:${slug}`, {productId});

    const version = (existing?.["version"] ?? 0) + 1;
    const publishedAt =
      (existing?.["publishedAt"] as Date | null | undefined) ??
      (input.status === "ativo" ? now : null);

    tx.set(
      ref,
      {
        name: input.name.trim(),
        slug,
        baseSku: input.baseSku,
        category: input.category,
        collection: input.collection,
        brand: input.brand,
        description: input.description,
        technicalDetails: input.technicalDetails,
        badge: input.badge,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents,
        channels: input.channels,
        fulfillment: input.fulfillment,
        featured: input.featured,
        shipping: input.shipping,
        lowStockThreshold: input.lowStockThreshold,
        status: input.status,
        active: input.active,
        photos: existing?.["photos"] ?? [],
        soldLast30: existing?.["soldLast30"] ?? 0,
        skuCount: existing?.["skuCount"] ?? 0,
        stockTotal: existing?.["stockTotal"] ?? 0,
        priceFromCents: existing?.["priceFromCents"] ?? input.priceCents,
        publishedAt,
        version,
        createdAt: existing?.["createdAt"] ?? now,
        updatedAt: now,
        updatedBy: actor,
      },
      {merge: false},
    );

    // Custo fora do produto: `null` é "não informado", zero é custo informado.
    if (input.costCents !== null) {
      tx.set(db.collection(COSTS).doc(productId), {costCents: input.costCents, updatedAt: now});
    }

    return {productId, version, slug};
  });
}

export async function assertCatalogAdmin(uid: string): Promise<Actor> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem editar o catálogo da loja.",
    );
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export interface SkuInput {
  axisValues: Record<string, string>;
  barcode: string | null;
  priceCents: number | null;
  stockByLocation: Record<string, number>;
}

export interface SaveVariationsInput {
  productId: string;
  version: number;
  axes: Axis[];
  skus: SkuInput[];
}

export async function saveVariationsCore(
  db: Firestore,
  input: SaveVariationsInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; skuCount: number; stockTotal: number}> {
  if (input.axes.length > 2) {
    throw new HttpsError("invalid-argument", "Um produto tem no máximo 2 eixos de variação.");
  }
  if (input.skus.length === 0) {
    throw new HttpsError("invalid-argument", "O produto precisa de ao menos um SKU.");
  }
  if (input.skus.length > MAX_SKUS_PER_PRODUCT) {
    throw new HttpsError(
      "invalid-argument",
      `Um produto comporta no máximo ${MAX_SKUS_PER_PRODUCT} variações.`,
    );
  }
  for (const sku of input.skus) {
    for (const [location, qty] of Object.entries(sku.stockByLocation)) {
      if (!Number.isInteger(qty) || qty < 0) {
        throw new HttpsError("invalid-argument", `Estoque inválido em ${location}.`, {location});
      }
    }
  }

  const ref = db.collection(PRODUCTS).doc(input.productId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Produto não encontrado.");
    }
    const existing = snap.data()!;
    if (existing["version"] !== input.version) {
      throw conflict(existing);
    }

    // ---------- ainda leituras ----------
    const baseSku = existing["baseSku"] as string;
    const next: SkuDoc[] = input.skus.map((sku) => ({
      id: skuIdFromAxisValues(sku.axisValues, input.axes),
      code: skuCodeFrom(baseSku, sku.axisValues, input.axes),
      barcode: sku.barcode,
      axisValues: sku.axisValues,
      priceCents: sku.priceCents,
      stockByLocation: sku.stockByLocation,
      stock: sumStock(sku.stockByLocation),
    }));

    const skusRef = ref.collection("skus");
    const currentSnap = await tx.get(skusRef);
    const keepIds = new Set(next.map((s) => s.id));
    const dropped = currentSnap.docs.filter((d) => !keepIds.has(d.id));
    const droppedWithStock = dropped.filter((d) => (d.data()["stock"] ?? 0) > 0).map((d) => d.id);

    if (droppedWithStock.length > 0) {
      // Apagar em silêncio levaria o estoque junto; quem decide descartar é o usuário.
      throw new HttpsError(
        "failed-precondition",
        "Há variações com estoque que seriam removidas.",
        {droppedWithStock},
      );
    }

    // Em série, e ainda no bloco de leituras: a transação recusa ler depois de escrever.
    for (const sku of next) {
      await assertKeyFree(tx, db, `sku:${sku.code}`, input.productId);
    }

    // ---------- escritas ----------
    for (const doc of dropped) {
      tx.delete(doc.ref);
      tx.delete(db.collection(KEYS).doc(`sku:${doc.data()["code"]}`));
    }
    for (const sku of next) {
      writeKey(tx, db, `sku:${sku.code}`, {productId: input.productId, skuId: sku.id});
      tx.set(skusRef.doc(sku.id), sku, {merge: false});
    }

    const rollups = rollupsOf(next, existing["priceCents"] as number);
    const version = input.version + 1;
    tx.set(
      ref,
      {axes: input.axes, ...rollups, version, updatedAt: now, updatedBy: actor},
      {merge: true},
    );

    return {version, skuCount: rollups.skuCount, stockTotal: rollups.stockTotal};
  });
}

export const saveStoreProductVariations = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  return saveVariationsCore(getFirestore(), (request.data ?? {}) as SaveVariationsInput, actor, new Date());
});

export const saveStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  const input = (request.data ?? {}) as SaveProductInput;
  return saveStoreProductCore(getFirestore(), input, actor, new Date());
});
