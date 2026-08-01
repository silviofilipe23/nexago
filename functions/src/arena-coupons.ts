import {onCall, HttpsError} from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";
import {callerIsSuperAdmin} from "./auth-roles";
import {assertArenaAreaAccess, type ArenaAreaAccessMode} from "./arena-area-access";
import type {BookingTotalResult} from "./arena-pricing";

const ARENAS_COLLECTION = "arenas";
const COUPONS_SUBCOLLECTION = "coupons";
const REDEMPTIONS_SUBCOLLECTION = "redemptions";

export interface ArenaCouponDoc {
  id: string;
  code: string;
  active: boolean;
  discountPercent?: number;
  fixedDiscountReais?: number;
  validFrom?: Timestamp;
  validUntil?: Timestamp;
  maxRedemptionsTotal?: number;
  maxRedemptionsPerAthlete: number;
  redemptionsCount: number;
}

export interface CouponPricingOutcome {
  couponApplied: boolean;
  couponId: string | null;
  couponCode: string | null;
  couponDiscountReais: number;
}

// ---------------------------------------------------------------------------
// Helpers puros (sem I/O) — cobertos por arena-coupons.test.ts sem emulador.
// ---------------------------------------------------------------------------

/** Normaliza o código digitado pelo cliente: maiúsculas, sem espaços. */
export function normalizeCouponCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function parseCouponDoc(id: string, data: Record<string, unknown>): ArenaCouponDoc {
  const maxPerAthleteRaw = data["maxRedemptionsPerAthlete"];
  const maxRedemptionsPerAthlete =
    typeof maxPerAthleteRaw === "number" && maxPerAthleteRaw >= 1 ?
      Math.floor(maxPerAthleteRaw) :
      1;

  const maxTotalRaw = data["maxRedemptionsTotal"];
  const maxRedemptionsTotal =
    typeof maxTotalRaw === "number" && maxTotalRaw > 0 ?
      Math.floor(maxTotalRaw) :
      undefined;

  const redemptionsCountRaw = data["redemptionsCount"];

  return {
    id,
    code: typeof data["code"] === "string" ? (data["code"] as string) : id,
    active: data["active"] === true,
    discountPercent:
      typeof data["discountPercent"] === "number" ? (data["discountPercent"] as number) : undefined,
    fixedDiscountReais:
      typeof data["fixedDiscountReais"] === "number" ?
        (data["fixedDiscountReais"] as number) :
        undefined,
    validFrom: data["validFrom"] instanceof Timestamp ? (data["validFrom"] as Timestamp) : undefined,
    validUntil: data["validUntil"] instanceof Timestamp ? (data["validUntil"] as Timestamp) : undefined,
    maxRedemptionsTotal,
    maxRedemptionsPerAthlete,
    redemptionsCount: typeof redemptionsCountRaw === "number" ? redemptionsCountRaw : 0,
  };
}

/** `null` = cupom utilizável agora; caso contrário, motivo pra exibir ao atleta. */
export function couponValidityError(coupon: ArenaCouponDoc, now: Date): string | null {
  if (!coupon.active) {
    return "Este cupom não está mais ativo.";
  }
  if (coupon.validFrom && now < coupon.validFrom.toDate()) {
    return "Este cupom ainda não está disponível.";
  }
  if (coupon.validUntil && now > coupon.validUntil.toDate()) {
    return "Este cupom expirou.";
  }
  return null;
}

/** `null` = dentro do limite; caso contrário, motivo pra exibir ao atleta. */
export function couponRedemptionLimitError(
  coupon: ArenaCouponDoc,
  usage: {totalRedemptions: number; athleteRedemptions: number},
): string | null {
  if (
    coupon.maxRedemptionsTotal != null &&
    usage.totalRedemptions >= coupon.maxRedemptionsTotal
  ) {
    return "Este cupom atingiu o limite de usos.";
  }
  if (usage.athleteRedemptions >= coupon.maxRedemptionsPerAthlete) {
    return "Você já utilizou este cupom o máximo de vezes permitido.";
  }
  return null;
}

/** Desconto do cupom (percentual OU fixo, mesmo XOR de `promotions`) sobre o subtotal base. */
export function computeCouponDiscountReais(
  coupon: ArenaCouponDoc,
  baseSubtotalReais: number,
): number {
  if (baseSubtotalReais <= 0) return 0;
  if (coupon.fixedDiscountReais != null && coupon.fixedDiscountReais > 0) {
    return Math.round(Math.min(baseSubtotalReais, coupon.fixedDiscountReais) * 100) / 100;
  }
  if (coupon.discountPercent != null && coupon.discountPercent > 0) {
    const pct = Math.min(100, Math.max(0, coupon.discountPercent));
    return Math.round(baseSubtotalReais * (pct / 100) * 100) / 100;
  }
  return 0;
}

/**
 * Precedência cupom × promoção automática: NÃO acumulam — vale o MAIOR
 * desconto (menor preço final pro cliente). Mantém a auditoria simples (um
 * único motivo de desconto por reserva) e evita que a arena "sangre" caixa
 * com dois descontos empilhados sem uma decisão explícita de negócio.
 * `coupon` já deve ter passado por `couponValidityError`/`couponRedemptionLimitError`.
 */
export function decideCouponVsPromotion(params: {
  coupon: ArenaCouponDoc;
  baseSubtotalReais: number;
  promotionAmountReais: number;
}): {couponApplied: boolean; amountReais: number; couponDiscountReais: number} {
  const couponDiscountReais = computeCouponDiscountReais(params.coupon, params.baseSubtotalReais);
  const couponAmountReais = Math.max(
    0,
    Math.round((params.baseSubtotalReais - couponDiscountReais) * 100) / 100,
  );
  if (couponDiscountReais > 0 && couponAmountReais < params.promotionAmountReais) {
    return {couponApplied: true, amountReais: couponAmountReais, couponDiscountReais};
  }
  return {couponApplied: false, amountReais: params.promotionAmountReais, couponDiscountReais: 0};
}

// ---------------------------------------------------------------------------
// I/O — Firestore
// ---------------------------------------------------------------------------

function couponsCollection(db: Firestore, arenaId: string) {
  return db.collection(ARENAS_COLLECTION).doc(arenaId).collection(COUPONS_SUBCOLLECTION);
}

export function couponDocRef(db: Firestore, arenaId: string, couponId: string) {
  return couponsCollection(db, arenaId).doc(couponId);
}

export function couponRedemptionDocRef(
  db: Firestore,
  arenaId: string,
  couponId: string,
  athleteId: string,
) {
  return couponDocRef(db, arenaId, couponId).collection(REDEMPTIONS_SUBCOLLECTION).doc(athleteId);
}

export async function loadArenaCouponByCode(
  db: Firestore,
  arenaId: string,
  code: string,
): Promise<ArenaCouponDoc | null> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  const snap = await couponDocRef(db, arenaId, normalized).get();
  if (!snap.exists) return null;
  return parseCouponDoc(snap.id, snap.data() as Record<string, unknown>);
}

async function readAthleteCouponRedemptions(
  db: Firestore,
  arenaId: string,
  couponId: string,
  athleteId: string,
): Promise<number> {
  const snap = await couponRedemptionDocRef(db, arenaId, couponId, athleteId).get();
  const count = snap.data()?.["count"];
  return typeof count === "number" ? count : 0;
}

/**
 * Resolve o `couponCode` opcional de uma cotação/reserva contra a promoção
 * automática já calculada (`promoTotal`). Não escreve nada (leitura apenas) —
 * o resgate só é gravado em `reserveCouponRedemptionInTransaction`, chamado
 * na confirmação real da reserva. Lança `HttpsError` se o código foi
 * informado mas é inválido/expirado/esgotado (falha rápida pro atleta:
 * ele digitou um código, então merece feedback explícito, não um silêncio).
 */
export async function resolveCouponForBooking(params: {
  db: Firestore;
  arenaId: string;
  athleteId: string;
  couponCode: string | undefined;
  promoTotal: BookingTotalResult;
}): Promise<{result: BookingTotalResult; coupon: CouponPricingOutcome}> {
  const code = normalizeCouponCode(params.couponCode);
  const noCoupon: CouponPricingOutcome = {
    couponApplied: false,
    couponId: null,
    couponCode: null,
    couponDiscountReais: 0,
  };
  if (!code) {
    return {result: params.promoTotal, coupon: noCoupon};
  }

  const coupon = await loadArenaCouponByCode(params.db, params.arenaId, code);
  if (!coupon) {
    throw new HttpsError("not-found", "Cupom não encontrado.");
  }

  const validityError = couponValidityError(coupon, new Date());
  if (validityError) {
    throw new HttpsError("failed-precondition", validityError);
  }

  const athleteRedemptions = await readAthleteCouponRedemptions(
    params.db,
    params.arenaId,
    coupon.id,
    params.athleteId,
  );
  const limitError = couponRedemptionLimitError(coupon, {
    totalRedemptions: coupon.redemptionsCount,
    athleteRedemptions,
  });
  if (limitError) {
    throw new HttpsError("failed-precondition", limitError);
  }

  const baseSubtotalReais = params.promoTotal.lineItems.reduce(
    (sum, l) => sum + l.baseSlotPriceReais,
    0,
  );
  const decision = decideCouponVsPromotion({
    coupon,
    baseSubtotalReais,
    promotionAmountReais: params.promoTotal.amountReais,
  });

  if (!decision.couponApplied) {
    return {result: params.promoTotal, coupon: noCoupon};
  }

  return {
    result: {
      amountReais: decision.amountReais,
      lineItems: params.promoTotal.lineItems.map((l) => ({
        startTime: l.startTime,
        endTime: l.endTime,
        baseSlotPriceReais: l.baseSlotPriceReais,
        finalSlotPriceReais: l.baseSlotPriceReais,
      })),
      appliedPromotionIds: [],
    },
    coupon: {
      couponApplied: true,
      couponId: coupon.id,
      couponCode: coupon.code,
      couponDiscountReais: decision.couponDiscountReais,
    },
  };
}

/**
 * Grava o resgate do cupom dentro da MESMA transação que cria a reserva —
 * revalida vigência/limites com dados frescos (defesa contra corrida entre
 * duas reservas concorrentes disputando o último resgate disponível) antes
 * de incrementar os contadores. Deve ser chamada na fase de leitura da
 * transação (antes de qualquer `transaction.set`/`update`).
 */
export async function reserveCouponRedemptionInTransaction(params: {
  transaction: Transaction;
  db: Firestore;
  arenaId: string;
  couponId: string;
  athleteId: string;
}): Promise<() => void> {
  const couponRef = couponDocRef(params.db, params.arenaId, params.couponId);
  const redemptionRef = couponRedemptionDocRef(
    params.db,
    params.arenaId,
    params.couponId,
    params.athleteId,
  );
  const [couponSnap, redemptionSnap] = await Promise.all([
    params.transaction.get(couponRef),
    params.transaction.get(redemptionRef),
  ]);

  if (!couponSnap.exists) {
    throw new HttpsError("failed-precondition", "Cupom não encontrado.");
  }
  const coupon = parseCouponDoc(couponSnap.id, couponSnap.data() as Record<string, unknown>);
  const validityError = couponValidityError(coupon, new Date());
  if (validityError) {
    throw new HttpsError("failed-precondition", validityError);
  }
  const athleteRedemptions = redemptionSnap.exists ?
    ((redemptionSnap.data()?.["count"] as number | undefined) ?? 0) :
    0;
  const limitError = couponRedemptionLimitError(coupon, {
    totalRedemptions: coupon.redemptionsCount,
    athleteRedemptions,
  });
  if (limitError) {
    throw new HttpsError("failed-precondition", limitError);
  }

  const redemptionExisted = redemptionSnap.exists;

  // Retorna a função de escrita — o chamador a executa depois de terminar
  // todas as leituras da transação (regra do Firestore: leituras antes de
  // escritas).
  return () => {
    params.transaction.update(couponRef, {redemptionsCount: FieldValue.increment(1)});
    params.transaction.set(
      redemptionRef,
      {
        athleteId: params.athleteId,
        count: FieldValue.increment(1),
        lastRedeemedAt: FieldValue.serverTimestamp(),
        ...(redemptionExisted ? {} : {createdAt: FieldValue.serverTimestamp()}),
      },
      {merge: true},
    );
  };
}

// ---------------------------------------------------------------------------
// Callables de gestão (lado gestor da arena)
// ---------------------------------------------------------------------------

/**
 * Cupons são área "promocoes" (mesma área da UI/rules): dono da arena, super
 * admin (bypass que já existia aqui antes desta migração — preservado), ou
 * membro de equipe ativo cujo cargo cobre "promocoes" no modo pedido
 * (gestor/financeiro, arena com plano pago) — via `assertArenaAreaAccess`.
 */
async function assertCallerManagesArena(
  arenaId: string,
  callerUid: string,
  mode: ArenaAreaAccessMode,
): Promise<void> {
  const arenaSnap = await getFirestore().collection(ARENAS_COLLECTION).doc(arenaId).get();
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  const caller = await getAuth().getUser(callerUid);
  if (callerIsSuperAdmin(caller)) return;
  await assertArenaAreaAccess(getFirestore(), arenaId, callerUid, "promocoes", mode);
}

function parseOptionalDate(raw: unknown): Date | null {
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw);
  }
  return null;
}

function serializeCoupon(c: ArenaCouponDoc) {
  return {
    id: c.id,
    code: c.code,
    active: c.active,
    discountPercent: c.discountPercent ?? null,
    fixedDiscountReais: c.fixedDiscountReais ?? null,
    validFrom: c.validFrom ? c.validFrom.toDate().toISOString() : null,
    validUntil: c.validUntil ? c.validUntil.toDate().toISOString() : null,
    maxRedemptionsTotal: c.maxRedemptionsTotal ?? null,
    maxRedemptionsPerAthlete: c.maxRedemptionsPerAthlete,
    redemptionsCount: c.redemptionsCount,
  };
}

/** Cria um cupom de marketing (código digitável, validade, limite de uso). */
export const createArenaCoupon = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const data = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
  if (!arenaId) {
    throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  }

  await assertCallerManagesArena(arenaId, callerUid, "write");

  const code = normalizeCouponCode(data.code);
  if (!code || code.length < 3) {
    throw new HttpsError(
      "invalid-argument",
      "Informe um código de cupom com ao menos 3 caracteres.",
    );
  }

  const discountPercent = typeof data.discountPercent === "number" ? data.discountPercent : undefined;
  const fixedDiscountReais =
    typeof data.fixedDiscountReais === "number" ? data.fixedDiscountReais : undefined;
  const hasPercent = discountPercent != null && discountPercent > 0;
  const hasFixed = fixedDiscountReais != null && fixedDiscountReais > 0;
  // XOR: mesmo padrão de `promotions` (discountPercent OU fixedPricePerHourReais).
  if (hasPercent === hasFixed) {
    throw new HttpsError(
      "invalid-argument",
      "Informe desconto percentual OU valor fixo em reais (não os dois).",
    );
  }
  if (hasPercent && (discountPercent! <= 0 || discountPercent! > 100)) {
    throw new HttpsError("invalid-argument", "discountPercent deve estar entre 1 e 100.");
  }
  if (hasFixed && fixedDiscountReais! <= 0) {
    throw new HttpsError("invalid-argument", "fixedDiscountReais deve ser maior que zero.");
  }

  const validFrom = parseOptionalDate(data.validFrom);
  const validUntil = parseOptionalDate(data.validUntil);
  if (validFrom && validUntil && validUntil.getTime() < validFrom.getTime()) {
    throw new HttpsError("invalid-argument", "validUntil não pode ser anterior a validFrom.");
  }

  const maxRedemptionsTotalRaw = data.maxRedemptionsTotal;
  const maxRedemptionsTotal =
    typeof maxRedemptionsTotalRaw === "number" && maxRedemptionsTotalRaw > 0 ?
      Math.floor(maxRedemptionsTotalRaw) :
      undefined;

  const maxPerAthleteRaw = data.maxRedemptionsPerAthlete;
  const maxRedemptionsPerAthlete =
    typeof maxPerAthleteRaw === "number" && maxPerAthleteRaw >= 1 ?
      Math.floor(maxPerAthleteRaw) :
      1;

  const db = getFirestore();
  const ref = couponDocRef(db, arenaId, code);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", "Já existe um cupom com este código nesta arena.");
  }

  await ref.set({
    code,
    active: true,
    redemptionsCount: 0,
    maxRedemptionsPerAthlete,
    ...(hasPercent ? {discountPercent} : {}),
    ...(hasFixed ? {fixedDiscountReais} : {}),
    ...(validFrom ? {validFrom: Timestamp.fromDate(validFrom)} : {}),
    ...(validUntil ? {validUntil: Timestamp.fromDate(validUntil)} : {}),
    ...(maxRedemptionsTotal != null ? {maxRedemptionsTotal} : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("createArenaCoupon: cupom criado", {arenaId, couponId: code});
  return {couponId: code};
});

/** Lista os cupons da arena (todos, inclusive inativos — filtro fica na UI). */
export const listArenaCoupons = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const data = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
  if (!arenaId) {
    throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  }

  await assertCallerManagesArena(arenaId, callerUid, "read");

  const db = getFirestore();
  const snap = await couponsCollection(db, arenaId).orderBy("createdAt", "desc").get();
  const coupons = snap.docs.map((doc) =>
    serializeCoupon(parseCouponDoc(doc.id, doc.data() as Record<string, unknown>)),
  );
  return {coupons};
});

/** Desativa um cupom (ação unidirecional — reativar exige criar um novo código). */
export const deactivateArenaCoupon = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const data = (request.data ?? {}) as Record<string, unknown>;
  const arenaId = typeof data.arenaId === "string" ? data.arenaId.trim() : "";
  const couponId = typeof data.couponId === "string" ? data.couponId.trim() : "";
  if (!arenaId || !couponId) {
    throw new HttpsError("invalid-argument", "arenaId e couponId são obrigatórios.");
  }

  await assertCallerManagesArena(arenaId, callerUid, "write");

  const db = getFirestore();
  const ref = couponDocRef(db, arenaId, couponId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Cupom não encontrado.");
  }
  await ref.update({active: false, updatedAt: FieldValue.serverTimestamp()});
  return {success: true};
});
