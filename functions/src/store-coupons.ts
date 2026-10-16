/**
 * Loja: cupons e descontos automáticos (tela "Cupons & promoções").
 *
 *   storeCoupons/{id}            — o cupom; `uses` só o servidor mexe (pedido pago).
 *   storeCouponCodes/{CODE}      — chave de unicidade do código.
 *   storeConfig/discounts        — descontos automáticos (Pix, leve 3 pague 2, nível).
 *
 * As rules negam escrita de cliente: estas callables são a única porta. A aplicação no
 * checkout (validação, cálculo, contagem de uso) fica para quando a Loja tiver pedidos.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const COUPONS = "storeCoupons";
export const COUPON_CODES = "storeCouponCodes";
const STORE_CONFIG = "storeConfig";
const DISCOUNTS_ID = "discounts";

export type CouponType = "percent" | "fixed";
export type CouponScopeType = "store" | "category" | "collection" | "products" | "tournament" | "arena";

export interface CouponInput {
  /** Ausente = criar. */
  couponId?: string;
  code: string;
  type: CouponType;
  /** Porcentagem (1–100) ou centavos (> 0), conforme `type`. */
  value: number;
  /** Teto do desconto, só para porcentagem. */
  maxDiscountCents: number | null;
  scope: {type: CouponScopeType; ids: string[]; labels: string[]};
  minOrderCents: number | null;
  usageLimit: number | null;
  onePerAthlete: boolean;
  stacksWithPix: boolean;
  appOnly: boolean;
  /** Datas civis (America/Sao_Paulo), inclusivas. */
  startDate: string;
  endDate: string | null;
}

export type AutoDiscountId = "pix" | "leve3pague2" | "nivel5";

export interface AutoDiscount {
  id: AutoDiscountId;
  name: string;
  description: string;
  type: "pagamento" | "leveXpagueY" | "nivelAtleta";
  /** Porcentagem, quando a regra tem uma. O Pix é o mesmo % do "No Pix sai por…". */
  percent: number | null;
  active: boolean;
}

/** O que vale enquanto `storeConfig/discounts` não existir. O backoffice espelha isto. */
export const DEFAULT_AUTO_DISCOUNTS: AutoDiscount[] = [
  {
    id: "pix", name: "Pix", description: "5% em todo o carrinho (exceto frete)",
    type: "pagamento", percent: 5, active: true,
  },
  {
    id: "leve3pague2", name: "Kit leve 3, pague 2", description: "Viseiras e garrafas · menor preço sai grátis",
    type: "leveXpagueY", percent: null, active: false,
  },
  {
    id: "nivel5", name: "Atleta nível 5+", description: "8% em vestuário para atletas avançados",
    type: "nivelAtleta", percent: 8, active: true,
  },
];

export const CODE_RE = /^[A-Z0-9]{4,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SCOPES: CouponScopeType[] = ["store", "category", "collection", "products", "tournament", "arena"];
const MAX_SCOPE_IDS = 50;

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [...new Set(fields)].sort()});
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function optionalPositive(v: unknown): boolean {
  return v === null || isPositiveInt(v);
}

function isDate(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

/** Código como o atleta digita: sem espaço, maiúsculo. */
export function normalizeCode(code: unknown): string {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

export function couponErrors(input: CouponInput): string[] {
  const fields: string[] = [];
  if (!CODE_RE.test(normalizeCode(input.code))) fields.push("code");
  if (input.type !== "percent" && input.type !== "fixed") fields.push("type");
  if (!isPositiveInt(input.value) || (input.type === "percent" && input.value > 100)) fields.push("value");
  if (!optionalPositive(input.maxDiscountCents) || (input.type === "fixed" && input.maxDiscountCents !== null)) {
    fields.push("maxDiscountCents");
  }
  const scope = input.scope;
  const ids = Array.isArray(scope?.ids) ? scope.ids : null;
  const labels = Array.isArray(scope?.labels) ? scope.labels : null;
  if (
    !scope || !SCOPES.includes(scope.type) || !ids || !labels ||
    ids.length > MAX_SCOPE_IDS || labels.length !== ids.length ||
    (scope.type === "store" ? ids.length !== 0 : ids.length === 0) ||
    ids.some((id) => typeof id !== "string" || !ID_RE.test(id)) ||
    labels.some((l) => typeof l !== "string" || l.length > 120)
  ) {
    fields.push("scope");
  }
  if (!optionalPositive(input.minOrderCents)) fields.push("minOrderCents");
  if (!optionalPositive(input.usageLimit)) fields.push("usageLimit");
  for (const flag of ["onePerAthlete", "stacksWithPix", "appOnly"] as const) {
    if (typeof input[flag] !== "boolean") fields.push(flag);
  }
  if (!isDate(input.startDate)) fields.push("startDate");
  if (input.endDate !== null && (!isDate(input.endDate) || input.endDate < input.startDate)) fields.push("endDate");
  return fields;
}

function duplicateCode(): HttpsError {
  return new HttpsError("already-exists", "Já existe um cupom com este código.", {fields: ["code"]});
}

export async function saveCouponCore(
  db: Firestore,
  input: CouponInput,
  actor: Actor,
  now: Date,
): Promise<{couponId: string}> {
  const errors = couponErrors(input ?? ({} as CouponInput));
  if (input?.couponId !== undefined && (typeof input.couponId !== "string" || !ID_RE.test(input.couponId))) {
    errors.push("couponId");
  }
  if (errors.length > 0) throw invalidFields(errors);

  const code = normalizeCode(input.code);
  const ref = input.couponId ? db.collection(COUPONS).doc(input.couponId) : db.collection(COUPONS).doc();
  const keyRef = db.collection(COUPON_CODES).doc(code);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const [snap, key] = [await tx.get(ref), await tx.get(keyRef)];
    if (input.couponId && !snap.exists) throw new HttpsError("not-found", "Cupom não encontrado.");
    const existing = snap.exists ? snap.data()! : null;
    const keyOwner = key.exists ? key.data()!["couponId"] : null;
    if (keyOwner !== null && keyOwner !== ref.id) throw duplicateCode();

    const used = ((existing?.["uses"] ?? 0) as number) > 0;
    // Quem já usou o cupom guardou aquele código e aquele tipo de desconto.
    if (existing && used && (existing["code"] !== code || existing["type"] !== input.type)) {
      throw new HttpsError(
        "failed-precondition",
        "Cupom já usado: código e tipo não podem mudar.",
        {fields: ["code", "type"].filter((f) => (f === "code" ? existing["code"] !== code : existing["type"] !== input.type))},
      );
    }

    // ---------- escritas ----------
    if (existing && existing["code"] !== code) tx.delete(db.collection(COUPON_CODES).doc(existing["code"]));
    if (keyOwner === null) tx.set(keyRef, {couponId: ref.id});
    tx.set(ref, {
      code,
      type: input.type,
      value: input.value,
      maxDiscountCents: input.type === "percent" ? input.maxDiscountCents : null,
      scope: {
        type: input.scope.type,
        ids: input.scope.ids,
        labels: input.scope.labels.map((l) => l.trim()),
      },
      minOrderCents: input.minOrderCents,
      usageLimit: input.usageLimit,
      onePerAthlete: input.onePerAthlete,
      stacksWithPix: input.stacksWithPix,
      appOnly: input.appOnly,
      startDate: input.startDate,
      endDate: input.endDate,
      uses: existing?.["uses"] ?? 0,
      paused: existing?.["paused"] ?? false,
      endedAt: existing?.["endedAt"] ?? null,
      createdAt: existing?.["createdAt"] ?? now,
      createdBy: existing?.["createdBy"] ?? actor,
      updatedAt: now,
      updatedBy: actor,
    });
    return {couponId: ref.id};
  });
}

async function existingCoupon(db: Firestore, couponId: unknown) {
  if (typeof couponId !== "string" || !ID_RE.test(couponId)) throw invalidFields(["couponId"]);
  const ref = db.collection(COUPONS).doc(couponId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Cupom não encontrado.");
  return {ref, data: snap.data()!};
}

export async function setCouponPausedCore(
  db: Firestore,
  input: {couponId: string; paused: boolean},
  actor: Actor,
  now: Date,
): Promise<{paused: boolean}> {
  if (typeof input?.paused !== "boolean") throw invalidFields(["paused"]);
  const {ref, data} = await existingCoupon(db, input.couponId);
  if (data["endedAt"]) throw new HttpsError("failed-precondition", "Cupom encerrado não volta a valer.");
  await ref.set({paused: input.paused, updatedAt: now, updatedBy: actor}, {merge: true});
  return {paused: input.paused};
}

/** Encerra de vez. Pedidos já feitos não mudam; o código continua reservado (não reaproveita). */
export async function endCouponCore(
  db: Firestore,
  input: {couponId: string},
  actor: Actor,
  now: Date,
): Promise<{endedAt: Date}> {
  const {ref, data} = await existingCoupon(db, input?.couponId);
  if (data["endedAt"]) return {endedAt: data["endedAt"]};
  await ref.set({endedAt: now, endedBy: actor, updatedAt: now, updatedBy: actor}, {merge: true});
  return {endedAt: now};
}

/** Doc salvo por cima do padrão, regra a regra — o doc pode ser de versão anterior. */
export function withDiscountDefaults(data: Record<string, unknown> | undefined): AutoDiscount[] {
  const saved = Array.isArray(data?.["rules"]) ? (data!["rules"] as Partial<AutoDiscount>[]) : [];
  return DEFAULT_AUTO_DISCOUNTS.map((rule) => ({...rule, ...(saved.find((r) => r?.id === rule.id) ?? {})}));
}

export async function setAutoDiscountActiveCore(
  db: Firestore,
  input: {id: AutoDiscountId; active: boolean},
  actor: Actor,
  now: Date,
): Promise<AutoDiscount[]> {
  if (!DEFAULT_AUTO_DISCOUNTS.some((r) => r.id === input?.id) || typeof input.active !== "boolean") {
    throw invalidFields(["id", "active"]);
  }
  const ref = db.collection(STORE_CONFIG).doc(DISCOUNTS_ID);
  const rules = withDiscountDefaults((await ref.get()).data()).map((r) =>
    r.id === input.id ? {...r, active: input.active} : r,
  );
  await ref.set({rules, updatedAt: now, updatedBy: actor});
  return rules;
}

async function actorOf(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return assertCatalogAdmin(uid);
}

export const saveStoreCoupon = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return saveCouponCore(getFirestore(), (request.data ?? {}) as CouponInput, actor, new Date());
});

export const setStoreCouponPaused = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const input = (request.data ?? {}) as {couponId: string; paused: boolean};
  return setCouponPausedCore(getFirestore(), input, actor, new Date());
});

export const endStoreCoupon = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return endCouponCore(getFirestore(), (request.data ?? {}) as {couponId: string}, actor, new Date());
});

export const setStoreAutoDiscountActive = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const input = (request.data ?? {}) as {id: AutoDiscountId; active: boolean};
  return setAutoDiscountActiveCore(getFirestore(), input, actor, new Date());
});
