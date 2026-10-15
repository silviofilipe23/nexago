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
  publishValidationErrors,
  slugify,
  type ProductBadge,
  type ProductStatus,
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

export const saveStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  const input = (request.data ?? {}) as SaveProductInput;
  return saveStoreProductCore(getFirestore(), input, actor, new Date());
});
