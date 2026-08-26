/**
 * Visão CFO do backoffice: MRR/ARR reais (assinaturas de arena), custos
 * fixos/variáveis cadastrados em `platformCosts`, e o plano de ação de
 * break-even (quantos planos fechar, com quais arenas pré-cadastradas
 * contatar) quando custo > MRR.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {
  ARENA_PLANS,
  normalizeArenaPlanTier,
  type ArenaPlanTier,
  type BillingCycle,
} from "./arena-plans";

const PLATFORM_COSTS = "platformCosts";
/** Arenas pré-cadastradas priorizadas no plano de ação — teto por chamada. */
const MAX_TARGET_ARENAS = 20;

/**
 * Gen2 callables precisam de invoker público para o browser completar o
 * preflight OPTIONS. Sem isso o Cloud Run responde 403 sem CORS e o DevTools
 * mostra "blocked by CORS policy". A autenticação Firebase continua no handler.
 */
const BACKOFFICE_CALLABLE = {invoker: "public" as const};

export type CostCategory = "fixed" | "variable";

export interface PlatformCostItem {
  id: string;
  name: string;
  category: CostCategory;
  amountCents: number;
  notes: string | null;
}

export interface FinanceTierBreakdown {
  tier: ArenaPlanTier;
  count: number;
  mrrCents: number;
}

export interface BreakEvenTargetArena {
  id: string;
  name: string;
  city: string | null;
  whatsapp: string | null;
  contactAthletesCount: number;
}

export interface BreakEvenPlan {
  achieved: boolean;
  gapCents: number;
  /** Quantas assinaturas do plano de entrada (Starter) fecham o gap. */
  plansNeeded: number;
  entryTier: ArenaPlanTier;
  entryPlanMonthlyCents: number;
  targetArenas: BreakEvenTargetArena[];
}

export interface FinanceOverview {
  mrrCents: number;
  arrCents: number;
  activeArenasCount: number;
  avgTicketCents: number;
  byTier: FinanceTierBreakdown[];
  fixedCostsCents: number;
  variableCostsCents: number;
  totalCostsCents: number;
  fixedCosts: PlatformCostItem[];
  variableCosts: PlatformCostItem[];
  breakEven: BreakEvenPlan;
}

async function assertBackofficeAdmin(uid: string): Promise<void> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      // Token ainda válido (JWT não expirou) mas a conta foi apagada depois
      // que o cliente o obteve — sessão órfã, não um erro interno real.
      throw new HttpsError(
        "unauthenticated",
        "Sua sessão expirou. Entre novamente para continuar."
      );
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem acessar o financeiro.",
    );
  }
}

function planCycleOf(data: FirebaseFirestore.DocumentData): BillingCycle {
  return data["planCycle"] === "yearly" ? "yearly" : "monthly";
}

/** Valor mensal equivalente do plano/ciclo — anual é rateado por 12 (padrão MRR). */
export function monthlyEquivalentCents(tier: ArenaPlanTier, cycle: BillingCycle): number {
  const plan = ARENA_PLANS[tier];
  return cycle === "yearly" ? Math.round(plan.yearlyCents / 12) : plan.monthlyCents;
}

/**
 * Custo total > MRR: quantas assinaturas do plano de entrada fecham o gap.
 * Arredonda pra cima — fechar "1,3 plano" não existe, o plano de ação pede 2.
 */
export function computeBreakEven(
  mrrCents: number,
  totalCostsCents: number,
  entryTier: ArenaPlanTier,
): Omit<BreakEvenPlan, "targetArenas"> {
  const entryPlanMonthlyCents = ARENA_PLANS[entryTier].monthlyCents;
  const gapCents = Math.max(0, totalCostsCents - mrrCents);
  const plansNeeded = gapCents <= 0 ? 0 : Math.ceil(gapCents / entryPlanMonthlyCents);
  return {
    achieved: gapCents <= 0,
    gapCents,
    plansNeeded,
    entryTier,
    entryPlanMonthlyCents,
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function loadActiveArenaSubscriptions(
  db: Firestore,
): Promise<{tier: ArenaPlanTier; cycle: BillingCycle}[]> {
  const snap = await db.collection("arenas").where("planStatus", "==", "active").get();
  const rows: {tier: ArenaPlanTier; cycle: BillingCycle}[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const tier = normalizeArenaPlanTier(data["planTier"]);
    if (!tier) continue;
    rows.push({tier, cycle: planCycleOf(data)});
  }
  return rows;
}

function toCostItem(doc: FirebaseFirestore.QueryDocumentSnapshot): PlatformCostItem | null {
  const data = doc.data();
  const name = str(data["name"]);
  const category = data["category"] === "variable" ? "variable" : "fixed";
  if (!name) return null;
  return {
    id: doc.id,
    name,
    category,
    amountCents: Math.max(0, Math.round(num(data["amountCents"]))),
    notes: str(data["notes"]),
  };
}

async function loadPlatformCosts(
  db: Firestore,
): Promise<{fixed: PlatformCostItem[]; variable: PlatformCostItem[]}> {
  const snap = await db.collection(PLATFORM_COSTS).get();
  const fixed: PlatformCostItem[] = [];
  const variable: PlatformCostItem[] = [];
  for (const doc of snap.docs) {
    const item = toCostItem(doc);
    if (!item) continue;
    (item.category === "fixed" ? fixed : variable).push(item);
  }
  const byAmountDesc = (a: PlatformCostItem, b: PlatformCostItem) => b.amountCents - a.amountCents;
  fixed.sort(byAmountDesc);
  variable.sort(byAmountDesc);
  return {fixed, variable};
}

/** Top arenas pré-cadastradas (sem plano) pra priorizar contato — mesma ordenação da tela de pré-cadastro. */
async function loadTargetArenas(db: Firestore, limit: number): Promise<BreakEvenTargetArena[]> {
  if (limit <= 0) return [];
  const snap = await db.collection("arenas").where("unclaimed", "==", true).get();
  const rows: BreakEvenTargetArena[] = snap.docs.map((doc) => {
    const data = doc.data();
    const city = str(data["city"]);
    const state = str(data["state"]);
    return {
      id: doc.id,
      name: str(data["name"]) ?? `Arena ${doc.id}`,
      city: city && state ? `${city} · ${state}` : (city ?? state),
      whatsapp: str(data["whatsapp"]),
      contactAthletesCount: num(data["contactAthletesCount"]),
    };
  });
  rows.sort((a, b) => b.contactAthletesCount - a.contactAthletesCount);
  return rows.slice(0, Math.min(limit, MAX_TARGET_ARENAS));
}

export const getFinanceOverview = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertBackofficeAdmin(uid);

  const db = getFirestore();
  const [subscriptions, costs] = await Promise.all([
    loadActiveArenaSubscriptions(db),
    loadPlatformCosts(db),
  ]);

  const byTierMap = new Map<ArenaPlanTier, FinanceTierBreakdown>();
  let mrrCents = 0;
  for (const {tier, cycle} of subscriptions) {
    const cents = monthlyEquivalentCents(tier, cycle);
    mrrCents += cents;
    const entry = byTierMap.get(tier) ?? {tier, count: 0, mrrCents: 0};
    entry.count += 1;
    entry.mrrCents += cents;
    byTierMap.set(tier, entry);
  }
  const byTier = (["starter", "pro", "elite"] as const)
    .map((tier) => byTierMap.get(tier) ?? {tier, count: 0, mrrCents: 0});

  const fixedCostsCents = costs.fixed.reduce((sum, c) => sum + c.amountCents, 0);
  const variableCostsCents = costs.variable.reduce((sum, c) => sum + c.amountCents, 0);
  const totalCostsCents = fixedCostsCents + variableCostsCents;
  const activeArenasCount = subscriptions.length;

  const breakEvenBase = computeBreakEven(mrrCents, totalCostsCents, "starter");
  const targetArenas = await loadTargetArenas(db, breakEvenBase.plansNeeded);

  const overview: FinanceOverview = {
    mrrCents,
    arrCents: mrrCents * 12,
    activeArenasCount,
    avgTicketCents: activeArenasCount > 0 ? Math.round(mrrCents / activeArenasCount) : 0,
    byTier,
    fixedCostsCents,
    variableCostsCents,
    totalCostsCents,
    fixedCosts: costs.fixed,
    variableCosts: costs.variable,
    breakEven: {...breakEvenBase, targetArenas},
  };

  return overview;
});

interface UpsertCostInput {
  id?: string;
  name?: string;
  category?: string;
  amountCents?: number;
  notes?: string;
}

export const upsertPlatformCost = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertBackofficeAdmin(uid);

  const data = (request.data ?? {}) as UpsertCostInput;
  const name = (data.name ?? "").trim();
  const category = data.category === "variable" ? "variable" : "fixed";
  const amountCents = Math.round(Number(data.amountCents));
  const notes = (data.notes ?? "").trim();
  const id = (data.id ?? "").trim();

  if (!name) {
    throw new HttpsError("invalid-argument", "Informe o nome do custo.");
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new HttpsError("invalid-argument", "Informe um valor mensal válido.");
  }

  const db = getFirestore();
  const payload = {
    name,
    category,
    amountCents,
    notes: notes || null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  };

  if (id) {
    const ref = db.collection(PLATFORM_COSTS).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Custo não encontrado.");
    }
    await ref.set(payload, {merge: true});
    return {id};
  }

  const ref = await db.collection(PLATFORM_COSTS).add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  });
  return {id: ref.id};
});

export const deletePlatformCost = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertBackofficeAdmin(uid);

  const id = ((request.data as {id?: string} | undefined)?.id ?? "").trim();
  if (!id) {
    throw new HttpsError("invalid-argument", "id é obrigatório");
  }
  await getFirestore().collection(PLATFORM_COSTS).doc(id).delete();
  return {ok: true};
});
