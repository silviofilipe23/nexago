/**
 * Taxas da arena (backoffice › Arenas › Taxas): o % que a NexaGO fica sobre o que a arena recebe
 * online, com padrão editável e exceção por arena, por produto.
 *
 *   appConfig/arenaFees    — padrão da plataforma `{tierPercent: {starter, pro, elite, none}, clubPercent, version, …}`
 *   arenaFees/{arenaId}    — exceção da arena `{mode, products: {booking?, schedulePlan?, class?, crm?, club?}, reason, until, version, …}`
 *   arenaFeesLog/{auto}    — linha do tempo (Histórico da tela)
 *
 * Cascata (`resolveArenaFeePercent`), da mais específica para a geral:
 *   1. exceção da arena vigente para aquele produto (`until` vazio ou ainda não passou, data civil
 *      de SP, sem varredura); produto fora do mapa segue o padrão;
 *   2. padrão da plataforma: clubinho tem % próprio; os demais seguem a tabela por plano titular
 *      (sem plano = `none`). Doc ausente = 8/6/5%, 8% sem plano e 5% no clubinho — o de antes.
 *
 * O piso por transação não muda aqui: R$ 1,50 (`FEE_FLOOR_REAIS`) e nenhum no clubinho. Taxa 0%
 * isenta de vez (`computePlatformFeeReais` devolve 0 sem aplicar o piso). Quem lê é a cobrança na
 * hora do pagamento: mudar a taxa só vale para pagamentos confirmados depois.
 *
 * As rules negam escrita de cliente: estas callables são a porta. Espelhado à mão em
 * `frontend/projects/backoffice/src/app/painel/arenas/taxas/data/arena-fees.ts`: mudou aqui, muda lá.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {arenaEntitledTier} from "./arena-entitlement";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  BOOKING_FEE_PERCENT_BY_TIER,
  BOOKING_FEE_PERCENT_NO_PLAN,
  CLUB_FEE_PERCENT,
  isValidCommissionPercent,
} from "./platform-fees";
import {saoPauloDate} from "./store-checkout-price";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const ARENA_FEES_CONFIG_PATH = "appConfig/arenaFees";
export const ARENA_FEES = "arenaFees";
export const ARENA_FEES_LOG = "arenaFeesLog";

/**
 * O que a arena recebe pela plataforma: reserva avulsa (e cota de amigo), plano de horário,
 * mensalidade de aula, cobrança do CRM (mensalista, pacote) e vaga de clubinho.
 */
export const ARENA_FEE_PRODUCTS = ["booking", "schedulePlan", "class", "crm", "club"] as const;
export type ArenaFeeProduct = typeof ARENA_FEE_PRODUCTS[number];

export const ARENA_FEE_PRODUCT_LABEL: Record<ArenaFeeProduct, string> = {
  booking: "Reservas",
  schedulePlan: "Planos de horário",
  class: "Aulas",
  crm: "Cobranças do CRM",
  club: "Clubinho",
};

export const ARENA_FEE_TIERS = ["starter", "pro", "elite", "none"] as const;
export type ArenaFeeTier = typeof ARENA_FEE_TIERS[number];

const TIER_LABEL: Record<ArenaFeeTier, string> = {starter: "Starter", pro: "Pro", elite: "Elite", none: "Sem plano"};

export const ARENA_FEE_REASONS = [
  "Parceria comercial",
  "Campanha de lançamento",
  "Arena piloto",
  "Correção de cadastro",
] as const;

export interface ArenaFeeDefaults {
  /** % dos produtos que não são clubinho, pelo plano titular da arena. */
  tierPercent: Record<ArenaFeeTier, number>;
  clubPercent: number;
}

export interface ArenaFeeOverride {
  /** % por produto; produto ausente segue o padrão. Nunca vazio. */
  products: Partial<Record<ArenaFeeProduct, number>>;
  reason: string;
  /** Último dia em que vale (data civil de SP, `YYYY-MM-DD`); `null` = sem data de fim. */
  until: string | null;
}

export type ArenaFeeSource = "arena" | "default";

export const DEFAULT_ARENA_FEE_DEFAULTS: ArenaFeeDefaults = {
  tierPercent: {...BOOKING_FEE_PERCENT_BY_TIER, none: BOOKING_FEE_PERCENT_NO_PLAN},
  clubPercent: CLUB_FEE_PERCENT,
};

type Raw = Record<string, unknown>;

interface Actor {
  uid: string;
  name: string;
}

function isObj(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 0 a 20% (o mesmo teto da comissão de torneio), até duas casas: 5,5% vale; 5,555% não. */
export function isValidArenaFeePercent(v: unknown): v is number {
  return isValidCommissionPercent(v) && Math.abs(Math.round(v * 100) - v * 100) < 1e-6;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Data civil real (`2026-02-30` não passa). */
function isCivilDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isProduct(v: unknown): v is ArenaFeeProduct {
  return (ARENA_FEE_PRODUCTS as readonly unknown[]).includes(v);
}

// ── leitura ─────────────────────────────────────────────────────────────────

/** Padrão gravado; campo ausente ou fora da faixa cai no padrão de código (nunca derruba a cobrança). */
export function arenaFeeDefaultsFromRaw(raw: unknown): ArenaFeeDefaults {
  const data = isObj(raw) ? raw : {};
  const tiers = isObj(data["tierPercent"]) ? data["tierPercent"] : {};
  const tierPercent = {} as Record<ArenaFeeTier, number>;
  for (const t of ARENA_FEE_TIERS) {
    tierPercent[t] = isValidArenaFeePercent(tiers[t]) ? tiers[t] : DEFAULT_ARENA_FEE_DEFAULTS.tierPercent[t];
  }
  const club = data["clubPercent"];
  return {tierPercent, clubPercent: isValidArenaFeePercent(club) ? club : DEFAULT_ARENA_FEE_DEFAULTS.clubPercent};
}

/** Só os produtos válidos; `{}` se nenhum. */
function productsFromRaw(raw: unknown): Partial<Record<ArenaFeeProduct, number>> {
  const out: Partial<Record<ArenaFeeProduct, number>> = {};
  if (!isObj(raw)) return out;
  for (const p of ARENA_FEE_PRODUCTS) {
    if (isValidArenaFeePercent(raw[p])) out[p] = raw[p];
  }
  return out;
}

/** `null` = sem exceção (doc ausente, modo padrão, sem produto válido ou dado corrompido). */
export function arenaFeeOverrideFromRaw(raw: unknown): ArenaFeeOverride | null {
  if (!isObj(raw) || raw["mode"] !== "custom") return null;
  const products = productsFromRaw(raw["products"]);
  if (Object.keys(products).length === 0) return null;
  return {
    products,
    reason: typeof raw["reason"] === "string" ? raw["reason"] : "",
    until: isCivilDate(raw["until"]) ? raw["until"] : null,
  };
}

export function isArenaFeeOverrideActive(override: ArenaFeeOverride, today: string): boolean {
  return override.until === null || today <= override.until;
}

/** Linha da tabela por plano que vale para a arena agora (titularidade, não só o `planTier` gravado). */
export function arenaFeeTierOf(arena: Raw, nowMs: number): ArenaFeeTier {
  return arenaEntitledTier(arena, nowMs) ?? "none";
}

export function resolveArenaFeePercent(input: {
  arena: Raw;
  product: ArenaFeeProduct;
  defaults: ArenaFeeDefaults;
  override: ArenaFeeOverride | null;
  now: Date;
}): {percent: number; source: ArenaFeeSource} {
  const {arena, product, defaults, override, now} = input;
  const fromArena = override && isArenaFeeOverrideActive(override, saoPauloDate(now)) ?
    override.products[product] :
    undefined;
  if (fromArena !== undefined) return {percent: fromArena, source: "arena"};
  if (product === "club") return {percent: defaults.clubPercent, source: "default"};
  return {percent: defaults.tierPercent[arenaFeeTierOf(arena, now.getTime())], source: "default"};
}

export async function loadArenaFeeDefaults(db: Firestore): Promise<ArenaFeeDefaults> {
  return arenaFeeDefaultsFromRaw((await db.doc(ARENA_FEES_CONFIG_PATH).get()).data());
}

/**
 * O % que vale agora para um pagamento deste produto na arena. `arena` é o doc já lido pela
 * cobrança (só para o plano titular); padrão e exceção são lidos aqui, fora de transação — são
 * config, não estado do pagamento.
 */
export async function loadArenaFeePercent(
  db: Firestore,
  arenaId: string,
  arena: Raw | undefined,
  product: ArenaFeeProduct,
  now: Date = new Date(),
): Promise<number> {
  const [defaults, override] = await Promise.all([
    loadArenaFeeDefaults(db),
    arenaId ? db.collection(ARENA_FEES).doc(arenaId).get() : null,
  ]);
  return resolveArenaFeePercent({
    arena: arena ?? {},
    product,
    defaults,
    override: arenaFeeOverrideFromRaw(override?.data()),
    now,
  }).percent;
}

// ── validação e diff ────────────────────────────────────────────────────────

export interface SaveArenaFeeDefaultInput extends ArenaFeeDefaults {
  /** A `version` lida pela tela; doc ausente = 1. */
  version: number;
}

export interface SaveArenaFeeInput {
  arenaId: string;
  mode: "padrao" | "custom";
  products?: Partial<Record<ArenaFeeProduct, number>>;
  reason?: string;
  until?: string | null;
  /** A `version` lida pela tela; doc ausente = 0. */
  version: number;
}

export function arenaFeeDefaultErrors(input: unknown): string[] {
  if (!isObj(input)) return ["tierPercent", "clubPercent"];
  const errors: string[] = [];
  const tiers = isObj(input["tierPercent"]) ? input["tierPercent"] : null;
  for (const t of ARENA_FEE_TIERS) {
    if (!tiers || !isValidArenaFeePercent(tiers[t])) errors.push(`tierPercent.${t}`);
  }
  if (!isValidArenaFeePercent(input["clubPercent"])) errors.push("clubPercent");
  return errors;
}

export function arenaFeeErrors(input: unknown, today: string): string[] {
  if (!isObj(input)) return ["mode"];
  const errors: string[] = [];
  if (typeof input["arenaId"] !== "string" || !input["arenaId"].trim()) errors.push("arenaId");
  const mode = input["mode"];
  if (mode !== "padrao" && mode !== "custom") return [...errors, "mode"];
  if (mode === "padrao") return errors;
  const products = input["products"];
  if (!isObj(products)) {
    errors.push("products");
  } else {
    const keys = Object.keys(products);
    if (keys.length === 0) errors.push("products");
    for (const k of keys) {
      if (!isProduct(k) || !isValidArenaFeePercent(products[k])) errors.push(`products.${k}`);
    }
  }
  if (!(ARENA_FEE_REASONS as readonly unknown[]).includes(input["reason"])) errors.push("reason");
  const until = input["until"];
  if (until != null && until !== "" && (!isCivilDate(until) || until < today)) errors.push("until");
  return errors;
}

/** "8%", "5,5%". */
export function percentLabel(percent: number): string {
  return `${String(percent).replace(".", ",")}%`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function arenaFeeDefaultChanges(prev: ArenaFeeDefaults, next: ArenaFeeDefaults): string[] {
  const out: string[] = [];
  for (const t of ARENA_FEE_TIERS) {
    if (prev.tierPercent[t] !== next.tierPercent[t]) {
      out.push(`${TIER_LABEL[t]}: ${percentLabel(prev.tierPercent[t])} → ${percentLabel(next.tierPercent[t])}`);
    }
  }
  if (prev.clubPercent !== next.clubPercent) {
    out.push(`Clubinho: ${percentLabel(prev.clubPercent)} → ${percentLabel(next.clubPercent)}`);
  }
  return out;
}

function productLabel(o: ArenaFeeOverride | null, p: ArenaFeeProduct): string {
  const v = o?.products[p];
  return v === undefined ? "padrão" : percentLabel(v);
}

export function arenaFeeChanges(prev: ArenaFeeOverride | null, next: ArenaFeeOverride | null): string[] {
  const out: string[] = [];
  for (const p of ARENA_FEE_PRODUCTS) {
    const a = productLabel(prev, p);
    const b = productLabel(next, p);
    if (a !== b) out.push(`${ARENA_FEE_PRODUCT_LABEL[p]}: ${a} → ${b}`);
  }
  if (next && (prev?.until ?? null) !== next.until) {
    out.push(next.until ? `válida até ${dayLabel(next.until)}` : "sem data de fim");
  }
  if (next && prev && prev.reason !== next.reason) out.push(`motivo: ${next.reason}`);
  return out;
}

function overrideOf(input: SaveArenaFeeInput): ArenaFeeOverride | null {
  if (input.mode === "padrao") return null;
  return {
    products: productsFromRaw(input.products),
    reason: input.reason ?? "",
    until: typeof input.until === "string" && input.until ? input.until : null,
  };
}

// ── gravação ────────────────────────────────────────────────────────────────

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields});
}

function versionOf(data: Raw | undefined, absent: number): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : absent;
}

function conflict(what: string, version: number, data: Raw | undefined): HttpsError {
  return new HttpsError(
    "failed-precondition",
    `${what} foi alterada por outra pessoa. Recarregue antes de salvar.`,
    {updatedBy: data?.["updatedBy"] ?? null, version},
  );
}

function noChanges(): HttpsError {
  return new HttpsError("invalid-argument", "Nenhuma alteração para salvar.", {fields: []});
}

export async function saveArenaFeeDefaultCore(
  db: Firestore,
  input: SaveArenaFeeDefaultInput,
  actor: Actor,
  now: Date,
): Promise<ArenaFeeDefaults & {version: number; changes: string[]}> {
  const errors = arenaFeeDefaultErrors(input);
  if (!Number.isInteger(input?.version) || input.version < 1) errors.push("version");
  if (errors.length > 0) throw invalidFields(errors);
  const next = arenaFeeDefaultsFromRaw(input);
  const ref = db.doc(ARENA_FEES_CONFIG_PATH);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : undefined;
    const version = versionOf(data, 1);
    if (version !== input.version) throw conflict("A taxa padrão das arenas", version, data);
    const changes = arenaFeeDefaultChanges(arenaFeeDefaultsFromRaw(data), next);
    if (changes.length === 0) throw noChanges();
    const nextVersion = version + 1;
    tx.set(ref, {...next, version: nextVersion, updatedAt: now, updatedBy: actor});
    tx.set(db.collection(ARENA_FEES_LOG).doc(), {
      scope: "default", arenaId: null, arenaName: null, version: nextVersion, changes, reason: null,
      createdAt: now, createdBy: actor,
    });
    return {...next, version: nextVersion, changes};
  });
}

export async function saveArenaFeeCore(
  db: Firestore,
  input: SaveArenaFeeInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; override: ArenaFeeOverride | null; changes: string[]}> {
  const errors = arenaFeeErrors(input, saoPauloDate(now));
  if (!Number.isInteger(input?.version) || input.version < 0) errors.push("version");
  if (errors.length > 0) throw invalidFields(errors);

  const arenaId = input.arenaId.trim();
  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const arenaName = typeof arenaSnap.data()?.["name"] === "string" ? arenaSnap.data()!["name"] : `Arena ${arenaId}`;
  const next = overrideOf(input);

  const ref = db.collection(ARENA_FEES).doc(arenaId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : undefined;
    const version = versionOf(data, 0);
    if (version !== input.version) throw conflict("A taxa desta arena", version, data);
    const changes = arenaFeeChanges(arenaFeeOverrideFromRaw(data), next);
    if (changes.length === 0) throw noChanges();
    const nextVersion = version + 1;
    tx.set(ref, {
      mode: next ? "custom" : "padrao",
      products: next?.products ?? null,
      reason: next?.reason ?? null,
      until: next?.until ?? null,
      arenaName,
      version: nextVersion,
      updatedAt: now,
      updatedBy: actor,
    });
    tx.set(db.collection(ARENA_FEES_LOG).doc(), {
      scope: "arena", arenaId, arenaName, version: nextVersion, changes, reason: next?.reason ?? null,
      createdAt: now, createdBy: actor,
    });
    return {version: nextVersion, override: next, changes};
  });
}

async function actorOf(auth: {uid?: string} | undefined): Promise<Actor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  let caller;
  try {
    caller = await getAuth().getUser(auth.uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar as taxas.");
  }
  return {uid: auth.uid, name: caller.displayName ?? caller.email ?? auth.uid};
}

export const saveArenaFeeDefault = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveArenaFeeDefaultCore(getFirestore(), (request.data ?? {}) as SaveArenaFeeDefaultInput, actor, new Date());
});

export const saveArenaFee = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveArenaFeeCore(getFirestore(), (request.data ?? {}) as SaveArenaFeeInput, actor, new Date());
});
