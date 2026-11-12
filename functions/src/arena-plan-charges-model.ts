/**
 * Mensalidade do plano da arena (Starter/Pro/Elite) — regras puras.
 *
 * A assinatura do plano é recorrente no Asaas: no cartão a renovação é cobrada
 * sozinha; no Pix o Asaas só GERA a cobrança do ciclo seguinte. Como o cliente
 * da arena no Asaas tem `notificationDisabled: true`, ninguém avisava a arena,
 * a cobrança vencia e o plano caía depois da carência de 7 dias. Aqui ficam:
 *  - qual cobrança está "em aberto" para a arena pagar (`pickOpenPlanCharge`);
 *  - em que dia mandar cada lembrete (`planChargeReminderStage`);
 *  - o texto do lembrete (`planChargeReminderMessage`);
 *  - até quando um pagamento confirmado garante o plano (`planActiveUntilAfterPayment`).
 */
import type {BillingCycle} from "./arena-plans";

/** Pagamento como o Asaas devolve em `/v3/subscriptions/{id}/payments`. */
export type AsaasSubscriptionPayment = {
  id?: string;
  status?: string;
  value?: number;
  dueDate?: string;
  billingType?: string;
  invoiceUrl?: string;
  deleted?: boolean;
};

export type OpenPlanChargeStatus = "PENDING" | "OVERDUE";

export interface OpenPlanCharge {
  paymentId: string;
  status: OpenPlanChargeStatus;
  /** Vencimento YYYY-MM-DD (fuso de São Paulo, como o Asaas grava). */
  dueDate: string;
  valueCents: number;
  /** `PIX`, `CREDIT_CARD`, `BOLETO` ou `UNDEFINED` (cliente escolhe na fatura). */
  billingType: string;
  invoiceUrl: string | null;
}

/** Dias de carência depois do vencimento (espelha `OVERDUE_GRACE_MS`). */
export const PLAN_OVERDUE_GRACE_DAYS = 7;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A cobrança que a arena precisa pagar agora, ou `null`.
 *
 * - Pix/boleto/indefinido: pendente ou vencida (dá para pagar adiantado).
 * - Cartão pendente NÃO entra: o Asaas cobra sozinho no vencimento. Cartão
 *   vencido entra (o cartão recusou e a arena paga pela fatura).
 * Com mais de uma, a de vencimento mais antigo primeiro.
 */
export function pickOpenPlanCharge(payments: AsaasSubscriptionPayment[]): OpenPlanCharge | null {
  const open: OpenPlanCharge[] = [];
  for (const p of payments) {
    const id = p.id?.trim() ?? "";
    const status = (p.status ?? "").trim().toUpperCase();
    const dueDate = p.dueDate?.trim() ?? "";
    const billingType = (p.billingType ?? "UNDEFINED").trim().toUpperCase() || "UNDEFINED";
    if (!id || p.deleted || !DAY_KEY.test(dueDate)) continue;
    if (status !== "PENDING" && status !== "OVERDUE") continue;
    if (billingType === "CREDIT_CARD" && status === "PENDING") continue;
    open.push({
      paymentId: id,
      status,
      dueDate,
      valueCents: Math.round((typeof p.value === "number" ? p.value : 0) * 100),
      billingType,
      invoiceUrl: p.invoiceUrl?.trim() || null,
    });
  }
  open.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return open[0] ?? null;
}

function dayNumber(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

/** `b - a` em dias de calendário (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round(dayNumber(b) - dayNumber(a));
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const ms = (dayNumber(dayKey) + days) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Soma um ciclo do plano; dia 31 num mês de 30 cai no último dia do mês. */
export function addCycleToDayKey(dayKey: string, cycle: BillingCycle): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const months = cycle === "yearly" ? 12 : 1;
  const targetMonthIndex = (m! - 1) + months;
  const ty = y! + Math.floor(targetMonthIndex / 12);
  const tm = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d!, lastDay);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

/**
 * Até quando um pagamento confirmado garante o plano: vencimento dele + 1 ciclo.
 *
 * Antes era o `nextDueDate` da assinatura, que já aponta para DEPOIS da
 * próxima cobrança quando o Asaas gera a cobrança seguinte adiantado — a arena
 * ganhava um ciclo a mais de carência sem pagar.
 */
export function planActiveUntilAfterPayment(
  paymentDueDate: string | undefined,
  cycle: BillingCycle,
): string | null {
  const due = paymentDueDate?.trim() ?? "";
  if (!DAY_KEY.test(due)) return null;
  return addCycleToDayKey(due, cycle);
}

export type PlanChargeReminderStage = "due_soon" | "due_today" | "overdue" | "last_call";

/**
 * Lembrete do dia para a cobrança em aberto, ou `null` (dia sem lembrete).
 *
 * O plano fica até o 6º dia depois do vencimento (cai no 7º, às 3h). Avisos:
 * 3 dias antes, no dia, 1 dia depois e 5 dias depois (último aviso, véspera do
 * último dia). Cartão pendente nunca chega aqui (`pickOpenPlanCharge`).
 */
export function planChargeReminderStage(
  charge: Pick<OpenPlanCharge, "dueDate">,
  todayKey: string,
): PlanChargeReminderStage | null {
  const daysToDue = daysBetween(todayKey, charge.dueDate);
  if (daysToDue === 3) return "due_soon";
  if (daysToDue === 0) return "due_today";
  if (daysToDue === -1) return "overdue";
  if (daysToDue === -(PLAN_OVERDUE_GRACE_DAYS - 2)) return "last_call";
  return null;
}

/** Chave de dedup: no máximo um aviso de cada tipo por cobrança. */
export function planChargeReminderKey(paymentId: string, stage: PlanChargeReminderStage): string {
  return `${paymentId}:${stage}`;
}

function brl(cents: number): string {
  const reais = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, "0");
  return `R$ ${reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}

function dm(dayKey: string): string {
  return `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;
}

/** Último dia em que o plano ainda vale com a cobrança em atraso. */
export function lastEntitledDay(dueDate: string): string {
  return addDaysToDayKey(dueDate, PLAN_OVERDUE_GRACE_DAYS - 1);
}

export function planChargeReminderMessage(
  stage: PlanChargeReminderStage,
  charge: Pick<OpenPlanCharge, "dueDate" | "valueCents" | "billingType">,
  planName: string,
): {title: string; body: string} {
  const plan = `plano ${planName}`;
  const value = brl(charge.valueCents);
  const until = dm(lastEntitledDay(charge.dueDate));
  const card = charge.billingType === "CREDIT_CARD";
  switch (stage) {
  case "due_soon":
    return {
      title: `Mensalidade do ${plan} vence em 3 dias`,
      body: `${value} vence em ${dm(charge.dueDate)}. Pague pelo Pix em Planos para manter o ${planName} ativo.`,
    };
  case "due_today":
    return {
      title: `Mensalidade do ${plan} vence hoje`,
      body: `${value}. Pague pelo Pix em Planos para manter o ${planName} ativo.`,
    };
  case "overdue":
    return {
      title: card ? `O cartão não passou na mensalidade do ${plan}` : `Mensalidade do ${plan} venceu`,
      body: card ?
        `A cobrança de ${value} foi recusada. Pague em Planos até ${until} para não perder o ${planName}.` :
        `A cobrança de ${value} venceu em ${dm(charge.dueDate)}. Pague em Planos até ${until} para não perder o ${planName}.`,
    };
  case "last_call":
    return {
      title: `Último aviso: o ${plan} será suspenso`,
      body: `A mensalidade de ${value} segue em aberto. Pague em Planos até amanhã (${until}) para manter o ${planName}.`,
    };
  }
}
