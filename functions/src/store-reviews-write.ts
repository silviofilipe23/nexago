/**
 * Escrita das avaliações da Loja: a callable do comprador e o gatilho que publica.
 *
 * O doc privado (`storeOrderReviews/{orderId}`) é a fonte; o espelho público de cada item, o
 * agregado do produto e o espelho do produto saem dele pelo gatilho, sempre relendo o estado
 * atual (eventos chegam fora de ordem). Regras puras em `store-reviews.ts`.
 */
import {randomUUID} from "node:crypto";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {ORDERS} from "./store-orders-write";
import {
  MAX_REVIEW_PHOTO_BYTES,
  ORDER_REVIEWS,
  PRODUCT_RATINGS,
  PUBLIC_REVIEWS,
  REVIEWABLE_STATUSES,
  REVIEW_PHOTO_TYPES,
  REVIEW_PUBLIC_PREFIX,
  REVIEW_UPLOAD_PREFIX,
  buildPublicReview,
  computeRatingStats,
  editableUntil,
  hasSizeAxis,
  parseReviewInput,
  reviewAuthor,
  sizeValueOf,
} from "./store-reviews";
import {SHOWCASE_PRODUCTS} from "./store-showcase";
import {syncShowcaseProduct} from "./store-showcase-sync";

type Data = Record<string, unknown>;

const PRODUCTS = "storeProducts";

function invalid(fields: string[], message = "Confira a avaliação."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields: [...new Set(fields)].sort()});
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const ts = v as {toDate?: () => Date} | null | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface StoredPhoto {
  /** Upload do atleta — a identidade da foto entre uma edição e outra. */
  path: string;
  publicPath: string;
  url: string;
}

/** Storage atrás de uma interface, para o teste não subir bucket. */
export interface ReviewPhotoStore {
  inspect(path: string): Promise<{contentType: string; sizeBytes: number} | null>;
  /** Copia o upload pra pasta pública do produto e devolve o link de leitura. */
  publish(path: string, productId: string, contentType: string): Promise<{publicPath: string; url: string}>;
  remove(publicPath: string): Promise<void>;
}

/**
 * Publica (ou edita) a avaliação do pedido. Fotos novas são conferidas e copiadas antes da
 * transação; a transação só grava se ninguém mexeu na avaliação no meio.
 */
export async function submitOrderReviewCore(
  db: Firestore,
  uid: string,
  raw: unknown,
  photoStore: ReviewPhotoStore,
  now: Date,
): Promise<{ok: true; created: boolean; editableUntil: string}> {
  const {input, fields} = parseReviewInput(raw);
  if (fields.length > 0) {
    throw invalid(fields, fields.includes("items") && input.items.length === 0 ?
      "Dê nota a pelo menos um produto." : "Confira a avaliação.");
  }

  const orderRef = db.collection(ORDERS).doc(input.orderId);
  const reviewRef = db.collection(ORDER_REVIEWS).doc(input.orderId);
  const [orderSnap, prevSnap] = await Promise.all([orderRef.get(), reviewRef.get()]);
  const order = orderSnap.exists ? orderSnap.data()! : null;
  if (!order || str((order["customer"] as Data | undefined)?.["uid"]) !== uid) {
    throw new HttpsError("not-found", "Pedido não encontrado.");
  }
  if (!REVIEWABLE_STATUSES.has(str(order["status"]))) {
    throw new HttpsError("failed-precondition", "Esse pedido só pode ser avaliado depois de entregue ou retirado.");
  }
  const prev = prevSnap.exists ? prevSnap.data()! : null;
  const prevCreatedAt = toDate(prev?.["createdAt"]);
  if (prevCreatedAt && now.getTime() > editableUntil(prevCreatedAt).getTime()) {
    throw new HttpsError("failed-precondition", "O prazo pra editar essa avaliação acabou.");
  }

  // Uma avaliação por produto do pedido: vale a primeira linha dele (variação e tamanho).
  const lines = new Map<string, Data>();
  for (const line of (Array.isArray(order["items"]) ? order["items"] : []) as Data[]) {
    const pid = str(line?.["productId"]);
    if (pid && !lines.has(pid)) lines.set(pid, line);
  }
  const outside = input.items.filter((i) => !lines.has(i.productId)).map((i) => `items.${i.productId}`);
  if (outside.length > 0) throw invalid(outside, "Esse produto não está no pedido.");

  const productSnaps = await db.getAll(...input.items.map((i) => db.collection(PRODUCTS).doc(i.productId)));
  const products = new Map(productSnaps.map((s) => [s.id, s.exists ? s.data()! : null]));
  const skuSnaps = await db.getAll(...input.items.map((i) =>
    db.collection(PRODUCTS).doc(i.productId).collection("skus").doc(str(lines.get(i.productId)!["skuId"]) || "_")));
  const skus = new Map(skuSnaps.map((s, k) => [input.items[k].productId, s.exists ? s.data()! : null]));

  const prevItems = new Map(
    ((Array.isArray(prev?.["items"]) ? prev!["items"] : []) as Data[]).map((i) => [str(i["productId"]), i]),
  );

  // ---------- fotos (fora da transação: copiar arquivo não é Firestore) ----------
  const published: StoredPhoto[] = [];
  const photosByProduct = new Map<string, StoredPhoto[]>();
  try {
    for (const item of input.items) {
      const kept = new Map(((prevItems.get(item.productId)?.["photos"] ?? []) as StoredPhoto[]).map((p) => [p.path, p]));
      const out: StoredPhoto[] = [];
      for (const path of item.photos) {
        const old = kept.get(path);
        if (old) {
          out.push(old);
          continue;
        }
        const field = `items.${item.productId}.photos`;
        if (!path.startsWith(`${REVIEW_UPLOAD_PREFIX}/${uid}/`)) throw invalid([field]);
        const info = await photoStore.inspect(path);
        if (!info) throw invalid([field], "Não achamos uma das fotos. Envie de novo.");
        if (!REVIEW_PHOTO_TYPES[info.contentType]) throw invalid([field], "Foto em formato não aceito (use JPG, PNG ou WEBP).");
        if (info.sizeBytes > MAX_REVIEW_PHOTO_BYTES) throw invalid([field], "Foto maior que 10 MB.");
        const copy = await photoStore.publish(path, item.productId, info.contentType);
        const photo = {path, ...copy};
        published.push(photo);
        out.push(photo);
      }
      photosByProduct.set(item.productId, out);
    }
  } catch (err) {
    await removeQuietly(photoStore, published.map((p) => p.publicPath));
    throw err;
  }

  const author = reviewAuthor((order["customer"] as Data | undefined)?.["name"], input.anonymous);
  const delivery = (order["delivery"] ?? {}) as Data;
  const items = input.items.map((item) => {
    const line = lines.get(item.productId)!;
    const before = prevItems.get(item.productId);
    const product = products.get(item.productId) ?? null;
    const sized = hasSizeAxis(product?.["axes"]);
    return {
      productId: item.productId,
      skuId: str(line["skuId"]),
      name: str(line["productName"]),
      variantLabel: str(line["variantLabel"]),
      imageUrl: (line["imageUrl"] as string | null) ?? null,
      sizeValueId: sized ? sizeValueOf(product?.["axes"], skus.get(item.productId)?.["axisValues"]) : null,
      rating: item.rating,
      tags: item.tags,
      fit: sized ? item.fit : null,
      comment: item.comment,
      photos: photosByProduct.get(item.productId) ?? [],
      publicId: str(before?.["publicId"]) || randomUUID().replace(/-/g, "").slice(0, 20),
      hiddenAt: before?.["hiddenAt"] ?? null,
      createdAt: toDate(before?.["createdAt"]) ?? now,
      updatedAt: now,
    };
  });
  const createdAt = prevCreatedAt ?? now;
  const until = editableUntil(createdAt);
  const prevUpdatedAt = toDate(prev?.["updatedAt"])?.getTime() ?? null;

  try {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(reviewRef);
      const currentUpdatedAt = current.exists ? toDate(current.data()!["updatedAt"])?.getTime() ?? null : null;
      if (current.exists !== prevSnap.exists || currentUpdatedAt !== prevUpdatedAt) {
        throw new HttpsError("aborted", "A avaliação mudou enquanto você editava. Tente de novo.");
      }
      tx.set(reviewRef, {
        orderId: input.orderId,
        number: str(order["number"]),
        uid,
        anonymous: input.anonymous,
        authorName: author.name,
        authorInitials: author.initials,
        items,
        pickup: delivery["type"] === "arena" && input.pickupRating !== null ?
          {placeName: str(delivery["placeName"]), rating: input.pickupRating} : null,
        createdAt,
        updatedAt: now,
        editableUntil: until,
      });
    });
  } catch (err) {
    await removeQuietly(photoStore, published.map((p) => p.publicPath));
    throw err;
  }

  // Foto que saiu na edição: a cópia pública vai junto. Best-effort — o espelho já não a mostra.
  const keptPaths = new Set(items.flatMap((i) => i.photos.map((p) => p.publicPath)));
  const dropped = [...prevItems.values()]
    .flatMap((i) => (i["photos"] ?? []) as StoredPhoto[])
    .map((p) => p.publicPath)
    .filter((p) => p && !keptPaths.has(p));
  await removeQuietly(photoStore, dropped);

  return {ok: true, created: !prevSnap.exists, editableUntil: until.toISOString()};
}

async function removeQuietly(store: ReviewPhotoStore, paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await store.remove(path);
    } catch (err) {
      logger.warn("storeReview: foto pública não apagada", {path, err: String(err)});
    }
  }
}

/** Refaz o agregado do produto a partir dos espelhos visíveis e ressincroniza a vitrine. */
export async function recomputeProductRatingCore(db: Firestore, productId: string, now: Date): Promise<void> {
  const snap = await db.collection(SHOWCASE_PRODUCTS).doc(productId).collection(PUBLIC_REVIEWS).get();
  const stats = computeRatingStats(snap.docs.map((d) => d.data()));
  await db.collection(PRODUCT_RATINGS).doc(productId).set({...stats, updatedAt: now});
  await syncShowcaseProduct(db, productId, now);
}

/**
 * Gatilho: espelho público de cada item visível, apaga o que saiu (edição, item escondido, doc
 * apagado) e refaz a nota de cada produto tocado. `before` só serve pra achar o que apagar.
 */
export async function syncOrderReviewPublicCore(
  db: Firestore,
  orderId: string,
  before: Data | null,
  now: Date,
): Promise<{productIds: string[]}> {
  const snap = await db.collection(ORDER_REVIEWS).doc(orderId).get();
  const review = snap.exists ? snap.data()! : null;
  const visible = ((review?.["items"] ?? []) as Data[]).filter((i) => !i["hiddenAt"] && str(i["publicId"]));
  const keep = new Set(visible.map((i) => `${str(i["productId"])}/${str(i["publicId"])}`));
  const stale = ((before?.["items"] ?? []) as Data[])
    .map((i) => `${str(i["productId"])}/${str(i["publicId"])}`)
    .filter((key) => !key.startsWith("/") && !key.endsWith("/") && !keep.has(key));

  const mirror = (key: string) => {
    const [productId, publicId] = key.split("/");
    return db.collection(SHOWCASE_PRODUCTS).doc(productId).collection(PUBLIC_REVIEWS).doc(publicId);
  };
  for (const item of visible) {
    await mirror(`${str(item["productId"])}/${str(item["publicId"])}`).set(buildPublicReview(review!, item));
  }
  for (const key of stale) await mirror(key).delete();

  const productIds = [...new Set([...keep, ...stale].map((k) => k.split("/")[0]))].sort();
  for (const productId of productIds) await recomputeProductRatingCore(db, productId, now);
  return {productIds};
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

function storagePhotoStore(): ReviewPhotoStore {
  const bucket = getStorage().bucket();
  return {
    async inspect(path) {
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [meta] = await file.getMetadata();
      return {contentType: String(meta.contentType ?? ""), sizeBytes: Number(meta.size ?? 0)};
    },
    async publish(path, productId, contentType) {
      const publicPath = `${REVIEW_PUBLIC_PREFIX}/${productId}/${randomUUID()}.${REVIEW_PHOTO_TYPES[contentType]}`;
      const token = randomUUID();
      await bucket.file(path).copy(bucket.file(publicPath), {
        contentType,
        cacheControl: "public, max-age=31536000",
        metadata: {firebaseStorageDownloadTokens: token},
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(publicPath)}?alt=media&token=${token}`;
      return {publicPath, url};
    },
    async remove(publicPath) {
      await bucket.file(publicPath).delete({ignoreNotFound: true});
    },
  };
}

export const submitStoreOrderReview = onCall(
  {region: CLIENT_FACING_REGIONS, invoker: "public" as const},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta pra avaliar.");
    return submitOrderReviewCore(getFirestore(), uid, request.data, storagePhotoStore(), new Date());
  },
);

export const onStoreOrderReviewWrittenSyncPublic = onDocumentWritten(
  `${ORDER_REVIEWS}/{orderId}`,
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() ?? null : null;
    const result = await syncOrderReviewPublicCore(getFirestore(), event.params.orderId, before, new Date());
    logger.debug("storeOrderReview sync", {orderId: event.params.orderId, ...result});
  },
);
