/**
 * Loja: pontos de retirada nas arenas e regras de frete (tela "Retirada & frete").
 *
 *   storePickupPoints/{arenaId}  — um ponto por arena; o id é o da arena.
 *   storeConfig/shipping         — regras + modalidades de entrega em casa.
 *
 * As rules negam escrita de cliente: estas callables são a única porta.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {assertCatalogAdmin, type Actor} from "./store-catalog-write";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const PICKUP_POINTS = "storePickupPoints";
export const STORE_CONFIG = "storeConfig";
export const SHIPPING_CONFIG_ID = "shipping";

export type ShippingModeId = "padrao" | "expressa" | "motoboy";

export interface ShippingMode {
  id: ShippingModeId;
  name: string;
  description: string;
  /** `calculado` = cotação do Melhor Envio; `fixo` = `priceCents`. */
  priceType: "calculado" | "fixo";
  priceCents: number | null;
  active: boolean;
}

export interface ShippingRules {
  freeShippingAboveCents: number;
  pickupDeadlineDays: number;
  originZip: string;
  handlingHours: number;
  cancelExpiredPickup: boolean;
  refundAsWalletCredit: boolean;
}

export interface ShippingConfig extends ShippingRules {
  /** Comissão da arena por pedido retirado; o ponto com `commissionPct: null` herda esta. */
  defaultCommissionPct: number;
  /** Fica `false` até a integração existir: a modalidade calculada não vai ao checkout. */
  melhorEnvioConnected: boolean;
  modes: ShippingMode[];
}

/** O que vale enquanto `storeConfig/shipping` não existir. O backoffice espelha isto. */
export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  freeShippingAboveCents: 39900,
  pickupDeadlineDays: 5,
  originZip: "74215-010",
  handlingHours: 24,
  cancelExpiredPickup: true,
  refundAsWalletCredit: true,
  defaultCommissionPct: 4,
  melhorEnvioConnected: false,
  modes: [
    {
      id: "padrao", name: "Padrão", description: "Correios PAC / Jadlog · 3–5 dias úteis",
      priceType: "calculado", priceCents: null, active: true,
    },
    {
      id: "expressa", name: "Expressa", description: "Loggi · Goiânia e região em 24 h",
      priceType: "fixo", priceCents: 3490, active: true,
    },
    {
      id: "motoboy", name: "Motoboy", description: "Mesma cidade · até 3 h",
      priceType: "fixo", priceCents: 1490, active: false,
    },
  ],
};

export interface SavePickupPointInput {
  arenaId: string;
  counter: string;
  hours: string;
  managerName: string;
  restockHours: 24 | 48;
  /** `null` herda `defaultCommissionPct`. */
  commissionPct: number | null;
  active: boolean;
}

const ZIP_RE = /^\d{5}-\d{3}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_TEXT = 80;

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [...new Set(fields)].sort()});
}

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function shortText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length <= MAX_TEXT;
}

function isPct(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

export function pickupPointErrors(input: SavePickupPointInput): string[] {
  const fields: string[] = [];
  if (typeof input.arenaId !== "string" || !ID_RE.test(input.arenaId)) fields.push("arenaId");
  if (!shortText(input.counter)) fields.push("counter");
  if (!shortText(input.hours)) fields.push("hours");
  if (!shortText(input.managerName)) fields.push("managerName");
  if (input.restockHours !== 24 && input.restockHours !== 48) fields.push("restockHours");
  if (input.commissionPct !== null && !isPct(input.commissionPct)) fields.push("commissionPct");
  if (typeof input.active !== "boolean") fields.push("active");
  return fields;
}

export function shippingRulesErrors(rules: ShippingRules): string[] {
  const fields: string[] = [];
  if (!isCount(rules.freeShippingAboveCents)) fields.push("freeShippingAboveCents");
  if (!isCount(rules.pickupDeadlineDays) || rules.pickupDeadlineDays < 1 || rules.pickupDeadlineDays > 60) {
    fields.push("pickupDeadlineDays");
  }
  if (typeof rules.originZip !== "string" || !ZIP_RE.test(rules.originZip)) fields.push("originZip");
  if (!isCount(rules.handlingHours) || rules.handlingHours > 240) fields.push("handlingHours");
  if (typeof rules.cancelExpiredPickup !== "boolean") fields.push("cancelExpiredPickup");
  if (typeof rules.refundAsWalletCredit !== "boolean") fields.push("refundAsWalletCredit");
  return fields;
}

/** Doc de config com o que faltar completado pelo padrão — o doc pode vir de versão anterior. */
export function withShippingDefaults(data: Record<string, unknown> | undefined): ShippingConfig {
  const saved = (data ?? {}) as Partial<ShippingConfig>;
  const savedModes = Array.isArray(saved.modes) ? saved.modes : [];
  return {
    ...DEFAULT_SHIPPING_CONFIG,
    ...saved,
    modes: DEFAULT_SHIPPING_CONFIG.modes.map((mode) => ({
      ...mode,
      ...(savedModes.find((m) => m?.id === mode.id) ?? {}),
    })),
  };
}

/**
 * Cria ou atualiza o ponto da arena. Nome e endereço são copiados da arena a cada
 * gravação — o checkout lê só o ponto, sem ir à arena.
 */
export async function savePickupPointCore(
  db: Firestore,
  input: SavePickupPointInput,
  actor: Actor,
  now: Date,
): Promise<{arenaId: string}> {
  const errors = pickupPointErrors(input);
  if (errors.length > 0) throw invalidFields(errors);

  const arena = await db.collection("arenas").doc(input.arenaId).get();
  if (!arena.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const data = arena.data()!;
  // Pré-cadastro não tem quem receba a mercadoria.
  if (data["unclaimed"] === true) {
    throw new HttpsError("failed-precondition", "Arena pré-cadastrada não pode ser ponto de retirada.");
  }

  // O local de estoque da arena, se já existir: é onde a retirada reserva saldo.
  const locations = await db.collection("storeLocations").where("arenaId", "==", input.arenaId).limit(1).get();

  const ref = db.collection(PICKUP_POINTS).doc(input.arenaId);
  const existing = await ref.get();
  await ref.set(
    {
      arenaId: input.arenaId,
      name: typeof data["name"] === "string" ? data["name"] : input.arenaId,
      address: typeof data["address"] === "string" ? data["address"] : "",
      city: typeof data["city"] === "string" ? data["city"] : "",
      state: typeof data["state"] === "string" ? data["state"] : "",
      counter: input.counter.trim(),
      hours: input.hours.trim(),
      managerName: input.managerName.trim(),
      restockHours: input.restockHours,
      commissionPct: input.commissionPct,
      active: input.active,
      locationId: locations.docs[0]?.id ?? null,
      ...(existing.exists ? {} : {createdAt: now}),
      updatedAt: now,
      updatedBy: actor,
    },
    {merge: true},
  );
  return {arenaId: input.arenaId};
}

/** O toggle da tabela: só liga/desliga um ponto que já existe. */
export async function setPickupPointActiveCore(
  db: Firestore,
  input: {arenaId: string; active: boolean},
  actor: Actor,
  now: Date,
): Promise<{arenaId: string; active: boolean}> {
  if (typeof input?.arenaId !== "string" || !ID_RE.test(input.arenaId) || typeof input.active !== "boolean") {
    throw invalidFields(["arenaId", "active"]);
  }
  const ref = db.collection(PICKUP_POINTS).doc(input.arenaId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Configure o ponto de retirada antes de ativá-lo.");
  }
  await ref.set({active: input.active, updatedAt: now, updatedBy: actor}, {merge: true});
  return {arenaId: input.arenaId, active: input.active};
}

export async function saveShippingRulesCore(
  db: Firestore,
  rules: ShippingRules,
  actor: Actor,
  now: Date,
): Promise<ShippingConfig> {
  const errors = shippingRulesErrors(rules ?? ({} as ShippingRules));
  if (errors.length > 0) throw invalidFields(errors);
  const ref = db.collection(STORE_CONFIG).doc(SHIPPING_CONFIG_ID);
  const current = withShippingDefaults((await ref.get()).data());
  const next: ShippingConfig = {
    ...current,
    freeShippingAboveCents: rules.freeShippingAboveCents,
    pickupDeadlineDays: rules.pickupDeadlineDays,
    originZip: rules.originZip,
    handlingHours: rules.handlingHours,
    cancelExpiredPickup: rules.cancelExpiredPickup,
    refundAsWalletCredit: rules.refundAsWalletCredit,
  };
  await ref.set({...next, updatedAt: now, updatedBy: actor});
  return next;
}

export async function setShippingModeActiveCore(
  db: Firestore,
  input: {modeId: ShippingModeId; active: boolean},
  actor: Actor,
  now: Date,
): Promise<ShippingConfig> {
  const known = DEFAULT_SHIPPING_CONFIG.modes.some((m) => m.id === input?.modeId);
  if (!known || typeof input.active !== "boolean") throw invalidFields(["modeId", "active"]);
  const ref = db.collection(STORE_CONFIG).doc(SHIPPING_CONFIG_ID);
  const current = withShippingDefaults((await ref.get()).data());
  const mode = current.modes.find((m) => m.id === input.modeId)!;
  if (input.active && mode.priceType === "calculado" && !current.melhorEnvioConnected) {
    throw new HttpsError("failed-precondition", "Conecte o Melhor Envio para ativar o frete calculado.");
  }
  const next: ShippingConfig = {
    ...current,
    modes: current.modes.map((m) => (m.id === input.modeId ? {...m, active: input.active} : m)),
  };
  await ref.set({...next, updatedAt: now, updatedBy: actor});
  return next;
}

async function actorOf(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return assertCatalogAdmin(uid);
}

export const saveStorePickupPoint = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return savePickupPointCore(getFirestore(), (request.data ?? {}) as SavePickupPointInput, actor, new Date());
});

export const setStorePickupPointActive = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const input = (request.data ?? {}) as {arenaId: string; active: boolean};
  return setPickupPointActiveCore(getFirestore(), input, actor, new Date());
});

export const saveStoreShippingRules = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  return saveShippingRulesCore(getFirestore(), (request.data ?? {}) as ShippingRules, actor, new Date());
});

export const setStoreShippingModeActive = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth?.uid);
  const input = (request.data ?? {}) as {modeId: ShippingModeId; active: boolean};
  return setShippingModeActiveCore(getFirestore(), input, actor, new Date());
});
