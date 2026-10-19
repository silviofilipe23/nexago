/**
 * Gatilhos que mantêm a vitrine pública (`store-showcase.ts`) em dia com o catálogo.
 *
 * O espelho é sempre recalculado a partir dos docs lidos AGORA, nunca do `after` do evento:
 * gatilhos não chegam em ordem, e projetar o evento deixaria uma pausa rápida seguida de
 * reativação com o produto fora da vitrine. Toda mudança de saldo, preço ou foto passa pelo doc
 * do produto (sobe a `version`), então ouvir o produto basta — ouvir cada SKU faria uma troca de
 * grade com 100 variações reler a grade 100 vezes. A nota das avaliações mora fora do produto
 * (`storeProductRatings`, o save do backoffice grava com merge:false) e o gatilho das avaliações
 * chama `syncShowcaseProduct` direto (`store-reviews-write.ts`).
 */
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {PICKUP_POINTS, STORE_CONFIG} from "./store-pickup";
import {
  CAMPAIGNS_CONFIG_ID,
  SHOWCASE_CONFIG_ID,
  SHOWCASE_PRODUCTS,
  STORE_PUBLIC,
  buildShowcaseConfig,
  buildShowcaseProduct,
} from "./store-showcase";
import {PRODUCT_RATINGS} from "./store-reviews";

const PRODUCTS = "storeProducts";
const CUSTOMIZATION = "storeProductCustomization";
/** Config que muda o que a vitrine mostra: desconto do Pix, prazo de troca, banners, entrega. */
const CONFIG_SOURCES = new Set(["discounts", "returns", "shipping", CAMPAIGNS_CONFIG_ID]);

export async function syncShowcaseProduct(db: Firestore, productId: string, now = new Date()): Promise<"set" | "deleted"> {
  const productRef = db.collection(PRODUCTS).doc(productId);
  const [productSnap, skusSnap, customizationSnap, ratingsSnap] = await Promise.all([
    productRef.get(),
    productRef.collection("skus").get(),
    db.collection(CUSTOMIZATION).doc(productId).get(),
    db.collection(PRODUCT_RATINGS).doc(productId).get(),
  ]);
  const projection = buildShowcaseProduct(
    productSnap.exists ? productSnap.data()! : null,
    skusSnap.docs.map((d) => ({id: d.id, data: d.data()})),
    customizationSnap.exists ? customizationSnap.data()! : null,
    now,
    ratingsSnap.exists ? ratingsSnap.data()! : null,
  );
  const ref = db.collection(SHOWCASE_PRODUCTS).doc(productId);
  if (projection === null) {
    await ref.delete();
    return "deleted";
  }
  await ref.set({...projection, updatedAt: now});
  return "set";
}

export async function rebuildShowcaseConfig(db: Firestore, now = new Date()): Promise<void> {
  const config = db.collection(STORE_CONFIG);
  const [discounts, returns, campaigns, shipping, points] = await Promise.all([
    config.doc("discounts").get(),
    config.doc("returns").get(),
    config.doc(CAMPAIGNS_CONFIG_ID).get(),
    config.doc("shipping").get(),
    db.collection(PICKUP_POINTS).where("active", "==", true).get(),
  ]);
  const pickupPoints = points.docs.map((d) => ({arenaId: d.id, data: d.data()}));
  const arenaRefs = pickupPoints.map((p) => db.collection("arenas").doc(p.arenaId));
  const arenaSnaps = arenaRefs.length > 0 ? await db.getAll(...arenaRefs) : [];
  const arenas = new Map(arenaSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));

  const built = buildShowcaseConfig({
    discounts: discounts.exists ? discounts.data()! : null,
    returns: returns.exists ? returns.data()! : null,
    campaigns: campaigns.exists ? campaigns.data()! : null,
    shipping: shipping.exists ? shipping.data()! : null,
    pickupPoints,
    arenas,
  });
  await db.collection(STORE_PUBLIC).doc(SHOWCASE_CONFIG_ID).set({...built, updatedAt: now});
}

export const onStoreProductWrittenSyncShowcase = onDocumentWritten(
  `${PRODUCTS}/{productId}`,
  async (event) => {
    const productId = event.params.productId;
    const result = await syncShowcaseProduct(getFirestore(), productId);
    logger.debug("storeShowcase sync", {productId, result});
  },
);

/** "Personalizável" vive fora do doc do produto (`saveStoreProduct` grava com merge:false). */
export const onStoreCustomizationWrittenSyncShowcase = onDocumentWritten(
  `${CUSTOMIZATION}/{productId}`,
  async (event) => {
    await syncShowcaseProduct(getFirestore(), event.params.productId);
  },
);

export const onStoreConfigWrittenSyncShowcase = onDocumentWritten(
  `${STORE_CONFIG}/{configId}`,
  async (event) => {
    if (!CONFIG_SOURCES.has(event.params.configId)) return;
    await rebuildShowcaseConfig(getFirestore());
  },
);

export const onStorePickupPointWrittenSyncShowcase = onDocumentWritten(
  `${PICKUP_POINTS}/{arenaId}`,
  async () => {
    await rebuildShowcaseConfig(getFirestore());
  },
);
