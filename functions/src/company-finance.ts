/**
 * Financeiro da empresa (backoffice › Financeiro): de quem é cada real na conta do Asaas e o
 * resultado da NexaGO mês a mês. Só regra pura aqui — a leitura do Firestore e do Asaas fica em
 * `backoffice-company-finance.ts`.
 *
 * Receita = o que a plataforma fica de cada fonte, pela data em que o dinheiro entrou (São Paulo):
 * - torneios, quadras, aulas, planos de horário e clubinho: `platformFeeReais` (+ `serviceFeeReais`
 *   no torneio) das linhas `credit` dos extratos dos caixas;
 * - planos das arenas: cobranças pagas da assinatura no Asaas (com a adesão);
 * - tarifas de saque de arena (`feeReais`); loja (venda própria: total pago menos o devolvido);
 * - professores e centros de treino: 5% do split, estimado (a taxa não fica gravada);
 * - planos NexaGO: sinal e saldo marcados à mão no contrato.
 * Deduções = o que a NexaGO banca dentro das vendas: cashback usado, desconto e comissão do Squad.
 * Custos = tarifas do extrato do Asaas (menos as repassadas a organizadores/arenas e as pagas pelo
 * atleta por cima), compras de estoque da loja e os custos cadastrados (mensais).
 *
 * Tudo em centavos.
 */

export const REVENUE_SOURCES = [
  "torneios", "quadras", "aulas", "horarios", "clubinho", "planosArena",
  "saques", "loja", "professores", "centros", "planosNexago",
] as const;
export type RevenueSource = typeof REVENUE_SOURCES[number];

export const DEDUCTIONS = ["cashback", "squadDiscount", "squadCommission"] as const;
export type Deduction = typeof DEDUCTIONS[number];

/** Split do professor e do centro de treino: a plataforma fica com 5% (padrão do código). */
export const SPLIT_FEE_PERCENT = 5;

type Raw = Record<string, unknown>;

export interface MonthResult {
  key: string;
  revenue: Record<RevenueSource, number>;
  deductions: Record<Deduction, number>;
  /** Tarifas do extrato do Asaas; `null` = extrato indisponível. */
  asaasFees: number | null;
  /** Tarifas que voltaram: repassadas a organizador/arena ou pagas pelo atleta por cima. */
  feesRecovered: number;
  stockPurchases: number;
  operatingCosts: number;
}

export interface Holding {
  availableCents: number;
  pendingCents: number;
  /** Cartão aprovado ainda não liquidado: não está no saldo do Asaas. */
  awaitingCents: number;
  count: number;
}

export const EMPTY_HOLDING: Holding = {availableCents: 0, pendingCents: 0, awaitingCents: 0, count: 0};

// ── leitura de campos ───────────────────────────────────────────────────────

export function reaisToCents(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0;
}

export function intCents(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Timestamp do Firestore, Date ou `YYYY-MM-DD` (data civil, lida ao meio-dia em SP). */
export function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (v && typeof (v as {toDate?: unknown}).toDate === "function") return (v as {toDate(): Date}).toDate();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(`${v.slice(0, 10)}T12:00:00-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ── mês civil de São Paulo ─────────────────────────────────────────────────

export function monthKeyOf(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit"})
    .format(date)
    .slice(0, 7);
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** `count` meses terminando em `endKey`, do mais antigo para o mais novo. */
export function monthWindow(endKey: string, count: number): string[] {
  return Array.from({length: count}, (_, i) => shiftMonth(endKey, i - count + 1));
}

/** Primeiro e último dia (civis) da janela, para o extrato do Asaas. */
export function windowDates(keys: readonly string[]): {start: string; finish: string} {
  const last = keys[keys.length - 1];
  const [y, m] = last.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {start: `${keys[0]}-01`, finish: `${last}-${String(lastDay).padStart(2, "0")}`};
}

// ── livro do período ───────────────────────────────────────────────────────

/** Acumula valores por mês; o que cai fora da janela é ignorado. */
export class FinanceBook {
  private readonly months = new Map<string, MonthResult>();

  constructor(readonly keys: readonly string[], operatingCostsCents: number) {
    for (const key of keys) {
      this.months.set(key, {
        key,
        revenue: Object.fromEntries(REVENUE_SOURCES.map((s) => [s, 0])) as Record<RevenueSource, number>,
        deductions: Object.fromEntries(DEDUCTIONS.map((d) => [d, 0])) as Record<Deduction, number>,
        asaasFees: 0,
        feesRecovered: 0,
        stockPurchases: 0,
        operatingCosts: operatingCostsCents,
      });
    }
  }

  private at(date: Date | null): MonthResult | undefined {
    return date ? this.months.get(monthKeyOf(date)) : undefined;
  }

  revenue(source: RevenueSource, date: Date | null, cents: number): void {
    const m = this.at(date);
    if (m && cents) m.revenue[source] += cents;
  }

  deduction(kind: Deduction, date: Date | null, cents: number): void {
    const m = this.at(date);
    if (m && cents) m.deductions[kind] += cents;
  }

  asaasFee(date: Date | null, cents: number): void {
    const m = this.at(date);
    if (m && m.asaasFees !== null && cents) m.asaasFees += cents;
  }

  feeRecovered(date: Date | null, cents: number): void {
    const m = this.at(date);
    if (m && cents) m.feesRecovered += cents;
  }

  stockPurchase(date: Date | null, cents: number): void {
    const m = this.at(date);
    if (m && cents) m.stockPurchases += cents;
  }

  /** Extrato indisponível: a tarifa vira "—", não zero. */
  markAsaasFeesUnknown(): void {
    for (const m of this.months.values()) m.asaasFees = null;
  }

  result(): MonthResult[] {
    return this.keys.map((k) => this.months.get(k)!);
  }
}

// ── fontes ─────────────────────────────────────────────────────────────────

/** Linha do extrato do caixa do torneio: taxa (organizador + atleta) e o que a NexaGO bancou. */
export function addTournamentLedgerLine(book: FinanceBook, raw: Raw): void {
  if (raw["type"] !== "credit") return;
  const date = dateOf(raw["createdAt"]);
  book.revenue("torneios", date, reaisToCents(raw["platformFeeReais"]) + reaisToCents(raw["serviceFeeReais"]));
  addSharedLedgerCosts(book, date, raw);
}

const ARENA_SOURCE: Record<string, RevenueSource> = {
  class: "aulas",
  schedule_plan: "horarios",
  club: "clubinho",
};

/** Linha do extrato da carteira da arena; `source` ausente = aluguel de quadra. */
export function addArenaLedgerLine(book: FinanceBook, raw: Raw): void {
  if (raw["type"] !== "credit") return;
  const date = dateOf(raw["createdAt"]);
  const source = ARENA_SOURCE[text(raw["source"]) ?? ""] ?? "quadras";
  book.revenue(source, date, reaisToCents(raw["platformFeeReais"]));
  addSharedLedgerCosts(book, date, raw);
}

function addSharedLedgerCosts(book: FinanceBook, date: Date | null, raw: Raw): void {
  book.deduction("cashback", date, reaisToCents(raw["cashbackAppliedReais"]));
  book.deduction("squadDiscount", date, reaisToCents(raw["squadDiscountReais"]));
  book.feeRecovered(date, reaisToCents(raw["gatewayFeeReais"]) + reaisToCents(raw["cardFeeReais"]));
}

/** Pagamento da assinatura de plano da arena (cobrança do Asaas). */
export function addArenaSubscriptionPayment(book: FinanceBook, payment: Raw): void {
  const status = text(payment["status"]);
  if (status !== "RECEIVED" && status !== "CONFIRMED" && status !== "RECEIVED_IN_CASH") return;
  const date = dateOf(payment["paymentDate"]) ?? dateOf(payment["confirmedDate"]) ?? dateOf(payment["clientPaymentDate"]);
  book.revenue("planosArena", date, reaisToCents(payment["value"]));
}

const PAID_WITHDRAWAL = new Set(["approved", "approved_manual", "paid"]);

/** Tarifa de saque da arena (Elite é isenta): é receita quando o saque sai. */
export function addArenaWithdrawal(book: FinanceBook, raw: Raw): void {
  if (!PAID_WITHDRAWAL.has(text(raw["status"]) ?? "")) return;
  const date = dateOf(raw["paidAt"]) ?? dateOf(raw["reviewedAt"]) ?? dateOf(raw["createdAt"]);
  book.revenue("saques", date, reaisToCents(raw["feeReais"]));
}

/** Pedido da loja (venda própria): total pago menos o devolvido; o cashback usado é dedução. */
export function addStoreOrder(book: FinanceBook, raw: Raw): void {
  const date = dateOf(raw["paidAt"]);
  if (!date) return;
  book.revenue("loja", date, Math.max(0, intCents(raw["totalCents"]) - intCents(raw["refundedCents"])));
  book.deduction("cashback", date, intCents(raw["walletCents"]));
}

/** Entrada de estoque por compra: custo das peças com o frete rateado. */
export function addStockEntry(book: FinanceBook, raw: Raw): void {
  if (raw["type"] !== "entrada" || raw["subtype"] !== "compra" || raw["status"] === "cancelada") return;
  const items = Array.isArray(raw["items"]) ? (raw["items"] as Raw[]) : [];
  const cents = items.reduce((sum, i) => {
    const unit = intCents(i?.["unitCostWithFreightCents"]) || intCents(i?.["unitCostCents"]);
    return sum + Math.max(0, intCents(i?.["qty"])) * unit;
  }, 0);
  book.stockPurchase(dateOf(raw["createdAt"]), cents);
}

/**
 * Cobrança do professor independente: o split manda 95% do líquido do Asaas para a subconta e a
 * plataforma fica com o resto. Só o líquido do professor é gravado, então a taxa sai dele.
 */
export function professorChargeFeeCents(raw: Raw): number {
  if (raw["status"] !== "paid") return 0;
  const pct = typeof raw["feePercent"] === "number" && raw["feePercent"] > 0 && raw["feePercent"] < 100 ?
    raw["feePercent"] : SPLIT_FEE_PERCENT;
  const net = reaisToCents(raw["netReais"]);
  if (net > 0) return Math.round((net / (100 - pct)) * pct);
  return Math.round((reaisToCents(raw["amountReais"]) * pct) / 100);
}

export function addProfessorCharge(book: FinanceBook, raw: Raw): void {
  book.revenue("professores", dateOf(raw["paidAt"]), professorChargeFeeCents(raw));
}

/** Fatura de centro de treino aprovada: % do split sobre o valor (padrão 5%). */
export function addCenterInvoice(book: FinanceBook, raw: Raw, feePercent: number | null): void {
  if (raw["status"] !== "approved") return;
  const pct = feePercent != null && feePercent > 0 && feePercent < 100 ? feePercent : SPLIT_FEE_PERCENT;
  book.revenue("centros", dateOf(raw["approvedAt"]), Math.round((intCents(raw["amountCents"]) * pct) / 100));
}

/** Contrato de plano NexaGO: o sinal na data em que foi marcado; o saldo (ou o valor cheio) no pago. */
export function addPlanContract(book: FinanceBook, raw: Raw): void {
  const depositAt = dateOf(raw["depositPaidAt"]);
  const paidAt = dateOf(raw["paidAt"]);
  if (depositAt) book.revenue("planosNexago", depositAt, intCents(raw["depositCents"]));
  if (paidAt) {
    book.revenue("planosNexago", paidAt, depositAt ? intCents(raw["balanceCents"]) : intCents(raw["priceCents"]));
  }
}

/** Comissão do embaixador: custo quando o pagamento é confirmado (liberada) ou já repassada. */
export function addSquadCommission(book: FinanceBook, raw: Raw): void {
  const status = raw["status"];
  if (status !== "released" && status !== "paid") return;
  book.deduction("squadCommission", dateOf(raw["releasedAt"]) ?? dateOf(raw["paidAt"]), intCents(raw["amountCents"]));
}

/** Lançamento do extrato do Asaas: toda tarifa é débito com `FEE` no tipo. */
export function isAsaasFeeEntry(entry: Raw): boolean {
  const type = text(entry["type"]) ?? "";
  return type.includes("FEE") && typeof entry["value"] === "number" && entry["value"] < 0;
}

export function addAsaasStatementEntry(book: FinanceBook, entry: Raw): void {
  if (!isAsaasFeeEntry(entry)) return;
  book.asaasFee(dateOf(entry["date"]), -reaisToCents(entry["value"]));
}

// ── totais do mês ──────────────────────────────────────────────────────────

export function revenueTotal(m: MonthResult): number {
  return REVENUE_SOURCES.reduce((s, k) => s + m.revenue[k], 0);
}

export function deductionsTotal(m: MonthResult): number {
  return DEDUCTIONS.reduce((s, k) => s + m.deductions[k], 0);
}

/** Tarifas do Asaas bancadas pela NexaGO (extrato − recuperadas); sem extrato, 0. */
export function asaasNetCost(m: MonthResult): number {
  return m.asaasFees === null ? 0 : m.asaasFees - m.feesRecovered;
}

export function costsTotal(m: MonthResult): number {
  return asaasNetCost(m) + m.stockPurchases + m.operatingCosts;
}

export function monthResult(m: MonthResult): number {
  return revenueTotal(m) - deductionsTotal(m) - costsTotal(m);
}

// ── saldo ──────────────────────────────────────────────────────────────────

/** Carteira com saldo em reais (`availableReais`, `pendingReais`, `awaitingSettlementReais`). */
export function holdingOf(raw: Raw): Holding {
  return {
    availableCents: reaisToCents(raw["availableReais"]),
    pendingCents: reaisToCents(raw["pendingReais"]),
    awaitingCents: reaisToCents(raw["awaitingSettlementReais"]),
    count: 1,
  };
}

export function addHolding(a: Holding, b: Holding): Holding {
  return {
    availableCents: a.availableCents + b.availableCents,
    pendingCents: a.pendingCents + b.pendingCents,
    awaitingCents: a.awaitingCents + b.awaitingCents,
    count: a.count + b.count,
  };
}

/** O que está na conta e é de terceiros: disponível + reservado para saque (o "a liberar" não). */
export function inAccountCents(h: Holding): number {
  return h.availableCents + h.pendingCents;
}

/** Devolução da loja ainda não feita: `refunds[]` e `settlement` com `status: pendente`. */
export function pendingStoreRefundCents(order: Raw): number {
  const refunds = Array.isArray(order["refunds"]) ? (order["refunds"] as Raw[]) : [];
  return refunds
    .filter((r) => r?.["status"] === "pendente" && r?.["destination"] !== "saldo")
    .reduce((s, r) => s + Math.max(0, intCents(r["amountCents"])), 0);
}

export function pendingReturnSettlementCents(ret: Raw): number {
  const s = (ret["settlement"] ?? null) as Raw | null;
  if (!s || s["status"] !== "pendente" || s["type"] !== "reembolso") return 0;
  return Math.max(0, intCents(s["amountCents"]));
}

export interface BalanceSummary {
  asaasCents: number | null;
  thirdPartyCents: number;
  provisionsCents: number;
  /** Saldo no Asaas − terceiros; `null` sem o saldo do Asaas. */
  companyCents: number | null;
  /** Saldo da NexaGO − provisões. */
  freeCents: number | null;
}

export function balanceSummary(asaasCents: number | null, thirdPartyCents: number, provisionsCents: number): BalanceSummary {
  const companyCents = asaasCents === null ? null : asaasCents - thirdPartyCents;
  return {
    asaasCents,
    thirdPartyCents,
    provisionsCents,
    companyCents,
    freeCents: companyCents === null ? null : companyCents - provisionsCents,
  };
}
