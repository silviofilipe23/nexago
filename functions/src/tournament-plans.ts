/**
 * Planos de torneio v2 (backoffice › Torneios › Planos e Sponsors): pacotes de organização
 * vendidos por evento (quadras, arbitragem, transmissão narrada) e cotas de patrocínio nas
 * transmissões.
 *
 *   tournamentPlans/{planId}                 — `{current, next, version, draft, order, …}`
 *   tournamentPlans/{planId}/versions/{n}    — retrato de cada versão publicada
 *   tournamentPlansConfig/rules              — custo fixo, custo por quadra e margem mínima
 *   tournamentPlansConfig/sponsors           — cotas Bronze/Prata/Ouro, inventário e repasse
 *   tournamentPlansConfig/{doc}/versions/{n} — retrato das versões das duas configs
 *   tournamentPlansLog/{auto}                — linha do tempo (Histórico das telas)
 *
 * Doc ausente = versão 1 com o padrão (`DEFAULT_PLANS`, `DEFAULT_RULES`, `DEFAULT_SPONSORS`).
 * A primeira gravação retrata esse padrão como `versions/1`, para o histórico começar nele.
 *
 * Publicar cria a versão N+1. Agendada (`effectiveFrom`, data civil de SP) fica em `next` e
 * passa a valer no dia, sem varredura: quem lê resolve com `effectivePlan`. Contratação ainda
 * não existe; quando existir, o evento congela a versão vigente (preço e escopo originais).
 *
 * Comissão sobre inscrições NÃO mora aqui: é a taxa da plataforma (`platform-fees.ts`,
 * negociável por organizador). As rules negam escrita de cliente: estas callables são a porta.
 *
 * Espelhado à mão em `frontend/projects/backoffice/src/app/painel/torneios/planos/data/`
 * (padrão, limites e validação): mudou aqui, muda lá.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {saoPauloDate} from "./store-checkout-price";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const PLANS = "tournamentPlans";
export const PLANS_CONFIG = "tournamentPlansConfig";
export const PLANS_LOG = "tournamentPlansLog";
export const VERSIONS = "versions";

export const PLAN_STATUSES = ["ativo", "oculto", "rascunho"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const CANCEL_POLICIES = ["total", "parcial", "nenhum"] as const;
export type CancelPolicy = (typeof CANCEL_POLICIES)[number];

export const LIMITS = {
  nameMin: 2,
  nameMax: 40,
  descMax: 100,
  priceCents: 100_000_00,
  balanceDays: 60,
  courts: 8,
  refsPerCourt: 4,
  hoursMin: 2,
  hoursMax: 16,
  extraHourCents: 10_000_00,
  leadDays: 180,
  maxPerDay: 20,
  cities: 40,
  cityMax: 60,
  costCents: 100_000_00,
  minMarginPct: 90,
  tiers: 6,
  tierNameMax: 20,
  tierPriceCents: 10_000_00,
  appearances: 500,
  secondsMax: 60,
  mentions: 20,
  maxPerEvent: 50,
  perHour: 120,
  sharePct: 100,
} as const;

export interface TournamentPlan {
  name: string;
  description: string;
  status: PlanStatus;
  priceCents: number;
  depositPct: number;
  balanceDays: number;
  cancelPolicy: CancelPolicy;
  courts: number;
  refsPerCourt: number;
  live: boolean;
  narrator: boolean;
  hours: number;
  extraHourCents: number;
  leadDays: number;
  maxPerDay: number;
  cities: string[];
}

export interface PlanRules {
  fixedCostCents: number;
  courtCostCents: number;
  minMarginPct: number;
}

export interface SponsorTier {
  id: string;
  name: string;
  color: string;
  priceCents: number;
  appearances: number;
  seconds: number;
  mentions: number;
  maxPerEvent: number;
  onSale: boolean;
}

export interface SponsorsConfig {
  tiers: SponsorTier[];
  maxPerHour: number;
  hours: number;
  organizerSharePct: number;
  organizerCanSell: boolean;
  logoApproval: boolean;
  segmentExclusive: boolean;
}

export interface Actor {
  uid: string;
  name: string;
}

type Raw = Record<string, unknown>;

// ── padrão ──────────────────────────────────────────────────────────────────

const BASE_PLAN: Omit<TournamentPlan, "name" | "description" | "priceCents" | "courts"> = {
  status: "ativo",
  depositPct: 50,
  balanceDays: 7,
  cancelPolicy: "parcial",
  refsPerCourt: 2,
  live: true,
  narrator: true,
  hours: 10,
  extraHourCents: 0,
  leadDays: 21,
  maxPerDay: 3,
  cities: ["Goiânia", "Brasília"],
};

/** Os 4 pacotes da tabela do dono: 1 a 4 quadras, 2 árbitros por quadra. */
export const DEFAULT_PLANS: ReadonlyArray<{id: string; order: number; plan: TournamentPlan}> = [
  {id: "plano-1", order: 1, plan: {...BASE_PLAN, name: "Plano 1", priceCents: 1700_00, courts: 1,
    description: "Uma quadra com arbitragem e transmissão narrada."}},
  {id: "plano-2", order: 2, plan: {...BASE_PLAN, name: "Plano 2", priceCents: 2500_00, courts: 2,
    description: "Duas quadras com arbitragem completa e transmissão narrada da quadra principal."}},
  {id: "plano-3", order: 3, plan: {...BASE_PLAN, name: "Plano 3", priceCents: 3000_00, courts: 3,
    description: "Três quadras com arbitragem completa e transmissão narrada da quadra principal."}},
  {id: "plano-4", order: 4, plan: {...BASE_PLAN, name: "Plano 4", priceCents: 3500_00, courts: 4,
    description: "Quatro quadras com arbitragem completa e transmissão narrada da quadra principal."}},
];

export const DEFAULT_RULES: PlanRules = {fixedCostCents: 500_00, courtCostCents: 500_00, minMarginPct: 35};

export const DEFAULT_SPONSORS: SponsorsConfig = {
  tiers: [
    {id: "bronze", name: "Bronze", color: "#C98A5A", priceCents: 50_00, appearances: 10, seconds: 5, mentions: 0,
      maxPerEvent: 8, onSale: true},
    {id: "prata", name: "Prata", color: "#C9CDD4", priceCents: 100_00, appearances: 25, seconds: 5, mentions: 0,
      maxPerEvent: 4, onSale: true},
    {id: "ouro", name: "Ouro", color: "#F4C543", priceCents: 200_00, appearances: 50, seconds: 5, mentions: 2,
      maxPerEvent: 2, onSale: true},
  ],
  maxPerHour: 12,
  hours: 10,
  organizerSharePct: 20,
  organizerCanSell: true,
  logoApproval: true,
  segmentExclusive: false,
};

export function defaultPlanOf(id: string): {order: number; plan: TournamentPlan} | null {
  const d = DEFAULT_PLANS.find((p) => p.id === id);
  return d ? {order: d.order, plan: structuredClone(d.plan)} : null;
}

// ── validação ───────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function int(v: unknown, min: number, max: number): v is number {
  return num(v, min, max) && Number.isInteger(v);
}

function text(v: unknown, min: number, max: number): v is string {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const TIER_ID = /^[a-z0-9-]{2,24}$/;

/** Campos inválidos do plano, como nomes de campo, ordenados. */
export function planErrors(p: unknown): string[] {
  if (!isObj(p)) return ["plan"];
  const f: string[] = [];
  if (!text(p["name"], LIMITS.nameMin, LIMITS.nameMax)) f.push("name");
  if (!text(p["description"], 0, LIMITS.descMax)) f.push("description");
  if (!PLAN_STATUSES.includes(p["status"] as PlanStatus)) f.push("status");
  if (!int(p["priceCents"], 0, LIMITS.priceCents)) f.push("priceCents");
  if (!int(p["depositPct"], 0, 100)) f.push("depositPct");
  if (!int(p["balanceDays"], 0, LIMITS.balanceDays)) f.push("balanceDays");
  if (!CANCEL_POLICIES.includes(p["cancelPolicy"] as CancelPolicy)) f.push("cancelPolicy");
  if (!int(p["courts"], 1, LIMITS.courts)) f.push("courts");
  if (!int(p["refsPerCourt"], 0, LIMITS.refsPerCourt)) f.push("refsPerCourt");
  if (typeof p["live"] !== "boolean") f.push("live");
  if (typeof p["narrator"] !== "boolean") f.push("narrator");
  if (!int(p["hours"], LIMITS.hoursMin, LIMITS.hoursMax)) f.push("hours");
  if (!int(p["extraHourCents"], 0, LIMITS.extraHourCents)) f.push("extraHourCents");
  if (!int(p["leadDays"], 0, LIMITS.leadDays)) f.push("leadDays");
  if (!int(p["maxPerDay"], 1, LIMITS.maxPerDay)) f.push("maxPerDay");
  const cities = p["cities"];
  if (!Array.isArray(cities) || cities.length > LIMITS.cities ||
    !cities.every((c) => text(c, 2, LIMITS.cityMax))) {
    f.push("cities");
  }
  return f.sort();
}

export function rulesErrors(r: unknown): string[] {
  if (!isObj(r)) return ["rules"];
  const f: string[] = [];
  if (!int(r["fixedCostCents"], 0, LIMITS.costCents)) f.push("fixedCostCents");
  if (!int(r["courtCostCents"], 0, LIMITS.costCents)) f.push("courtCostCents");
  if (!int(r["minMarginPct"], 0, LIMITS.minMarginPct)) f.push("minMarginPct");
  return f;
}

export function sponsorsErrors(s: unknown): string[] {
  if (!isObj(s)) return ["sponsors"];
  const f: string[] = [];
  const tiers = s["tiers"];
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > LIMITS.tiers) {
    f.push("tiers");
  } else {
    const ids = new Set<string>();
    tiers.forEach((t, i) => {
      const at = (k: string) => `tiers.${i}.${k}`;
      if (!isObj(t)) {
        f.push(at("id"));
        return;
      }
      if (typeof t["id"] !== "string" || !TIER_ID.test(t["id"]) || ids.has(t["id"])) f.push(at("id"));
      else ids.add(t["id"]);
      if (!text(t["name"], 2, LIMITS.tierNameMax)) f.push(at("name"));
      if (typeof t["color"] !== "string" || !HEX.test(t["color"])) f.push(at("color"));
      if (!int(t["priceCents"], 0, LIMITS.tierPriceCents)) f.push(at("priceCents"));
      if (!int(t["appearances"], 0, LIMITS.appearances)) f.push(at("appearances"));
      if (!int(t["seconds"], 1, LIMITS.secondsMax)) f.push(at("seconds"));
      if (!int(t["mentions"], 0, LIMITS.mentions)) f.push(at("mentions"));
      if (!int(t["maxPerEvent"], 0, LIMITS.maxPerEvent)) f.push(at("maxPerEvent"));
      if (typeof t["onSale"] !== "boolean") f.push(at("onSale"));
    });
  }
  if (!int(s["maxPerHour"], 1, LIMITS.perHour)) f.push("maxPerHour");
  if (!int(s["hours"], LIMITS.hoursMin, LIMITS.hoursMax)) f.push("hours");
  if (!int(s["organizerSharePct"], 0, LIMITS.sharePct)) f.push("organizerSharePct");
  for (const k of ["organizerCanSell", "logoApproval", "segmentExclusive"]) {
    if (typeof s[k] !== "boolean") f.push(k);
  }
  return f;
}

// ── normalização e diferenças ───────────────────────────────────────────────

/** Só os campos conhecidos, aparados. Narrador sem transmissão não existe. */
export function normalizePlan(p: TournamentPlan): TournamentPlan {
  const cities: string[] = [];
  for (const c of p.cities) {
    const city = c.trim();
    if (!cities.some((x) => x.toLowerCase() === city.toLowerCase())) cities.push(city);
  }
  return {
    name: p.name.trim(),
    description: p.description.trim(),
    status: p.status,
    priceCents: p.priceCents,
    depositPct: p.depositPct,
    balanceDays: p.balanceDays,
    cancelPolicy: p.cancelPolicy,
    courts: p.courts,
    refsPerCourt: p.refsPerCourt,
    live: p.live,
    narrator: p.live && p.narrator,
    hours: p.hours,
    extraHourCents: p.extraHourCents,
    leadDays: p.leadDays,
    maxPerDay: p.maxPerDay,
    cities,
  };
}

export function normalizeRules(r: PlanRules): PlanRules {
  return {fixedCostCents: r.fixedCostCents, courtCostCents: r.courtCostCents, minMarginPct: r.minMarginPct};
}

export function normalizeSponsors(s: SponsorsConfig): SponsorsConfig {
  return {
    tiers: s.tiers.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      color: t.color.toUpperCase(),
      priceCents: t.priceCents,
      appearances: t.appearances,
      seconds: t.seconds,
      mentions: t.mentions,
      maxPerEvent: t.maxPerEvent,
      onSale: t.onSale,
    })),
    maxPerHour: s.maxPerHour,
    hours: s.hours,
    organizerSharePct: s.organizerSharePct,
    organizerCanSell: s.organizerCanSell,
    logoApproval: s.logoApproval,
    segmentExclusive: s.segmentExclusive,
  };
}

const PLAN_LABELS: Record<keyof TournamentPlan, string> = {
  name: "Nome",
  description: "Descrição",
  status: "Status",
  priceCents: "Preço por evento",
  depositPct: "Sinal",
  balanceDays: "Saldo até",
  cancelPolicy: "Cancelamento",
  courts: "Quadras",
  refsPerCourt: "Árbitros por quadra",
  live: "Transmissão",
  narrator: "Narrador",
  hours: "Cobertura",
  extraHourCents: "Hora extra",
  leadDays: "Antecedência mínima",
  maxPerDay: "Máx. eventos no dia",
  cities: "Cidades atendidas",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changedLabels<T extends object>(prev: T, next: T, labels: Partial<Record<keyof T, string>>): string[] {
  return (Object.keys(next) as Array<keyof T>)
    .filter((k) => !same(prev[k], next[k]))
    .map((k) => labels[k] ?? String(k));
}

export function planChanges(prev: TournamentPlan | null, next: TournamentPlan): string[] {
  return prev ? changedLabels(prev, next, PLAN_LABELS) : ["Plano criado"];
}

export function rulesChanges(prev: PlanRules, next: PlanRules): string[] {
  return changedLabels(prev, next, {
    fixedCostCents: "Custo fixo por evento",
    courtCostCents: "Custo por quadra",
    minMarginPct: "Margem mínima",
  });
}

export function sponsorsChanges(prev: SponsorsConfig, next: SponsorsConfig): string[] {
  const out: string[] = [];
  for (const t of next.tiers) {
    const old = prev.tiers.find((x) => x.id === t.id);
    if (!old) out.push(`Cota ${t.name} criada`);
    else if (!same(old, t)) out.push(`Cota ${t.name}`);
  }
  for (const t of prev.tiers) {
    if (!next.tiers.some((x) => x.id === t.id)) out.push(`Cota ${t.name} removida`);
  }
  if (!same(prev.tiers.map((t) => t.id), next.tiers.map((t) => t.id)) && out.length === 0) out.push("Ordem das cotas");
  out.push(...changedLabels({...prev, tiers: null}, {...next, tiers: null}, {
    maxPerHour: "Aparições por hora",
    hours: "Horas de transmissão",
    organizerSharePct: "Repasse ao organizador",
    organizerCanSell: "Organizador vende cotas",
    logoApproval: "Aprovação da logo",
    segmentExclusive: "Exclusividade por segmento",
  }));
  return out;
}

// ── leitura do plano vigente ────────────────────────────────────────────────

export interface ScheduledPlan {
  plan: TournamentPlan;
  version: number;
  /** `YYYY-MM-DD` em São Paulo. */
  effectiveFrom: string;
}

/** O plano que vale hoje: o agendado passa a valer no dia, sem varredura. */
export function effectivePlan(
  current: TournamentPlan | null,
  next: ScheduledPlan | null,
  today: string,
): TournamentPlan | null {
  return next && next.effectiveFrom <= today ? next.plan : current;
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
    `${what} foi alterado por outra pessoa. Recarregue antes de salvar.`,
    {updatedBy: data?.["updatedBy"] ?? null, version},
  );
}

function scheduledOf(v: unknown): ScheduledPlan | null {
  if (!isObj(v) || !isObj(v["plan"]) || typeof v["effectiveFrom"] !== "string") return null;
  return {plan: v["plan"] as unknown as TournamentPlan, version: Number(v["version"]), effectiveFrom: v["effectiveFrom"]};
}

export type PlanAction = "draft" | "publish" | "discardDraft";

export interface SaveTournamentPlanInput {
  /** `null` = plano novo (o servidor cria o id). */
  planId: string | null;
  action: PlanAction;
  plan?: TournamentPlan;
  /** A `version` lida pela tela: 0 = nunca publicado; padrão sem doc = 1. */
  version: number;
  /** Publicar agendado: data civil de SP, depois de hoje. `null` = agora. */
  effectiveFrom?: string | null;
}

export interface SaveTournamentPlanResult {
  planId: string;
  version: number;
  current: TournamentPlan | null;
  next: ScheduledPlan | null;
  draft: TournamentPlan | null;
  changes: string[];
}

export async function saveTournamentPlanCore(
  db: Firestore,
  input: SaveTournamentPlanInput,
  actor: Actor,
  now: Date,
): Promise<SaveTournamentPlanResult> {
  if (!isObj(input)) throw invalidFields(["plan"]);
  const action = input.action;
  if (action !== "draft" && action !== "publish" && action !== "discardDraft") throw invalidFields(["action"]);
  const errors: string[] = [];
  if (action !== "discardDraft") errors.push(...planErrors(input.plan));
  if (!int(input.version, 0, Number.MAX_SAFE_INTEGER)) errors.push("version");
  const planId = input.planId ?? null;
  if (planId !== null && (typeof planId !== "string" || !/^[A-Za-z0-9_-]{2,40}$/.test(planId))) errors.push("planId");
  const today = saoPauloDate(now);
  const effectiveFrom = action === "publish" ? input.effectiveFrom ?? null : null;
  if (effectiveFrom !== null && (typeof effectiveFrom !== "string" || !ISO_DAY.test(effectiveFrom) ||
    effectiveFrom <= today)) {
    errors.push("effectiveFrom");
  }
  if (errors.length > 0) throw invalidFields(errors);
  if (planId === null && action === "discardDraft") throw invalidFields(["planId"]);

  const plan = action === "discardDraft" ? null : normalizePlan(input.plan as TournamentPlan);
  const col = db.collection(PLANS);
  const ref = planId === null ? col.doc() : col.doc(planId);
  const fallback = planId === null ? null : defaultPlanOf(planId);

  // Ordem do plano novo: depois do último (lido fora da transação; empate é inofensivo).
  let newOrder = 0;
  if (planId === null) {
    const all = await col.get();
    const orders = all.docs.map((d) => Number(d.data()["order"]) || 0);
    newOrder = Math.max(DEFAULT_PLANS.length, ...orders) + 1;
  }

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : undefined;
    const version = versionOf(data, fallback ? 1 : 0);
    if (version !== input.version) throw conflict("O plano", version, data);

    let current: TournamentPlan | null = data ? (data["current"] as TournamentPlan | null) ?? null :
      fallback?.plan ?? null;
    let next = scheduledOf(data?.["next"]);
    // O agendado que já venceu vira o vigente antes de qualquer mudança.
    if (next && next.effectiveFrom <= today) {
      current = next.plan;
      next = null;
    }
    const order = typeof data?.["order"] === "number" ? data["order"] : fallback?.order ?? newOrder;
    const base = {order, updatedAt: now, updatedBy: actor};

    if (action === "discardDraft") {
      if (!current && !next) {
        // Plano novo que nunca foi publicado: descartar o rascunho é apagá-lo.
        if (data) tx.delete(ref);
        return {planId: ref.id, version, current, next, draft: null, changes: []};
      }
      tx.set(ref,{...(data ?? {}), ...base, current, next, version, draft: null});
      return {planId: ref.id, version, current, next, draft: null, changes: []};
    }

    if (action === "draft") {
      tx.set(ref, {...(data ?? {}), ...base, current, next, version, draft: plan, draftUpdatedAt: now,
        draftBy: actor, createdAt: data?.["createdAt"] ?? now});
      return {planId: ref.id, version, current, next, draft: plan, changes: []};
    }

    const published = next?.plan ?? current;
    const changes = planChanges(published, plan!);
    if (changes.length === 0) {
      throw new HttpsError("invalid-argument", "Nenhuma alteração para publicar.", {fields: []});
    }
    const nextVersion = version + 1;
    const versions = ref.collection(VERSIONS);
    if (!data && fallback) {
      tx.set(versions.doc("1"), {version: 1, plan: fallback.plan, createdAt: now, createdBy: null,
        changes: [], effectiveFrom: null, note: "Padrão da tabela"});
    }
    tx.set(versions.doc(String(nextVersion)), {version: nextVersion, plan, createdAt: now, createdBy: actor,
      changes, effectiveFrom, replaced: next ? next.version : null});
    const scheduled: ScheduledPlan | null = effectiveFrom ? {plan: plan!, version: nextVersion, effectiveFrom} : null;
    const newCurrent = effectiveFrom ? current : plan;
    tx.set(ref, {...(data ?? {}), ...base, current: newCurrent, next: scheduled, version: nextVersion, draft: null,
      createdAt: data?.["createdAt"] ?? now});
    tx.set(db.collection(PLANS_LOG).doc(), {scope: "plan", planId: ref.id, planName: plan!.name,
      version: nextVersion, changes, effectiveFrom, createdAt: now, createdBy: actor});
    return {planId: ref.id, version: nextVersion, current: newCurrent, next: scheduled, draft: null, changes};
  });
}

/** Grava a próxima versão de uma config (`rules` ou `sponsors`) com retrato e log. */
async function saveConfigCore<T>(
  db: Firestore,
  docId: "rules" | "sponsors",
  value: T,
  inputVersion: unknown,
  fallback: T,
  diff: (prev: T, next: T) => string[],
  actor: Actor,
  now: Date,
): Promise<{version: number; value: T; changes: string[]}> {
  if (!int(inputVersion, 1, Number.MAX_SAFE_INTEGER)) throw invalidFields(["version"]);
  const ref = db.collection(PLANS_CONFIG).doc(docId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : undefined;
    const version = versionOf(data, 1);
    if (version !== inputVersion) {
      throw conflict(docId === "rules" ? "A estrutura financeira" : "A configuração de Sponsors", version, data);
    }
    const prev = data ? (data[docId] as T) : fallback;
    const changes = diff(prev, value);
    if (changes.length === 0) {
      throw new HttpsError("invalid-argument", "Nenhuma alteração para salvar.", {fields: []});
    }
    const next = version + 1;
    const versions = ref.collection(VERSIONS);
    if (!data) {
      tx.set(versions.doc("1"), {version: 1, [docId]: fallback, createdAt: now, createdBy: null, changes: [],
        note: "Padrão"});
    }
    tx.set(versions.doc(String(next)), {version: next, [docId]: value, createdAt: now, createdBy: actor, changes});
    tx.set(ref, {[docId]: value, version: next, updatedAt: now, updatedBy: actor});
    tx.set(db.collection(PLANS_LOG).doc(), {scope: docId, planId: null, planName: null, version: next, changes,
      effectiveFrom: null, createdAt: now, createdBy: actor});
    return {version: next, value, changes};
  });
}

export async function savePlanRulesCore(
  db: Firestore,
  input: {rules: PlanRules; version: number},
  actor: Actor,
  now: Date,
): Promise<{version: number; rules: PlanRules; changes: string[]}> {
  if (!isObj(input)) throw invalidFields(["rules"]);
  const errors = rulesErrors(input.rules);
  if (errors.length > 0) throw invalidFields(errors);
  const out = await saveConfigCore(db, "rules", normalizeRules(input.rules), input.version, DEFAULT_RULES,
    rulesChanges, actor, now);
  return {version: out.version, rules: out.value, changes: out.changes};
}

export async function saveSponsorsCore(
  db: Firestore,
  input: {sponsors: SponsorsConfig; version: number},
  actor: Actor,
  now: Date,
): Promise<{version: number; sponsors: SponsorsConfig; changes: string[]}> {
  if (!isObj(input)) throw invalidFields(["sponsors"]);
  const errors = sponsorsErrors(input.sponsors);
  if (errors.length > 0) throw invalidFields(errors);
  const out = await saveConfigCore(db, "sponsors", normalizeSponsors(input.sponsors), input.version,
    DEFAULT_SPONSORS, sponsorsChanges, actor, now);
  return {version: out.version, sponsors: out.value, changes: out.changes};
}

async function assertPlansAdmin(uid: string): Promise<Actor> {
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
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar os planos.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

async function actorOf(auth: {uid?: string} | undefined): Promise<Actor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return assertPlansAdmin(auth.uid);
}

export const saveTournamentPlan = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveTournamentPlanCore(getFirestore(), (request.data ?? {}) as SaveTournamentPlanInput, actor, new Date());
});

export const saveTournamentPlanRules = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return savePlanRulesCore(getFirestore(), request.data ?? {}, actor, new Date());
});

export const saveTournamentSponsors = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveSponsorsCore(getFirestore(), request.data ?? {}, actor, new Date());
});
