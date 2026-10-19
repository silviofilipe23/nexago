/**
 * Planos NexaGO pelo lado do organizador (portal › Planos & Sponsors): o catálogo que ele vê, o
 * pedido de contratação para um evento e as cotas de patrocínio que ele indica.
 *
 *   tournamentPlanContracts/{tournamentId}               — um contrato por evento
 *   tournamentPlanContracts/{tournamentId}/sponsors/{id} — patrocinadores (cotas) do evento
 *
 * O catálogo sai por callable, não por leitura direta: `tournamentPlans` e a config de regras
 * guardam custo e margem, e o plano agendado só vale no dia (`effectivePlan`, sem varredura) —
 * um espelho público ficaria velho até alguém regravar.
 *
 * O contrato congela o plano vigente (preço, escopo, sinal e cancelamento) e a config de cotas
 * do dia do pedido: mudar a tabela depois não mexe em evento já contratado. O organizador só
 * PEDE (`requested`) e cancela enquanto nada foi pago; confirmar, cobrar o sinal e concluir
 * são da NexaGO (backoffice, a construir) — por isso os outros status já existem aqui.
 *
 * As rules negam escrita de cliente nas duas coleções: estas callables são a porta.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {resolveOrganizerTournamentFeePercent} from "./platform-fees";
import {saoPauloDate} from "./store-checkout-price";
import {
  DEFAULT_PLANS,
  DEFAULT_SPONSORS,
  PLANS,
  PLANS_CONFIG,
  VERSIONS,
  defaultPlanOf,
  effectivePlan,
  type Actor,
  type SponsorTier,
  type SponsorsConfig,
  type TournamentPlan,
} from "./tournament-plans";

const ORGANIZER_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const CONTRACTS = "tournamentPlanContracts";
export const CONTRACT_SPONSORS = "sponsors";

export const CONTRACT_STATUSES = ["requested", "deposit_paid", "paid", "completed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Status que seguram a data na agenda da equipe e bloqueiam um segundo contrato no evento. */
const ACTIVE_STATUSES: readonly ContractStatus[] = ["requested", "deposit_paid", "paid"];

export const SPONSOR_LOGO_STATUSES = ["missing", "review", "approved", "rejected"] as const;
export type SponsorLogoStatus = (typeof SPONSOR_LOGO_STATUSES)[number];

export const SPONSOR_NAME_MAX = 40;

type Raw = Record<string, unknown>;

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ── datas civis (São Paulo) ─────────────────────────────────────────────────

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias civis de `from` a `to`, inclusive (no máximo 31 — evento não dura mais que isso). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 31; d = addDays(d, 1)) out.push(d);
  return out;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (isObj(v) && typeof v["toDate"] === "function") return (v["toDate"] as () => Date)();
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** "Goiânia" e "goiania " são a mesma cidade. */
export function cityKey(city: string): string {
  return city.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// ── catálogo ────────────────────────────────────────────────────────────────

/** O plano como o organizador vê: sem status interno, rascunho, custo nem margem. */
export interface CatalogPlan {
  id: string;
  order: number;
  name: string;
  description: string;
  priceCents: number;
  depositPct: number;
  balanceDays: number;
  cancelPolicy: TournamentPlan["cancelPolicy"];
  courts: number;
  refsPerCourt: number;
  live: boolean;
  narrator: boolean;
  hours: number;
  extraHourCents: number;
  leadDays: number;
  cities: string[];
}

export type CatalogTier = Omit<SponsorTier, "onSale">;

export interface CatalogSponsors {
  tiers: CatalogTier[];
  organizerSharePct: number;
  organizerCanSell: boolean;
  logoApproval: boolean;
}

export interface TournamentPlanCatalog {
  plans: CatalogPlan[];
  sponsors: CatalogSponsors;
  /** Comissão sobre inscrições deste organizador (negociável, `organizers/{uid}`). */
  feePercent: number;
  /** Hoje em São Paulo — a tela calcula antecedência com a mesma régua do servidor. */
  today: string;
}

function catalogPlanOf(id: string, order: number, p: TournamentPlan): CatalogPlan {
  return {
    id,
    order,
    name: p.name,
    description: p.description,
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
    cities: [...p.cities],
  };
}

function scheduledOf(v: unknown): {plan: TournamentPlan; version: number; effectiveFrom: string} | null {
  if (!isObj(v) || !isObj(v["plan"]) || typeof v["effectiveFrom"] !== "string") return null;
  return {plan: v["plan"] as unknown as TournamentPlan, version: Number(v["version"]), effectiveFrom: v["effectiveFrom"]};
}

/** O plano que vale hoje a partir do doc (ou do padrão, quando o doc não existe). */
function livePlanOf(id: string, data: Raw | undefined, today: string): {order: number; plan: TournamentPlan} | null {
  if (!data) return defaultPlanOf(id);
  const current = isObj(data["current"]) ? (data["current"] as unknown as TournamentPlan) : null;
  const plan = effectivePlan(current, scheduledOf(data["next"]), today);
  if (!plan) return null;
  return {order: typeof data["order"] === "number" ? data["order"] : defaultPlanOf(id)?.order ?? 999, plan};
}

export function catalogSponsorsOf(cfg: SponsorsConfig): CatalogSponsors {
  return {
    tiers: cfg.tiers.filter((t) => t.onSale).map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      priceCents: t.priceCents,
      appearances: t.appearances,
      seconds: t.seconds,
      mentions: t.mentions,
      maxPerEvent: t.maxPerEvent,
    })),
    organizerSharePct: cfg.organizerSharePct,
    organizerCanSell: cfg.organizerCanSell,
    logoApproval: cfg.logoApproval,
  };
}

async function sponsorsConfigOf(db: Firestore): Promise<SponsorsConfig> {
  const snap = await db.collection(PLANS_CONFIG).doc("sponsors").get();
  const value = snap.exists ? snap.data()?.["sponsors"] : null;
  return isObj(value) ? (value as unknown as SponsorsConfig) : structuredClone(DEFAULT_SPONSORS);
}

async function feePercentOf(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection("organizers").doc(uid).get();
  return resolveOrganizerTournamentFeePercent(snap.exists ? snap.data() : null);
}

export async function loadCatalogCore(db: Firestore, uid: string, now: Date): Promise<TournamentPlanCatalog> {
  const today = saoPauloDate(now);
  const all = await db.collection(PLANS).get();
  const docs = new Map(all.docs.map((d) => [d.id, d.data() as Raw]));
  const ids = new Set([...DEFAULT_PLANS.map((d) => d.id), ...docs.keys()]);
  const plans: CatalogPlan[] = [];
  for (const id of ids) {
    const live = livePlanOf(id, docs.get(id), today);
    if (live && live.plan.status === "ativo") plans.push(catalogPlanOf(id, live.order, live.plan));
  }
  plans.sort((a, b) => a.order - b.order || a.priceCents - b.priceCents);
  const [sponsors, feePercent] = await Promise.all([sponsorsConfigOf(db), feePercentOf(db, uid)]);
  return {plans, sponsors: catalogSponsorsOf(sponsors), feePercent, today};
}

// ── contrato ────────────────────────────────────────────────────────────────

export interface ContractSponsors {
  enabled: boolean;
  organizerSharePct: number;
  logoApproval: boolean;
  tiers: CatalogTier[];
}

export interface PlanContract {
  organizerId: string;
  tournamentId: string;
  tournamentName: string;
  city: string;
  /** `YYYY-MM-DD` em São Paulo. */
  startDate: string;
  endDate: string;
  planId: string;
  /** Versão do plano congelada; `null` só se o histórico não permitiu descobrir. */
  planVersion: number | null;
  plan: CatalogPlan;
  priceCents: number;
  depositCents: number;
  balanceCents: number;
  balanceDueDate: string;
  sponsors: ContractSponsors;
  status: ContractStatus;
}

export function contractAmounts(plan: Pick<CatalogPlan, "priceCents" | "depositPct">): {depositCents: number; balanceCents: number} {
  const depositCents = Math.round((plan.priceCents * plan.depositPct) / 100);
  return {depositCents, balanceCents: plan.priceCents - depositCents};
}

/** Saldo vence `balanceDays` antes do início — nunca antes de hoje (evento em cima da hora). */
export function balanceDueDateOf(startDate: string, balanceDays: number, today: string): string {
  const due = addDays(startDate, -balanceDays);
  return due < today ? today : due;
}

export function contractSponsorsOf(plan: Pick<CatalogPlan, "live">, cfg: SponsorsConfig): ContractSponsors {
  const catalog = catalogSponsorsOf(cfg);
  return {
    enabled: plan.live && catalog.organizerCanSell && catalog.tiers.length > 0,
    organizerSharePct: catalog.organizerSharePct,
    logoApproval: catalog.logoApproval,
    tiers: catalog.tiers,
  };
}

/** Versão em vigor: com agendado pendente, é a mais nova publicada sem data futura. */
async function liveVersionOf(db: Firestore, planId: string, data: Raw | undefined, today: string): Promise<number | null> {
  if (!data) return 1;
  const next = scheduledOf(data["next"]);
  if (next && next.effectiveFrom <= today) return next.version;
  const version = typeof data["version"] === "number" ? data["version"] : null;
  if (!next) return version;
  const versions = await db.collection(PLANS).doc(planId).collection(VERSIONS).get();
  const live = versions.docs
    .map((d) => d.data() as Raw)
    .filter((v) => typeof v["version"] === "number" &&
      (v["effectiveFrom"] == null || (typeof v["effectiveFrom"] === "string" && v["effectiveFrom"] <= today)))
    .map((v) => v["version"] as number);
  return live.length > 0 ? Math.max(...live) : null;
}

function actorName(uid: string, user: {displayName?: string; email?: string} | null): Actor {
  return {uid, name: user?.displayName ?? user?.email ?? uid};
}

const ID = /^[A-Za-z0-9_-]{2,64}$/;

function badId(field: string): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields: [field]});
}

function fmtDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function brl(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
}

export interface RequestContractInput {
  tournamentId: string;
  planId: string;
  /** O preço que a tela mostrou — se a tabela mudou no meio, o pedido não passa calado. */
  expectedPriceCents: number;
}

export async function requestContractCore(
  db: Firestore,
  input: RequestContractInput,
  actor: Actor,
  now: Date,
): Promise<{tournamentId: string; status: ContractStatus}> {
  if (!isObj(input)) throw badId("tournamentId");
  const {tournamentId, planId, expectedPriceCents} = input;
  if (typeof tournamentId !== "string" || !ID.test(tournamentId)) throw badId("tournamentId");
  if (typeof planId !== "string" || !ID.test(planId)) throw badId("planId");
  if (typeof expectedPriceCents !== "number" || !Number.isInteger(expectedPriceCents)) throw badId("expectedPriceCents");
  const today = saoPauloDate(now);

  const tSnap = await db.collection("tournaments").doc(tournamentId).get();
  const t = tSnap.exists ? (tSnap.data() as Raw) : null;
  if (!t) throw new HttpsError("not-found", "Torneio não encontrado.");
  if (t["managerId"] !== actor.uid) {
    throw new HttpsError("permission-denied", "Só o dono do torneio pode contratar um plano para ele.");
  }
  const rawStatus = String(t["status"] ?? "").toLowerCase();
  if (rawStatus.includes("cancel") || rawStatus.includes("complet") || rawStatus.includes("conclu")) {
    throw new HttpsError("failed-precondition", "Este torneio já foi encerrado ou cancelado.");
  }
  const startAt = dateOf(t["startAt"]);
  if (!startAt) throw new HttpsError("failed-precondition", "Defina a data do torneio antes de contratar um plano.");
  const startDate = saoPauloDate(startAt);
  const endAt = dateOf(t["endAt"]);
  const endDate = endAt && saoPauloDate(endAt) > startDate ? saoPauloDate(endAt) : startDate;
  const city = typeof t["city"] === "string" ? t["city"].trim() : "";

  const planSnap = await db.collection(PLANS).doc(planId).get();
  const planData = planSnap.exists ? (planSnap.data() as Raw) : undefined;
  const live = livePlanOf(planId, planData, today);
  if (!live || live.plan.status !== "ativo") {
    throw new HttpsError("failed-precondition", "Este plano não está mais disponível. Recarregue a página.");
  }
  const plan = catalogPlanOf(planId, live.order, live.plan);
  if (plan.priceCents !== expectedPriceCents) {
    throw new HttpsError("failed-precondition",
      `O preço do ${plan.name} mudou para ${brl(plan.priceCents)}. Revise antes de contratar.`,
      {priceCents: plan.priceCents});
  }
  const earliest = addDays(today, plan.leadDays);
  if (startDate < earliest) {
    throw new HttpsError("failed-precondition",
      `O ${plan.name} pede ${plan.leadDays} dias de antecedência: o torneio precisaria começar a partir de ${fmtDay(earliest)}.`);
  }
  if (plan.cities.length > 0) {
    if (!city) throw new HttpsError("failed-precondition", "Informe a cidade do torneio antes de contratar um plano.");
    if (!plan.cities.some((c) => cityKey(c) === cityKey(city))) {
      throw new HttpsError("failed-precondition", `O ${plan.name} ainda não atende ${city}. Cidades: ${plan.cities.join(", ")}.`);
    }
  }
  const planVersion = await liveVersionOf(db, planId, planData, today);
  const sponsorsCfg = await sponsorsConfigOf(db);
  const {depositCents, balanceCents} = contractAmounts(plan);

  const ref = db.collection(CONTRACTS).doc(tournamentId);
  const sameDayQuery = db.collection(CONTRACTS).where("planId", "==", planId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as Raw) : null;
    if (prev && ACTIVE_STATUSES.includes(prev["status"] as ContractStatus)) {
      throw new HttpsError("already-exists", `Este torneio já tem o ${(prev["plan"] as Raw | undefined)?.["name"] ?? "plano"} contratado.`);
    }
    // Agenda da equipe: o plano atende no máximo `maxPerDay` eventos em cada dia.
    const others = (await tx.get(sameDayQuery)).docs
      .map((d) => d.data() as Raw)
      .filter((c) => c["tournamentId"] !== tournamentId && ACTIVE_STATUSES.includes(c["status"] as ContractStatus));
    for (const day of daysBetween(startDate, endDate)) {
      const busy = others.filter((c) => String(c["startDate"]) <= day && day <= String(c["endDate"])).length;
      if (busy >= live.plan.maxPerDay) {
        throw new HttpsError("resource-exhausted",
          `A agenda do ${plan.name} está cheia em ${fmtDay(day)}. Escolha outro plano ou fale com a NexaGO.`);
      }
    }
    const contract: PlanContract = {
      organizerId: actor.uid,
      tournamentId,
      tournamentName: typeof t["name"] === "string" ? t["name"] : "Torneio",
      city,
      startDate,
      endDate,
      planId,
      planVersion,
      plan,
      priceCents: plan.priceCents,
      depositCents,
      balanceCents,
      balanceDueDate: balanceDueDateOf(startDate, plan.balanceDays, today),
      sponsors: contractSponsorsOf(plan, sponsorsCfg),
      status: "requested",
    };
    tx.set(ref, {
      ...contract,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
      history: [{status: "requested", at: now, by: actor}],
    });
    return {tournamentId, status: "requested" as ContractStatus};
  });
}

export async function cancelContractCore(
  db: Firestore,
  input: {tournamentId: string},
  actor: Actor,
  now: Date,
): Promise<{tournamentId: string; status: ContractStatus}> {
  const tournamentId = isObj(input) ? input.tournamentId : null;
  if (typeof tournamentId !== "string" || !ID.test(tournamentId)) throw badId("tournamentId");
  const ref = db.collection(CONTRACTS).doc(tournamentId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? (snap.data() as Raw) : null;
    if (!c || c["organizerId"] !== actor.uid) throw new HttpsError("not-found", "Contrato não encontrado.");
    if (c["status"] === "cancelled") return {tournamentId, status: "cancelled" as ContractStatus};
    if (c["status"] !== "requested") {
      throw new HttpsError("failed-precondition",
        "Com pagamento feito, o cancelamento passa pela NexaGO, conforme a política do plano.");
    }
    const history = Array.isArray(c["history"]) ? c["history"] : [];
    tx.update(ref, {status: "cancelled", cancelledAt: now, updatedAt: now, updatedBy: actor,
      history: [...history, {status: "cancelled", at: now, by: actor}]});
    return {tournamentId, status: "cancelled" as ContractStatus};
  });
}

// ── cotas de patrocínio do evento ───────────────────────────────────────────

export type SponsorAction = "add" | "logo" | "remove";

export interface SaveSponsorInput {
  tournamentId: string;
  action: SponsorAction;
  /** Gerado pela tela no `add`: o logo sobe antes, no caminho com este id. */
  sponsorId: string;
  name?: string;
  tierId?: string;
  logoUrl?: string | null;
}

/** O logo tem de ser o arquivo deste patrocinador, no Storage do projeto — não uma URL qualquer. */
export function isSponsorLogoUrl(url: unknown, tournamentId: string, sponsorId: string): url is string {
  if (typeof url !== "string" || url.length > 2048) return false;
  const path = encodeURIComponent(`tournaments/${tournamentId}/plan-sponsors/${sponsorId}`);
  const m = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9._-]+\/o\/([^?#]+)(\?.*)?$/.exec(url);
  return m !== null && m[1] === path;
}

const EDITABLE: readonly ContractStatus[] = ["requested", "deposit_paid", "paid"];

export async function saveSponsorCore(
  db: Firestore,
  input: SaveSponsorInput,
  actor: Actor,
  now: Date,
): Promise<{sponsorId: string; logoStatus: SponsorLogoStatus | null}> {
  if (!isObj(input)) throw badId("tournamentId");
  const {tournamentId, action, sponsorId} = input;
  if (typeof tournamentId !== "string" || !ID.test(tournamentId)) throw badId("tournamentId");
  if (action !== "add" && action !== "logo" && action !== "remove") throw badId("action");
  if (typeof sponsorId !== "string" || !ID.test(sponsorId)) throw badId("sponsorId");
  const logoUrl = input.logoUrl ?? null;
  if ((action === "logo" || logoUrl !== null) && !isSponsorLogoUrl(logoUrl, tournamentId, sponsorId)) {
    throw badId("logoUrl");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (action === "add" && (name.length < 2 || name.length > SPONSOR_NAME_MAX)) throw badId("name");

  const contractRef = db.collection(CONTRACTS).doc(tournamentId);
  const sponsors = contractRef.collection(CONTRACT_SPONSORS);
  const ref = sponsors.doc(sponsorId);
  return db.runTransaction(async (tx) => {
    const cSnap = await tx.get(contractRef);
    const c = cSnap.exists ? (cSnap.data() as Raw) : null;
    if (!c || c["organizerId"] !== actor.uid) throw new HttpsError("not-found", "Contrato não encontrado.");
    if (!EDITABLE.includes(c["status"] as ContractStatus)) {
      throw new HttpsError("failed-precondition", "Este contrato não aceita mais mudanças nas cotas.");
    }
    const cfg = isObj(c["sponsors"]) ? (c["sponsors"] as unknown as ContractSponsors) : null;
    if (!cfg?.enabled) throw new HttpsError("failed-precondition", "Este plano não tem cotas de patrocínio.");
    const sSnap = await tx.get(ref);
    const s = sSnap.exists ? (sSnap.data() as Raw) : null;
    const logoStatus: SponsorLogoStatus = cfg.logoApproval ? "review" : "approved";

    if (action === "add") {
      if (s) throw new HttpsError("already-exists", "Patrocinador já cadastrado.");
      const tier = cfg.tiers.find((x) => x.id === input.tierId);
      if (!tier) throw badId("tierId");
      const sold = (await tx.get(sponsors.where("tierId", "==", tier.id))).docs.length;
      if (sold >= tier.maxPerEvent) {
        throw new HttpsError("resource-exhausted", `As ${tier.maxPerEvent} cotas ${tier.name} deste evento já foram vendidas.`);
      }
      const status = logoUrl ? logoStatus : "missing";
      tx.set(ref, {name, tierId: tier.id, tier: {...tier}, logoUrl, logoStatus: status, source: "organizer",
        createdAt: now, createdBy: actor, updatedAt: now});
      return {sponsorId, logoStatus: status};
    }
    if (!s) throw new HttpsError("not-found", "Patrocinador não encontrado.");
    if (s["source"] !== "organizer") {
      throw new HttpsError("permission-denied", "Este patrocinador foi trazido pela NexaGO: fale com a equipe para mudar.");
    }
    if (action === "logo") {
      tx.update(ref, {logoUrl, logoStatus, updatedAt: now});
      return {sponsorId, logoStatus};
    }
    tx.delete(ref);
    return {sponsorId, logoStatus: null};
  });
}

// ── callables ───────────────────────────────────────────────────────────────

async function actorOf(auth: {uid?: string} | undefined): Promise<Actor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  try {
    return actorName(auth.uid, await getAuth().getUser(auth.uid));
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
}

export const getTournamentPlanCatalog = onCall(ORGANIZER_CALLABLE, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return loadCatalogCore(getFirestore(), request.auth.uid, new Date());
});

export const manageTournamentPlanContract = onCall(ORGANIZER_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  const data = (request.data ?? {}) as Raw;
  if (data["action"] === "cancel") {
    return cancelContractCore(getFirestore(), data as unknown as {tournamentId: string}, actor, new Date());
  }
  if (data["action"] !== "request") throw badId("action");
  return requestContractCore(getFirestore(), data as unknown as RequestContractInput, actor, new Date());
});

export const savePlanContractSponsor = onCall(ORGANIZER_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveSponsorCore(getFirestore(), (request.data ?? {}) as SaveSponsorInput, actor, new Date());
});
