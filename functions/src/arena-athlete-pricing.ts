/**
 * Preço da hora conforme o perfil do atleta (opcional, por arena).
 *
 * A arena liga um ou os dois perfis em `arenas/{arenaId}.athletePricing` e diz quem é cada um em
 * `arenaAthletePricingMembers/{arenaId}_{athleteId}`:
 *   - Avulso (todo o resto): preço normal da quadra, como sempre.
 *   - Aluno (validado pela arena): preço fixo por hora OU % de desconto.
 *   - Professor (ex.: dá aula de outro esporte): preço fixo por hora OU % de desconto.
 *
 * Arena sem `athletePricing` (ou com os dois perfis desligados) não lê nada a mais e nada muda.
 *
 * Mesma régua de cupom × promoção × desconto do professor: descontos NÃO acumulam, vale o menor
 * preço. O preço do perfil incide sobre o preço CHEIO de cada horário; em cada horário fica o menor
 * entre o do perfil e o da promoção. Se o cupom deixa a reserva mais barata, nada muda; se o perfil
 * vence, a reserva sai sem cupom (não é consumido).
 *
 * Só a reserva avulsa do atleta (`quoteArenaBooking`/`createArenaBooking`) usa: horário fixo,
 * planos de horário, clubinho e reserva manual seguem com o preço deles.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type DocumentData, type Firestore} from "firebase-admin/firestore";
import type {BookingTotalResult, VirtualSlotPricing} from "./arena-pricing";
import {resolveSlotPrice} from "./arena-pricing";
import type {CouponPricingOutcome} from "./arena-coupons";
import {roundMoney} from "./mercadopago-arena-helpers";
import {assertArenaAreaAccess} from "./arena-area-access";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export const ARENA_ATHLETE_PRICING_MEMBERS = "arenaAthletePricingMembers";

export const ATHLETE_PRICING_TIERS = ["student", "professor"] as const;
export type AthletePricingTier = (typeof ATHLETE_PRICING_TIERS)[number];

export const ATHLETE_PRICING_DEFAULT_LABEL: Record<AthletePricingTier, string> = {
  student: "Aluno",
  professor: "Professor",
};

export type AthletePricingMode = "fixed" | "percent";

/** Um perfil configurado (ligado ou não). */
export interface AthletePricingTierConfig {
  enabled: boolean;
  label: string;
  mode: AthletePricingMode;
  /** Preço da hora do perfil (modo "fixed"). */
  pricePerHourReais: number | null;
  /** % sobre o preço cheio (modo "percent"), inteiro 1–90. */
  discountPercent: number | null;
}

export type AthletePricingConfig = Record<AthletePricingTier, AthletePricingTierConfig>;

/** Regra que vale para ESTE atleta nesta arena. */
export interface AthletePricingRule {
  tier: AthletePricingTier;
  label: string;
  mode: AthletePricingMode;
  pricePerHourReais: number | null;
  discountPercent: number | null;
}

export interface AthletePricingOutcome {
  /** Perfil aplicado na reserva — `null` quando não houve ou não venceu. */
  athletePricingTier: AthletePricingTier | null;
  /** "Aluno", "Professor de outro esporte"... — `null` sem perfil. */
  athletePricingLabel: string | null;
  /** Quanto o perfil tirou do preço cheio. */
  athletePricingDiscountReais: number;
}

export const NO_ATHLETE_PRICING: AthletePricingOutcome = {
  athletePricingTier: null,
  athletePricingLabel: null,
  athletePricingDiscountReais: 0,
};

const NO_COUPON: CouponPricingOutcome = {
  couponApplied: false,
  couponId: null,
  couponCode: null,
  couponDiscountReais: 0,
};

const MAX_LABEL = 40;
const MAX_PRICE_PER_HOUR = 10000;
const MAX_PERCENT = 90;
const MAX_NOTE = 140;

export function isAthletePricingTier(raw: unknown): raw is AthletePricingTier {
  return typeof raw === "string" && (ATHLETE_PRICING_TIERS as readonly string[]).includes(raw);
}

export function athletePricingMemberId(arenaId: string, athleteId: string): string {
  return `${arenaId}_${athleteId}`;
}

function positiveNumber(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Lê um perfil gravado; valor inválido = perfil desligado. Puro. */
function readTier(raw: unknown, tier: AthletePricingTier): AthletePricingTierConfig {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const mode: AthletePricingMode = data["mode"] === "percent" ? "percent" : "fixed";
  const label = typeof data["label"] === "string" && data["label"].trim() ?
    data["label"].trim().slice(0, MAX_LABEL) :
    ATHLETE_PRICING_DEFAULT_LABEL[tier];
  const price = positiveNumber(data["pricePerHourReais"]);
  const percentRaw = positiveNumber(data["discountPercent"]);
  const percent = percentRaw != null ? Math.min(MAX_PERCENT, Math.round(percentRaw)) : null;
  const valid = mode === "fixed" ? price != null : percent != null;
  return {
    enabled: data["enabled"] === true && valid,
    label,
    mode,
    pricePerHourReais: price != null ? roundMoney(price) : null,
    discountPercent: percent,
  };
}

/** Config da arena (`arenas/{id}.athletePricing`). Ausente = os dois perfis desligados. Puro. */
export function readAthletePricingConfig(arenaData: DocumentData | undefined): AthletePricingConfig {
  const raw = arenaData?.["athletePricing"];
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    student: readTier(data["student"], "student"),
    professor: readTier(data["professor"], "professor"),
  };
}

export function hasAnyAthletePricingTier(config: AthletePricingConfig): boolean {
  return ATHLETE_PRICING_TIERS.some((t) => config[t].enabled);
}

/** Regra do atleta: o perfil dele precisa estar ligado na arena. Puro. */
export function athletePricingRuleFor(
  config: AthletePricingConfig,
  member: DocumentData | undefined | null,
): AthletePricingRule | null {
  if (!member || !isAthletePricingTier(member["tier"])) return null;
  const tier = member["tier"];
  const tierConfig = config[tier];
  if (!tierConfig.enabled) return null;
  return {
    tier,
    label: tierConfig.label,
    mode: tierConfig.mode,
    pricePerHourReais: tierConfig.pricePerHourReais,
    discountPercent: tierConfig.discountPercent,
  };
}

function minutesOf(hm: string): number | null {
  const [h, m] = hm.trim().split(":");
  const hh = Number(h);
  const mm = Number(m ?? "0");
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  return hh * 60 + mm;
}

function lineMinutes(line: {startTime: string; endTime: string}): number {
  const start = minutesOf(line.startTime);
  let end = minutesOf(line.endTime);
  if (start == null || end == null) return 0;
  if (end <= start) end += 24 * 60;
  return end - start;
}

/** Preço do horário para o perfil (sobre o preço cheio). Puro. */
export function athletePricingSlotPrice(
  line: {startTime: string; endTime: string; baseSlotPriceReais: number},
  rule: Pick<AthletePricingRule, "mode" | "pricePerHourReais" | "discountPercent">,
): number {
  if (rule.mode === "fixed") {
    const price = rule.pricePerHourReais ?? 0;
    const minutes = lineMinutes(line);
    if (price <= 0 || minutes <= 0) return line.baseSlotPriceReais;
    return resolveSlotPrice(price, minutes);
  }
  const percent = rule.discountPercent ?? 0;
  if (percent <= 0) return line.baseSlotPriceReais;
  return roundMoney(line.baseSlotPriceReais * (1 - percent / 100));
}

/**
 * Aplica o preço do perfil sobre o resultado de promoção + cupom. Em cada horário fica o menor
 * entre o perfil e o que já estava; se o total não cair, nada muda. Puro.
 */
export function applyAthletePricing(
  current: {result: BookingTotalResult; coupon: CouponPricingOutcome},
  rule: AthletePricingRule | null,
): {result: BookingTotalResult; coupon: CouponPricingOutcome; athletePricing: AthletePricingOutcome} {
  if (!rule || current.result.lineItems.length === 0) {
    return {...current, athletePricing: NO_ATHLETE_PRICING};
  }
  // Com cupom as linhas já vêm no preço cheio (o cupom é sobre o total): o perfil compete com o
  // total do cupom, não linha a linha.
  const lineItems: VirtualSlotPricing[] = current.result.lineItems.map((l) => {
    const tierPrice = Math.min(l.baseSlotPriceReais, athletePricingSlotPrice(l, rule));
    if (tierPrice >= l.finalSlotPriceReais) return l;
    return {
      startTime: l.startTime,
      endTime: l.endTime,
      baseSlotPriceReais: l.baseSlotPriceReais,
      finalSlotPriceReais: tierPrice,
    };
  });
  const amountReais = roundMoney(lineItems.reduce((sum, l) => sum + l.finalSlotPriceReais, 0));
  if (amountReais >= current.result.amountReais) {
    return {...current, athletePricing: NO_ATHLETE_PRICING};
  }
  const fullReais = lineItems.reduce((sum, l) => sum + l.baseSlotPriceReais, 0);
  const appliedPromotionIds = [
    ...new Set(lineItems.map((l) => l.appliedPromotionId).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    )),
  ];
  return {
    result: {amountReais, lineItems, appliedPromotionIds},
    coupon: NO_COUPON,
    athletePricing: {
      athletePricingTier: rule.tier,
      athletePricingLabel: rule.label,
      athletePricingDiscountReais: roundMoney(Math.max(0, fullReais - amountReais)),
    },
  };
}

/**
 * Regra do atleta nesta arena. Arena sem perfil ligado não lê o vínculo (zero leitura a mais).
 */
export async function loadAthletePricingRule(
  db: Firestore,
  arenaId: string,
  arenaData: DocumentData | undefined,
  athleteId: string,
): Promise<AthletePricingRule | null> {
  const config = readAthletePricingConfig(arenaData);
  if (!hasAnyAthletePricingTier(config) || !arenaId || !athleteId) return null;
  const snap = await db.collection(ARENA_ATHLETE_PRICING_MEMBERS)
    .doc(athletePricingMemberId(arenaId, athleteId))
    .get();
  return athletePricingRuleFor(config, snap.exists ? snap.data() : null);
}

// ---------------------------------------------------------------------------
// Callables do portal da arena (área "promocoes", escrita)
// ---------------------------------------------------------------------------

export interface SetAthletePricingInput {
  arenaId: string;
  tiers: Record<AthletePricingTier, AthletePricingTierConfig>;
}

function parseTierInput(raw: unknown, tier: AthletePricingTier): AthletePricingTierConfig {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const enabled = data["enabled"] === true;
  const mode: AthletePricingMode = data["mode"] === "percent" ? "percent" : "fixed";
  const label = typeof data["label"] === "string" && data["label"].trim() ?
    data["label"].trim().slice(0, MAX_LABEL) :
    ATHLETE_PRICING_DEFAULT_LABEL[tier];
  const price = positiveNumber(data["pricePerHourReais"]);
  const percentRaw = positiveNumber(data["discountPercent"]);
  const percent = percentRaw != null ? Math.round(percentRaw) : null;
  const name = ATHLETE_PRICING_DEFAULT_LABEL[tier];
  if (enabled && mode === "fixed" && (price == null || price > MAX_PRICE_PER_HOUR)) {
    throw new HttpsError("invalid-argument", `Defina o preço da hora do perfil ${name}.`);
  }
  if (enabled && mode === "percent" && (percent == null || percent < 1 || percent > MAX_PERCENT)) {
    throw new HttpsError("invalid-argument", `O desconto do perfil ${name} vai de 1% a ${MAX_PERCENT}%.`);
  }
  return {
    enabled,
    label,
    mode,
    pricePerHourReais: price != null && price <= MAX_PRICE_PER_HOUR ? roundMoney(price) : null,
    discountPercent: percent != null && percent >= 1 && percent <= MAX_PERCENT ? percent : null,
  };
}

/** Valida o payload do portal. Puro. */
export function parseSetAthletePricingInput(raw: unknown): SetAthletePricingInput {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const arenaId = typeof data["arenaId"] === "string" ? data["arenaId"].trim() : "";
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena inválida.");
  return {
    arenaId,
    tiers: {
      student: parseTierInput(data["student"], "student"),
      professor: parseTierInput(data["professor"], "professor"),
    },
  };
}

export async function setArenaAthletePricingCore(
  db: Firestore,
  uid: string,
  input: SetAthletePricingInput,
): Promise<{config: AthletePricingConfig}> {
  await assertArenaAreaAccess(db, input.arenaId, uid, "promocoes", "write");
  // `update` troca o mapa inteiro: o que o portal manda é o estado completo dos dois perfis.
  await db.collection("arenas").doc(input.arenaId).update({
    athletePricing: {
      ...input.tiers,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    },
  });
  return {config: input.tiers};
}

export const setArenaAthletePricing = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return setArenaAthletePricingCore(getFirestore(), uid, parseSetAthletePricingInput(request.data));
});

export interface SetAthletePricingMemberInput {
  arenaId: string;
  athleteId: string;
  /** `null` = tirar o atleta da lista (volta ao preço avulso). */
  tier: AthletePricingTier | null;
  note: string | null;
}

/** Valida o payload do portal. Puro. */
export function parseSetAthletePricingMemberInput(raw: unknown): SetAthletePricingMemberInput {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const arenaId = typeof data["arenaId"] === "string" ? data["arenaId"].trim() : "";
  const athleteId = typeof data["athleteId"] === "string" ? data["athleteId"].trim() : "";
  if (!arenaId || !athleteId || athleteId.includes("/")) {
    throw new HttpsError("invalid-argument", "Atleta inválido.");
  }
  const tierRaw = data["tier"];
  if (tierRaw != null && !isAthletePricingTier(tierRaw)) {
    throw new HttpsError("invalid-argument", "Perfil inválido.");
  }
  const note = typeof data["note"] === "string" && data["note"].trim() ?
    data["note"].trim().slice(0, MAX_NOTE) :
    null;
  return {arenaId, athleteId, tier: tierRaw ?? null, note};
}

function athleteDisplay(user: DocumentData): {name: string; photoUrl: string | null} {
  const name = String(user["fullName"] ?? user["name"] ?? user["nickname"] ?? "").trim();
  const rawPhoto = user["profilePhotoUrl"] ?? user["avatarUrl"] ?? user["photoURL"];
  return {
    name: (name || "Atleta").slice(0, 80),
    photoUrl: typeof rawPhoto === "string" && rawPhoto.trim() ? rawPhoto.trim() : null,
  };
}

export async function setArenaAthletePricingMemberCore(
  db: Firestore,
  uid: string,
  input: SetAthletePricingMemberInput,
): Promise<{tier: AthletePricingTier | null}> {
  await assertArenaAreaAccess(db, input.arenaId, uid, "promocoes", "write");
  const ref = db.collection(ARENA_ATHLETE_PRICING_MEMBERS)
    .doc(athletePricingMemberId(input.arenaId, input.athleteId));
  if (input.tier == null) {
    await ref.delete();
    return {tier: null};
  }
  const userSnap = await db.collection("users").doc(input.athleteId).get();
  if (!userSnap.exists) throw new HttpsError("not-found", "Atleta não encontrado.");
  const display = athleteDisplay(userSnap.data() ?? {});
  const existing = await ref.get();
  await ref.set({
    arenaId: input.arenaId,
    athleteId: input.athleteId,
    tier: input.tier,
    athleteName: display.name,
    athletePhotoUrl: display.photoUrl,
    note: input.note,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
    ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp(), createdBy: uid}),
  }, {merge: true});
  return {tier: input.tier};
}

export const setArenaAthletePricingMember = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return setArenaAthletePricingMemberCore(getFirestore(), uid, parseSetAthletePricingMemberInput(request.data));
});
