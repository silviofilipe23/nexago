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
  lowStockSkuCount,
  publishValidationErrors,
  rollupsOf,
  skuCodeFrom,
  skuIdFromAxisValues,
  slugify,
  stockDeltas,
  sumStock,
  variantLabelOf,
  type Axis,
  type ProductBadge,
  type ProductStatus,
  type SkuDoc,
  type StockMovementItem,
} from "./store-catalog";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

const PRODUCTS = "storeProducts";
const COSTS = "storeProductCosts";
const KEYS = "storeCatalogKeys";
const MOVEMENTS = "storeStockMovements";

/** Motivo das movimentações que a grade da tela de produto gera. */
export const GRID_ADJUST_REASON = "Ajuste manual na tela do produto";

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
  /** Omitido = não mexe no custo. `null` = apagar. Zero é custo informado. */
  costCents?: number | null;
  channels: {app: boolean; web: boolean};
  fulfillment: {pickup: boolean; delivery: boolean};
  featured: boolean;
  shipping: {weightGrams: number; lengthCm: number; widthCm: number; heightCm: number} | null;
  lowStockThreshold: number;
  status: ProductStatus;
  active: boolean;
}

const STATUSES: ProductStatus[] = ["rascunho", "ativo", "arquivado"];
const BADGES: ProductBadge[] = ["nova", "mais-vendida", "edicao-limitada"];
/** Vai cru para o id de um documento de chave: nada que quebre caminho do Firestore. */
const BASE_SKU_RE = /^[A-Z0-9][A-Z0-9-]*$/;
const AXIS_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isCount(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [...new Set(fields)].sort()});
}

/**
 * As rules negam escrita de cliente, então esta é a única porta do catálogo:
 * o que não for barrado aqui vira documento ruim que ninguém mais filtra.
 */
function validateProductInput(input: SaveProductInput): void {
  const fields: string[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "" || name.length > 80) fields.push("name");
  if (typeof input.category !== "string" || input.category === "") fields.push("category");
  if (typeof input.baseSku !== "string" || !BASE_SKU_RE.test(input.baseSku)) fields.push("baseSku");
  if (!isCount(input.priceCents)) fields.push("priceCents");
  if (input.compareAtPriceCents != null && !isCount(input.compareAtPriceCents)) {
    fields.push("compareAtPriceCents");
  }
  if (input.costCents != null && !isCount(input.costCents)) fields.push("costCents");
  if (!isCount(input.lowStockThreshold)) fields.push("lowStockThreshold");
  if (!STATUSES.includes(input.status)) fields.push("status");
  if (input.badge != null && !BADGES.includes(input.badge)) fields.push("badge");
  if (typeof input.active !== "boolean") fields.push("active");
  if (typeof input.channels?.app !== "boolean" || typeof input.channels?.web !== "boolean") {
    fields.push("channels");
  }
  if (
    typeof input.fulfillment?.pickup !== "boolean" ||
    typeof input.fulfillment?.delivery !== "boolean"
  ) {
    fields.push("fulfillment");
  }
  if (input.shipping != null) {
    const ship = input.shipping as unknown as Record<string, unknown>;
    const ok = ["weightGrams", "lengthCm", "widthCm", "heightCm"].every((k) => isCount(ship[k]));
    if (!ok) fields.push("shipping");
  }
  if (fields.length > 0) throw invalidFields(fields);
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

/** Procura uma raiz de SKU livre para a cópia, do mesmo jeito que `freeSlug` faz com o slug. */
async function freeCopyBaseSku(
  tx: Transaction,
  db: Firestore,
  sourceBaseSku: string,
  axes: Axis[],
  axisValuesList: Record<string, string>[],
  copyId: string,
): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? `${sourceBaseSku}-COPIA` : `${sourceBaseSku}-COPIA-${n}`;
    let free = true;
    for (const axisValues of axisValuesList) {
      const code = skuCodeFrom(candidate, axisValues, axes);
      const snap = await tx.get(db.collection(KEYS).doc(`sku:${code}`));
      if (snap.exists && snap.data()?.["productId"] !== copyId) {
        free = false;
        break;
      }
    }
    if (free) return candidate;
  }
  throw new HttpsError("invalid-argument", "Este produto já tem cópias demais.");
}

export async function saveStoreProductCore(
  db: Firestore,
  input: SaveProductInput,
  actor: Actor,
  now: Date,
): Promise<{productId: string; version: number; slug: string}> {
  validateProductInput(input);

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

    // O 'a partir de' depende dos SKUs: recalcular, senão ele congela no preço antigo.
    const skusSnap = await tx.get(ref.collection("skus"));
    const skus = skusSnap.docs.map((d) => d.data() as unknown as SkuDoc);
    const rollups = {
      ...rollupsOf(skus, input.priceCents),
      lowStockSkuCount: lowStockSkuCount(skus, input.lowStockThreshold),
    };

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
        collection: input.collection ?? null,
        brand: input.brand ?? "NexaGO",
        description: input.description ?? "",
        technicalDetails: input.technicalDetails ?? [],
        badge: input.badge ?? null,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents ?? null,
        // Os eixos são do produto e o cliente não os reenvia neste payload:
        // sem preservar, salvar o preço apagaria rótulo e cor de cada variação.
        axes: existing?.["axes"] ?? [],
        channels: input.channels,
        fulfillment: input.fulfillment,
        featured: input.featured ?? false,
        shipping: input.shipping ?? null,
        lowStockThreshold: input.lowStockThreshold,
        status: input.status,
        active: input.active,
        photos: existing?.["photos"] ?? [],
        soldLast30: existing?.["soldLast30"] ?? 0,
        ...rollups,
        publishedAt,
        version,
        createdAt: existing?.["createdAt"] ?? now,
        updatedAt: now,
        updatedBy: actor,
      },
      {merge: false},
    );

    // Custo fora do produto. Omitido = não mexe; `null` = o admin apagou, senão a
    // margem segue sendo feita sobre o custo velho. Merge, e não delete/replace: o
    // mesmo doc guarda o custo médio por SKU que as entradas de estoque calculam.
    // Produto novo sem custo não cria documento nenhum.
    if (input.costCents !== undefined && (input.costCents !== null || existing)) {
      tx.set(
        db.collection(COSTS).doc(productId),
        {costCents: input.costCents, updatedAt: now},
        {merge: true},
      );
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

/**
 * Sem isto, duas linhas na mesma combinação viram UM documento enquanto o
 * rollup conta DUAS — estoque fantasma que a vitrine venderia, exatamente a
 * invariante que justifica a escrita só por servidor.
 */
function validateVariationsInput(input: SaveVariationsInput): void {
  const fields: string[] = [];
  const axisIds = new Set<string>();
  const valuesByAxis = new Map<string, Set<string>>();

  for (const axis of input.axes ?? []) {
    if (typeof axis?.id !== "string" || !AXIS_ID_RE.test(axis.id) || axisIds.has(axis.id)) {
      fields.push("axes");
      continue;
    }
    axisIds.add(axis.id);
    const values = new Set<string>();
    for (const value of axis.values ?? []) {
      if (typeof value?.id !== "string" || !AXIS_ID_RE.test(value.id) || values.has(value.id)) {
        fields.push("axes");
        continue;
      }
      values.add(value.id);
    }
    valuesByAxis.set(axis.id, values);
  }

  const seen = new Set<string>();
  for (const sku of input.skus ?? []) {
    const given = Object.keys(sku?.axisValues ?? {});
    if (given.length !== axisIds.size || !given.every((id) => axisIds.has(id))) {
      fields.push("skus.axisValues");
      continue;
    }
    const foraDoEixo = given.some((id) => !valuesByAxis.get(id)!.has(sku.axisValues[id]!));
    if (foraDoEixo) {
      fields.push("skus.axisValues");
      continue;
    }
    const id = skuIdFromAxisValues(sku.axisValues, input.axes);
    if (seen.has(id)) {
      fields.push("skus.duplicados");
      continue;
    }
    seen.add(id);
  }

  if (fields.length > 0) throw invalidFields(fields);
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
  validateVariationsInput(input);
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
    const droppedWithStock = dropped
      .filter((d) => {
        const reserved = Object.values((d.data()["reservedByLocation"] ?? {}) as Record<string, number>);
        // Reserva de transferência em separação também prende a variação.
        return (d.data()["stock"] ?? 0) > 0 || reserved.some((n) => n > 0);
      })
      .map((d) => d.id);

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

    const codeById = new Map(currentSnap.docs.map((d) => [d.id, d.data()["code"] as string]));
    const stockById = new Map(
      currentSnap.docs.map((d) => [d.id, (d.data()["stockByLocation"] ?? {}) as Record<string, number>]),
    );
    const byId = new Map(next.map((sku) => [sku.id, sku]));
    const movementItems: StockMovementItem[] = stockDeltas(stockById, next).map((d) => ({
      productId: input.productId,
      skuId: d.skuId,
      skuCode: byId.get(d.skuId)!.code,
      productName: existing["name"] as string,
      variantLabel: variantLabelOf(byId.get(d.skuId)!.axisValues, input.axes),
      locationId: d.locationId,
      delta: d.delta,
      before: d.before,
      after: d.after,
    }));

    // ---------- escritas ----------
    for (const doc of dropped) {
      tx.delete(doc.ref);
      tx.delete(db.collection(KEYS).doc(`sku:${doc.data()["code"]}`));
    }
    for (const sku of next) {
      // Renomear a raiz (baseSku) muda o código do SKU mantido: sem apagar a
      // chave antiga ela fica órfã e bloqueia aquele código para sempre.
      const oldCode = codeById.get(sku.id);
      if (oldCode && oldCode !== sku.code) {
        tx.delete(db.collection(KEYS).doc(`sku:${oldCode}`));
      }
      writeKey(tx, db, `sku:${sku.code}`, {productId: input.productId, skuId: sku.id});
      const {id: _id, ...data} = sku;
      // O cliente não conhece as reservas de transferência: sem preservar, salvar a
      // grade liberaria unidades que já estão separadas para uma arena.
      const reserved = currentSnap.docs.find((d) => d.id === sku.id)?.data()["reservedByLocation"];
      tx.set(skusRef.doc(sku.id), reserved ? {...data, reservedByLocation: reserved} : data, {merge: false});
    }

    // Saldo só muda com rastro: a grade da tela 05 vira uma movimentação "ajuste".
    if (movementItems.length > 0) {
      tx.set(db.collection(MOVEMENTS).doc(), {
        type: "ajuste",
        fromLocationId: null,
        toLocationId: null,
        items: movementItems,
        productIds: [input.productId],
        reference: null,
        reason: GRID_ADJUST_REASON,
        actor,
        createdAt: now,
      });
    }

    const rollups = {
      ...rollupsOf(next, existing["priceCents"] as number),
      lowStockSkuCount: lowStockSkuCount(next, (existing["lowStockThreshold"] ?? 0) as number),
    };
    // Desnormalizado no pai porque a lista de Produtos busca por código de barras e
    // não lê a subcoleção: sem isto a busca não teria o que casar.
    const barcodes = next
      .map((sku) => sku.barcode)
      .filter((code): code is string => typeof code === "string" && code !== "");
    const version = input.version + 1;
    tx.set(
      ref,
      {axes: input.axes, ...rollups, barcodes, version, updatedAt: now, updatedBy: actor},
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

export async function archiveCore(
  db: Firestore,
  input: {productId: string; version: number; restore?: boolean},
  actor: Actor,
  now: Date,
): Promise<{version: number; status: ProductStatus}> {
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
    // Restaurar devolve como rascunho: republicar é decisão consciente de quem restaurou.
    const status: ProductStatus = input.restore ? "rascunho" : "arquivado";
    const version = input.version + 1;
    tx.set(ref, {status, active: false, version, updatedAt: now, updatedBy: actor}, {merge: true});
    return {version, status};
  });
}

export async function duplicateCore(
  db: Firestore,
  input: {productId: string},
  actor: Actor,
  now: Date,
): Promise<{productId: string}> {
  const sourceRef = db.collection(PRODUCTS).doc(input.productId);
  const copyId = db.collection(PRODUCTS).doc().id;
  const copyRef = db.collection(PRODUCTS).doc(copyId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const sourceSnap = await tx.get(sourceRef);
    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "Produto não encontrado.");
    }
    const source = sourceSnap.data()!;
    const sourceSkus = await tx.get(sourceRef.collection("skus"));

    const name = `Cópia de ${source["name"]}`;
    const slug = await freeSlug(tx, db, slugify(name), copyId);

    const axes = (source["axes"] ?? []) as Axis[];
    const axisValuesList = sourceSkus.docs.map(
      (d) => d.data()["axisValues"] as Record<string, string>,
    );
    // A raiz precisa desempatar como o slug: senão a segunda cópia colide
    // com os códigos de SKU da primeira e o botão Duplicar simplesmente falha.
    const baseSku = await freeCopyBaseSku(
      tx, db, source["baseSku"] as string, axes, axisValuesList, copyId,
    );
    const skus: SkuDoc[] = sourceSkus.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        code: skuCodeFrom(baseSku, data["axisValues"] as Record<string, string>, axes),
        // Código de barras é do produto original; a cópia começa sem.
        barcode: null,
        axisValues: data["axisValues"] as Record<string, string>,
        priceCents: (data["priceCents"] ?? null) as number | null,
        stockByLocation: {},
        stock: 0,
      };
    });

    const rollups = {
      ...rollupsOf(skus, source["priceCents"] as number),
      lowStockSkuCount: lowStockSkuCount(skus, (source["lowStockThreshold"] ?? 0) as number),
    };

    // ---------- escritas ----------
    writeKey(tx, db, `slug:${slug}`, {productId: copyId});
    for (const sku of skus) {
      writeKey(tx, db, `sku:${sku.code}`, {productId: copyId, skuId: sku.id});
      const {id: _id, ...data} = sku;
      tx.set(copyRef.collection("skus").doc(sku.id), data, {merge: false});
    }

    tx.set(copyRef, {
      ...source,
      name,
      slug,
      baseSku,
      status: "rascunho" as ProductStatus,
      active: false,
      publishedAt: null,
      photos: [],
      soldLast30: 0,
      ...rollups,
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor,
    }, {merge: false});

    return {productId: copyId};
  });
}

export const archiveStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  const data = (request.data ?? {}) as {productId: string; version: number; restore?: boolean};
  return archiveCore(getFirestore(), data, actor, new Date());
});

export const duplicateStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  return duplicateCore(getFirestore(), (request.data ?? {}) as {productId: string}, actor, new Date());
});

export const saveStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  const input = (request.data ?? {}) as SaveProductInput;
  return saveStoreProductCore(getFirestore(), input, actor, new Date());
});

export const MAX_PHOTOS_PER_PRODUCT = 10;

export interface PhotoInput {
  id: string;
  url: string;
  /** Caminho no Storage; serve para apagar o arquivo e prova que a foto é deste produto. */
  path: string;
  /** Valor do primeiro eixo (cor) a que a foto está ligada. */
  colorValueId: string | null;
  /** Lado da peça na foto: as prévias de personalização mostram cada lado com a foto dele. */
  view?: PhotoView | null;
}

export type PhotoView = "frente" | "costas";
const PHOTO_VIEWS: PhotoView[] = ["frente", "costas"];

export interface SavePhotosInput {
  productId: string;
  version: number;
  /** Ordem do array = ordem da galeria; a primeira é a capa. */
  photos: PhotoInput[];
}

/** O cliente envia o arquivo ao Storage e só então registra aqui: o servidor confere o que vai para o doc. */
export async function savePhotosCore(
  db: Firestore,
  input: SavePhotosInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; photoCount: number}> {
  const photos = Array.isArray(input.photos) ? input.photos : [];
  if (photos.length > MAX_PHOTOS_PER_PRODUCT) {
    throw new HttpsError("invalid-argument", `Um produto comporta no máximo ${MAX_PHOTOS_PER_PRODUCT} fotos.`);
  }
  const prefix = `store/products/${input.productId}/`;
  const ids = new Set<string>();
  const bad = photos.some((p) => {
    const ok =
      typeof p?.id === "string" && p.id !== "" && !ids.has(p.id) &&
      typeof p.url === "string" && p.url.startsWith("https://") &&
      typeof p.path === "string" && p.path.startsWith(prefix) && !p.path.includes("..") &&
      (p.colorValueId === null || (typeof p.colorValueId === "string" && AXIS_ID_RE.test(p.colorValueId))) &&
      (p.view == null || PHOTO_VIEWS.includes(p.view));
    ids.add(p?.id);
    return !ok;
  });
  if (bad) throw invalidFields(["photos"]);
  // Uma foto por lado: duas "frente" deixariam a prévia escolhendo no escuro.
  const views = photos.map((p) => p.view).filter((v): v is PhotoView => v != null);
  if (new Set(views).size !== views.length) throw invalidFields(["photos"]);

  const ref = db.collection(PRODUCTS).doc(input.productId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Produto não encontrado.");
    const existing = snap.data()!;
    if (existing["version"] !== input.version) throw conflict(existing);
    const version = input.version + 1;
    tx.set(
      ref,
      {
        photos: photos.map(({id, url, path, colorValueId, view}) => ({id, url, path, colorValueId, view: view ?? null})),
        version,
        updatedAt: now,
        updatedBy: actor,
      },
      {merge: true},
    );
    return {version, photoCount: photos.length};
  });
}

export const saveStoreProductPhotos = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  return savePhotosCore(getFirestore(), (request.data ?? {}) as SavePhotosInput, actor, new Date());
});
