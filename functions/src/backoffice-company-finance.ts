/**
 * Backoffice › Financeiro: saldo real da NexaGO e resultado mês a mês, num callable só.
 *
 * Lê com o Admin SDK porque metade das fontes não é legível pelo admin no cliente (cobranças de
 * aula e de plano de horário, cobranças de professor, faturas de centro, pagamentos processados) e
 * consulta o Asaas: saldo da conta (`/v3/finance/balance`), extrato (`/v3/financialTransactions`,
 * para as tarifas) e as cobranças das assinaturas de plano das arenas (o Firestore não guarda o
 * valor pago). Regras do cálculo em `company-finance.ts`.
 *
 * Falha do Asaas não derruba a tela: o saldo vira `null`, as tarifas viram "—" e o aviso vai em
 * `warnings`.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type DocumentData, type Firestore} from "firebase-admin/firestore";
import {asaasArenaSecrets, fetchAsaas} from "./asaas-client";
import {assertBackofficeAdmin} from "./backoffice-finance";
import {
  EMPTY_HOLDING,
  FinanceBook,
  addArenaLedgerLine,
  addArenaSubscriptionPayment,
  addArenaWithdrawal,
  addAsaasStatementEntry,
  addCenterInvoice,
  addHolding,
  addPlanContract,
  addProfessorCharge,
  addSquadCommission,
  addStockEntry,
  addStoreOrder,
  addTournamentLedgerLine,
  balanceSummary,
  holdingOf,
  inAccountCents,
  intCents,
  isMonthKey,
  monthKeyOf,
  monthWindow,
  pendingReturnSettlementCents,
  pendingStoreRefundCents,
  reaisToCents,
  windowDates,
  type Holding,
} from "./company-finance";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const MONTHS = 6;
const ASAAS_PAGE = 100;
/** Teto de páginas do extrato por chamada (3.000 lançamentos na janela). */
const STATEMENT_MAX_PAGES = 30;
/** Lançamentos do mês escolhido devolvidos para a aba Extrato. */
const STATEMENT_ENTRIES_CAP = 500;
const TOP_HOLDERS = 10;

type HolderKind = "torneio" | "arena" | "organizador" | "professor" | "embaixador";

interface Holder {
  kind: HolderKind;
  id: string;
  /** `null` = doc sem nome (ou apagado): a tela mostra o id encurtado. */
  name: string | null;
  availableCents: number;
  pendingCents: number;
}

interface AsaasList<T> {
  data?: T[];
  hasMore?: boolean;
}

interface StatementEntry {
  id: string;
  date: string;
  type: string;
  description: string;
  valueCents: number;
  balanceCents: number | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Leitura do Asaas injetável: no callable é o `fetchAsaas` da conta da plataforma. */
export interface AsaasReader {
  get<T>(path: string): Promise<T>;
}

async function asaasPages<T>(asaas: AsaasReader, path: string, maxPages: number): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 0; page < maxPages; page++) {
    const res = await asaas.get<AsaasList<T>>(`${path}${sep}offset=${page * ASAAS_PAGE}&limit=${ASAAS_PAGE}`);
    out.push(...(res.data ?? []));
    if (!res.hasMore) break;
  }
  return out;
}

/** Linhas de todos os extratos de uma coleção de caixas (`{col}/{id}/ledger`). */
async function walletLedgers(db: Firestore, col: string, ids: readonly string[]): Promise<DocumentData[]> {
  const snaps = await Promise.all(ids.map((id) => db.collection(col).doc(id).collection("ledger").get()));
  return snaps.flatMap((s) => s.docs.map((d) => d.data()));
}

async function namesOf(db: Firestore, col: string, ids: readonly string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const snaps = await db.getAll(...ids.map((id) => db.collection(col).doc(id)));
  return new Map(snaps.map((s) => {
    const d = s.data() ?? {};
    const profile = (d["organizerProfile"] ?? {}) as DocumentData;
    return [s.id, str(d["name"]) ?? str(profile["orgName"]) ?? str(d["fullName"]) ?? str(d["displayName"])];
  }));
}

/** Saque aprovado cujo PIX não saiu (`payoutStatus` pendente ou com falha): dinheiro parado. */
function isStuckWithdrawal(d: DocumentData): boolean {
  return d["status"] === "approved" && (d["payoutStatus"] === "pending" || d["payoutStatus"] === "failed");
}

/** Tudo que a tela do Financeiro mostra, para o mês `month` (`YYYY-MM`) e os 5 anteriores. */
export async function loadCompanyFinance(db: Firestore, month: string, asaas: AsaasReader) {
  const keys = monthWindow(month, MONTHS);
  const warnings: string[] = [];

  const [
    costs, tWallets, aWallets, oWallets, pWallets, sWallets, athleteWallets, commissions,
    arenaWithdrawals, orgWithdrawals, profWithdrawals, orders, returns, stock, profCharges,
    invoices, receiving, contracts, billing,
  ] = await Promise.all([
    db.collection("platformCosts").get(),
    db.collection("tournamentWallets").get(),
    db.collection("arenaWallets").get(),
    db.collection("organizerWallets").get(),
    db.collection("professorEarningsWallets").get(),
    db.collection("squadWallets").get(),
    db.collection("athleteWallets").get(),
    db.collection("squadCommissions").get(),
    db.collection("arenaWithdrawals").get(),
    db.collection("organizerWithdrawals").where("status", "in", ["pending", "approved"]).get(),
    db.collection("professorWithdrawals").where("status", "in", ["pending", "approved"]).get(),
    db.collection("storeOrders").get(),
    db.collection("storeReturns").get(),
    db.collection("storeStockMovements").where("type", "==", "entrada").get(),
    db.collection("professorCharges").where("status", "==", "paid").get(),
    db.collectionGroup("invoices").get(),
    db.collection("trainingCenterReceiving").get(),
    db.collection("tournamentPlanContracts").get(),
    db.collectionGroup("billing").get(),
  ]);

  const operatingCents = costs.docs.reduce((s, d) => s + Math.max(0, intCents(d.data()["amountCents"])), 0);
  const book = new FinanceBook(keys, operatingCents);

  // ── caixas e extratos ──
  const [tLines, aLines] = await Promise.all([
    walletLedgers(db, "tournamentWallets", tWallets.docs.map((d) => d.id)),
    walletLedgers(db, "arenaWallets", aWallets.docs.map((d) => d.id)),
  ]);
  tLines.forEach((l) => addTournamentLedgerLine(book, l));
  aLines.forEach((l) => addArenaLedgerLine(book, l));

  const sum = (docs: readonly {data(): DocumentData}[]) =>
    docs.reduce<Holding>((acc, d) => addHolding(acc, holdingOf(d.data())), EMPTY_HOLDING);
  const squadHolding = sWallets.docs.reduce<Holding>((acc, d) => addHolding(acc, {
    ...EMPTY_HOLDING, availableCents: Math.max(0, intCents(d.data()["balanceCents"])), count: 1,
  }), EMPTY_HOLDING);
  const thirdParty = {
    tournaments: sum(tWallets.docs),
    organizersLegacy: sum(oWallets.docs),
    arenas: sum(aWallets.docs),
    professors: sum(pWallets.docs),
    squad: squadHolding,
  };
  const thirdPartyCents = Object.values(thirdParty).reduce((s, h) => s + inAccountCents(h), 0);

  // ── demais fontes ──
  commissions.docs.forEach((d) => addSquadCommission(book, d.data()));
  arenaWithdrawals.docs.forEach((d) => addArenaWithdrawal(book, d.data()));
  orders.docs.forEach((d) => addStoreOrder(book, d.data()));
  stock.docs.forEach((d) => addStockEntry(book, d.data()));
  profCharges.docs.forEach((d) => addProfessorCharge(book, d.data()));
  contracts.docs.forEach((d) => addPlanContract(book, d.data()));
  const centerPct = new Map(receiving.docs.map((d) => {
    const pct = d.data()["feePercent"];
    return [d.id, typeof pct === "number" ? pct : null];
  }));
  for (const inv of invoices.docs) {
    const center = inv.ref.parent.parent;
    if (center?.parent.id !== "trainingCenters") continue;
    addCenterInvoice(book, inv.data(), centerPct.get(center.id) ?? null);
  }

  // ── provisões ──
  let cashbackAvailableCents = 0;
  let cashbackPendingCents = 0;
  for (const d of athleteWallets.docs) {
    const w = d.data();
    cashbackAvailableCents += Math.max(0, intCents(w["availableCents"])) + Math.max(0, intCents(w["heldCents"]));
    cashbackPendingCents += Math.max(0, intCents(w["pendingCents"]));
  }
  const released = commissions.docs.filter((d) => d.data()["status"] === "released");
  const squadToPayCents = released.reduce((s, d) => s + Math.max(0, intCents(d.data()["amountCents"])), 0);
  const refundRows = [
    ...orders.docs.map((d) => pendingStoreRefundCents(d.data())),
    ...returns.docs.map((d) => pendingReturnSettlementCents(d.data())),
  ].filter((c) => c > 0);
  const provisions = {
    cashbackAvailableCents,
    cashbackPendingCents,
    squadToPayCents,
    squadToPayCount: released.length,
    storeRefundsCents: refundRows.reduce((s, c) => s + c, 0),
    storeRefundsCount: refundRows.length,
  };
  const provisionsCents = cashbackAvailableCents + cashbackPendingCents + squadToPayCents + provisions.storeRefundsCents;

  // ── Asaas: saldo, extrato e assinaturas das arenas ──
  const subscriptionIds = billing.docs
    .filter((d) => d.id === "subscription" && d.ref.parent.parent?.parent.id === "arenas")
    .map((d) => str(d.data()["asaasSubscriptionId"]))
    .filter((id): id is string => !!id);
  const {start, finish} = windowDates(keys);

  const [balanceRes, statementRes, subscriptionsRes] = await Promise.allSettled([
    asaas.get<{balance?: unknown}>("/v3/finance/balance"),
    asaasPages<DocumentData>(asaas, `/v3/financialTransactions?startDate=${start}&finishDate=${finish}&order=desc`, STATEMENT_MAX_PAGES),
    Promise.all(subscriptionIds.map((id) => asaasPages<DocumentData>(asaas, `/v3/subscriptions/${encodeURIComponent(id)}/payments`, 5))),
  ]);

  let asaasCents: number | null = null;
  if (balanceRes.status === "fulfilled" && typeof balanceRes.value.balance === "number") {
    asaasCents = reaisToCents(balanceRes.value.balance);
  } else {
    logger.error("getCompanyFinance: saldo do Asaas indisponível", balanceRes.status === "rejected" ? balanceRes.reason : balanceRes.value);
    warnings.push("Não foi possível consultar o saldo no Asaas agora.");
  }

  let statement: StatementEntry[] = [];
  if (statementRes.status === "fulfilled") {
    statementRes.value.forEach((e) => addAsaasStatementEntry(book, e));
    statement = statementRes.value
      .filter((e) => typeof e["date"] === "string" && (e["date"] as string).startsWith(month))
      .slice(0, STATEMENT_ENTRIES_CAP)
      .map((e) => ({
        id: str(e["id"]) ?? "",
        date: String(e["date"]),
        type: str(e["type"]) ?? "",
        description: str(e["description"]) ?? "",
        valueCents: reaisToCents(e["value"]),
        balanceCents: typeof e["balance"] === "number" ? reaisToCents(e["balance"]) : null,
      }));
  } else {
    logger.error("getCompanyFinance: extrato do Asaas indisponível", statementRes.reason);
    book.markAsaasFeesUnknown();
    warnings.push("Extrato do Asaas indisponível: as tarifas aparecem como “—”.");
  }

  if (subscriptionsRes.status === "fulfilled") {
    subscriptionsRes.value.flat().forEach((p) => addArenaSubscriptionPayment(book, p));
  } else {
    logger.error("getCompanyFinance: cobranças das assinaturas indisponíveis", subscriptionsRes.reason);
    warnings.push("Cobranças das assinaturas das arenas indisponíveis: “Planos das arenas” pode estar incompleto.");
  }

  // ── quem guarda dinheiro ──
  const rows: Omit<Holder, "name">[] = [
    ...tWallets.docs.map((d) => ({kind: "torneio" as const, id: d.id, ...holdingOf(d.data())})),
    ...aWallets.docs.map((d) => ({kind: "arena" as const, id: d.id, ...holdingOf(d.data())})),
    ...oWallets.docs.map((d) => ({kind: "organizador" as const, id: d.id, ...holdingOf(d.data())})),
    ...pWallets.docs.map((d) => ({kind: "professor" as const, id: d.id, ...holdingOf(d.data())})),
  ]
    .map(({kind, id, availableCents, pendingCents}) => ({kind, id, availableCents, pendingCents}))
    .filter((h) => h.availableCents + h.pendingCents > 0)
    .sort((a, b) => b.availableCents + b.pendingCents - (a.availableCents + a.pendingCents))
    .slice(0, TOP_HOLDERS);
  const byKind = (k: HolderKind) => rows.filter((r) => r.kind === k).map((r) => r.id);
  const [tNames, aNames, uNames] = await Promise.all([
    namesOf(db, "tournaments", byKind("torneio")),
    namesOf(db, "arenas", byKind("arena")),
    namesOf(db, "users", [...byKind("organizador"), ...byKind("professor")]),
  ]);
  const holders: Holder[] = rows.map((r) => ({
    ...r,
    name: (r.kind === "torneio" ? tNames : r.kind === "arena" ? aNames : uNames).get(r.id) ?? null,
  }));

  const pendingOf = (docs: readonly {data(): DocumentData}[]) => {
    const waiting = docs.filter((d) => d.data()["status"] === "pending");
    return {count: waiting.length, cents: waiting.reduce((s, d) => s + reaisToCents(d.data()["amountReais"]), 0)};
  };
  const stuckWithdrawals = ([
    ["organizador", orgWithdrawals.docs],
    ["arena", arenaWithdrawals.docs],
    ["professor", profWithdrawals.docs],
  ] as const).flatMap(([kind, docs]) => docs
    .filter((d) => isStuckWithdrawal(d.data()))
    .map((d) => {
      const w = d.data();
      const at = w["reviewedAt"] ?? w["createdAt"];
      return {
        kind,
        id: d.id,
        amountCents: reaisToCents(w["amountReais"]),
        payoutStatus: String(w["payoutStatus"]),
        approvedAt: typeof at?.toDate === "function" ? (at.toDate() as Date).toISOString() : null,
      };
    }));

  return {
    month,
    generatedAt: new Date().toISOString(),
    balance: balanceSummary(asaasCents, thirdPartyCents, provisionsCents),
    thirdParty,
    awaitingCents: Object.values(thirdParty).reduce((s, h) => s + h.awaitingCents, 0),
    provisions,
    holders,
    pendingWithdrawals: {
      organizer: pendingOf(orgWithdrawals.docs),
      arena: pendingOf(arenaWithdrawals.docs),
      professor: pendingOf(profWithdrawals.docs),
    },
    stuckWithdrawals,
    months: book.result(),
    statement: {available: statementRes.status === "fulfilled", entries: statement},
    warnings,
  };
}

export const getCompanyFinance = onCall(
  {region: CLIENT_FACING_REGIONS, invoker: "public", secrets: asaasArenaSecrets, timeoutSeconds: 120, memory: "512MiB"},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    await assertBackofficeAdmin(uid);
    const requested = (request.data as {month?: unknown} | undefined)?.month;
    const month = isMonthKey(requested) ? requested : monthKeyOf(new Date());
    return loadCompanyFinance(getFirestore(), month, {get: (path) => fetchAsaas(path)});
  },
);
