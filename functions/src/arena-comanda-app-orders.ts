import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {isArenaEntitledPro} from "./arena-entitlement";

/**
 * Peça na quadra — o atleta lança consumo direto no app numa comanda já
 * aberta pelo balcão, sem precisar chamar o garçom.
 *
 * Reaproveita EXATAMENTE o mesmo shape de dado que o lançamento manual do
 * gestor grava (`ArenaComandasRepository.addItemsBatch`, no Flutter do
 * gestor) — item em `arenaComandas/{comandaId}/items` e baixa em
 * `arenas/{arenaId}/stockMovements`, só que com `source: 'app'` e
 * `addedByUid`/`addedByName` do atleta. A diferença é que aqui SEMPRE passa
 * por Cloud Function: o client (atleta) nunca tem permissão de escrita
 * direta em `arenaComandas/*\/items` (ver firestore.rules) — só o gestor
 * grava direto, e essa function é o único caminho para o atleta.
 *
 * Autorização (dono da comanda) — GAP conhecido: `ArenaComanda` hoje não
 * tem um campo de "atleta dono" direto, só um `bookingId` opcional setado
 * quando o gestor vincula uma reserva na abertura (fluxo "vincular
 * reserva" em `arena_comanda_link_booking_page.dart`). Usamos essa reserva
 * como a única fonte confiável de "quem é o atleta desta comanda": exige
 * `bookingId` presente e `arenaBookings/{bookingId}.athleteId == uid`.
 * Comandas abertas "sem vínculo" (walk-in / cliente que não é usuário do
 * app) ficam de fora do pedido pelo app até o balcão vincular uma reserva
 * — limitação conhecida, não há hoje outro sinal seguro de titularidade.
 */

const ARENAS = "arenas";
const ARENA_COMANDAS = "arenaComandas";
const ARENA_BOOKINGS = "arenaBookings";
const ACTIVE_COMANDA_STATUSES = new Set(["open", "closing", "partiallyPaid"]);
const CANCELED_BOOKING_STATUSES = new Set(["canceled", "cancelled"]);
const MAX_QUANTITY = 99;

type DocData = Record<string, unknown>;

export interface AddAppOrderItemInput {
  arenaId: string;
  comandaId: string;
  productId: string;
  quantity: number;
}

export interface AddAppOrderItemResult {
  itemId: string;
  lineTotalCents: number;
  newItemsTotalCents: number;
  newTotalCents: number;
}

function formatComandaNumber(displayNumber: unknown): string {
  const n = typeof displayNumber === "number" ? displayNumber : 0;
  return `#${String(n).padStart(4, "0")}`;
}

/** Espelha `displayNameOf` de friendly-match-invite.ts (mesma convenção de campos). */
function athleteDisplayName(profile: DocData | undefined): string {
  if (!profile) return "Atleta";
  for (const field of ["fullName", "name", "nickname"]) {
    const value = profile[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Atleta";
}

export async function addAppOrderItemCore(
  db: Firestore,
  uid: string,
  input: AddAppOrderItemInput,
  nowMs: number = Date.now(),
): Promise<AddAppOrderItemResult> {
  const arenaId = typeof input?.arenaId === "string" ? input.arenaId.trim() : "";
  const comandaId = typeof input?.comandaId === "string" ? input.comandaId.trim() : "";
  const productId = typeof input?.productId === "string" ? input.productId.trim() : "";
  const quantity = Number(input?.quantity);

  if (!arenaId || !comandaId || !productId) {
    throw new HttpsError("invalid-argument", "Dados do pedido inválidos.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw new HttpsError("invalid-argument", "Quantidade inválida.");
  }

  const arenaSnap = await db.collection(ARENAS).doc(arenaId).get();
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  if (!isArenaEntitledPro((arenaSnap.data() ?? {}) as DocData, nowMs)) {
    // Mesma exigência de titularidade Pro/Elite que já vale para o
    // lançamento de item pelo balcão (firestore.rules: arenaEntitled no
    // create de arenaComandas/*/items) — evita reabrir pedido pelo app numa
    // arena que baixou de plano depois de abrir a comanda.
    throw new HttpsError(
      "failed-precondition",
      "Esta arena não tem um plano com pedidos pelo app habilitados.",
    );
  }

  const comandaRef = db.collection(ARENA_COMANDAS).doc(comandaId);
  const comandaSnap = await comandaRef.get();
  if (!comandaSnap.exists) throw new HttpsError("not-found", "Comanda não encontrada.");
  const comanda = comandaSnap.data() as DocData;

  if (comanda.arenaId !== arenaId) {
    throw new HttpsError("invalid-argument", "Comanda não pertence a esta arena.");
  }
  if (comanda.allowAppOrders !== true) {
    throw new HttpsError(
      "permission-denied",
      "Pedidos pelo app não estão habilitados para esta comanda.",
    );
  }
  const status = typeof comanda.status === "string" ? comanda.status : "open";
  if (!ACTIVE_COMANDA_STATUSES.has(status)) {
    throw new HttpsError("failed-precondition", "Comanda não está aberta para lançamentos.");
  }

  const bookingId = typeof comanda.bookingId === "string" ? comanda.bookingId.trim() : "";
  if (!bookingId) {
    throw new HttpsError(
      "failed-precondition",
      "Esta comanda não está vinculada a uma reserva. Peça ao balcão para vincular sua reserva antes de pedir pelo app.",
    );
  }
  const bookingSnap = await db.collection(ARENA_BOOKINGS).doc(bookingId).get();
  if (!bookingSnap.exists) {
    throw new HttpsError("failed-precondition", "Reserva vinculada à comanda não encontrada.");
  }
  const booking = bookingSnap.data() as DocData;
  if (booking.athleteId !== uid) {
    throw new HttpsError("permission-denied", "Você não é o responsável por esta comanda.");
  }
  if (booking.arenaId !== arenaId) {
    throw new HttpsError("permission-denied", "Reserva não pertence a esta arena.");
  }
  const bookingStatus = typeof booking.status === "string" ? booking.status : "";
  if (CANCELED_BOOKING_STATUSES.has(bookingStatus)) {
    throw new HttpsError("failed-precondition", "Sua reserva vinculada foi cancelada.");
  }

  const profileSnap = await db.collection("public_profiles").doc(uid).get();
  const addedByName = athleteDisplayName(
    profileSnap.exists ? (profileSnap.data() as DocData) : undefined,
  );

  const productRef = db.collection(`${ARENAS}/${arenaId}/products`).doc(productId);

  return db.runTransaction<AddAppOrderItemResult>(async (tx) => {
    const [comandaTxSnap, productTxSnap] = await Promise.all([
      tx.get(comandaRef),
      tx.get(productRef),
    ]);
    if (!comandaTxSnap.exists) throw new HttpsError("not-found", "Comanda não encontrada.");
    const comandaData = comandaTxSnap.data() as DocData;
    const txStatus = typeof comandaData.status === "string" ? comandaData.status : "open";
    if (!ACTIVE_COMANDA_STATUSES.has(txStatus)) {
      throw new HttpsError("failed-precondition", "Comanda não está aberta para lançamentos.");
    }
    if (comandaData.allowAppOrders !== true) {
      throw new HttpsError(
        "permission-denied",
        "Pedidos pelo app não estão habilitados para esta comanda.",
      );
    }

    if (!productTxSnap.exists) throw new HttpsError("not-found", "Produto não encontrado.");
    const product = productTxSnap.data() as DocData;
    if (product.active !== true) {
      throw new HttpsError(
        "failed-precondition",
        `Produto "${String(product.name ?? "")}" está inativo.`,
      );
    }

    const unitPriceCents = typeof product.priceCents === "number" ? product.priceCents : 0;
    const before = typeof product.stockQuantity === "number" ? product.stockQuantity : 0;
    const after = before - quantity;
    if (after < 0) {
      throw new HttpsError(
        "failed-precondition",
        `Estoque insuficiente para "${String(product.name ?? "")}".`,
      );
    }

    const lineTotalCents = unitPriceCents * quantity;
    const nowTs = Timestamp.fromMillis(nowMs);

    const itemRef = db.collection(`${ARENA_COMANDAS}/${comandaId}/items`).doc();
    const item: DocData = {
      productId,
      productName: product.name,
      quantity,
      unitPriceCents,
      lineTotalCents,
      source: "app",
      addedByName,
      addedByUid: uid,
      createdAt: nowTs,
    };
    const emoji = typeof product.emoji === "string" ? product.emoji.trim() : "";
    if (emoji && emoji.length <= 16) item.emoji = emoji;
    tx.set(itemRef, item);

    const movementRef = db.collection(`${ARENAS}/${arenaId}/stockMovements`).doc();
    tx.set(movementRef, {
      productId,
      productName: product.name,
      type: "sale",
      quantityDelta: -quantity,
      quantityBefore: before,
      quantityAfter: after,
      createdByUid: uid,
      note: `comanda ${formatComandaNumber(comandaData.displayNumber)} · pedido pelo app`,
      createdAt: nowTs,
    });

    tx.set(
      productRef,
      {
        stockQuantity: after,
        updatedAt: nowTs,
      },
      {merge: true},
    );

    const rentalCents = typeof comandaData.rentalCents === "number" ? comandaData.rentalCents : 0;
    const newItemsTotalCents =
      (typeof comandaData.itemsTotalCents === "number" ? comandaData.itemsTotalCents : 0) +
      lineTotalCents;
    const newItemsCount =
      (typeof comandaData.itemsCount === "number" ? comandaData.itemsCount : 0) + quantity;
    const newTotalCents = rentalCents + newItemsTotalCents;

    tx.set(
      comandaRef,
      {
        itemsTotalCents: newItemsTotalCents,
        itemsCount: newItemsCount,
        totalCents: newTotalCents,
        updatedAt: nowTs,
      },
      {merge: true},
    );

    return {
      itemId: itemRef.id,
      lineTotalCents,
      newItemsTotalCents,
      newTotalCents,
    };
  });
}

export const addAppOrderItem = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const input = (request.data ?? {}) as AddAppOrderItemInput;
  return addAppOrderItemCore(getFirestore(), uid, input);
});
