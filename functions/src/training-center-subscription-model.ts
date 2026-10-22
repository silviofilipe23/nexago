/**
 * Cobrança recorrente das mensalidades do Centro de Treinamento — lógica pura (datas como parede
 * 'YYYY-MM-DD', sem fuso; o "hoje" vem de quem chama, já no fuso do centro).
 *
 * Uma assinatura (`trainingCenters/{c}/subscriptions/{enrollmentId}`) por matrícula MENSAL ativa.
 * Cada ciclo vira uma cobrança com id fixo `sub_{enrollmentId}_{YYYY-MM}` — gerar de novo o mesmo
 * ciclo não cria segunda cobrança.
 */

type Data = Record<string, unknown>;

export const GENERATE_DAYS_BEFORE = 3;

export interface BillingPolicies {
  /** `fixed`: todos vencem no `billingDay`; `enrollment`: no dia em que o aluno entrou. */
  billingDayMode: "fixed" | "enrollment";
  billingDay: number;
  firstMonth: "prorata" | "full";
  lateFees: boolean;
  /** Dias de atraso até o check-in mostrar pendência (0 = nunca). */
  blockAfterDays: number;
  suspendAfterDays: number;
  suspendAction: "suspend" | "notify";
}

export const DEFAULT_BILLING: BillingPolicies = {
  billingDayMode: "fixed",
  billingDay: 5,
  firstMonth: "prorata",
  lateFees: true,
  blockAfterDays: 20,
  suspendAfterDays: 45,
  suspendAction: "suspend",
};

export function readBilling(policies: unknown): BillingPolicies {
  const p = policies && typeof policies === "object" ? (policies as Data) : {};
  const n = (k: keyof BillingPolicies, min: number, max: number) => {
    const v = p[k];
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : (DEFAULT_BILLING[k] as number);
  };
  return {
    billingDayMode: p["billingDayMode"] === "enrollment" ? "enrollment" : "fixed",
    billingDay: n("billingDay", 1, 28),
    firstMonth: p["firstMonth"] === "full" ? "full" : "prorata",
    lateFees: p["lateFees"] !== false,
    blockAfterDays: n("blockAfterDays", 0, 90),
    suspendAfterDays: n("suspendAfterDays", 0, 180),
    suspendAction: p["suspendAction"] === "notify" ? "notify" : "suspend",
  };
}

function parse(day: string): {y: number; m: number; d: number} {
  const [y, m, d] = day.split("-").map(Number);
  return {y: y!, m: m!, d: d!};
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(day: string, n: number): string {
  const {y, m, d} = parse(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function daysBetween(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Mesmo dia de vencimento N meses depois (dia 31 em fevereiro cai no último dia do mês). */
export function shiftMonths(day: string, n: number, billingDay: number): string {
  const {y, m} = parse(day);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const yy = t.getUTCFullYear();
  const mm = t.getUTCMonth() + 1;
  return fmt(yy, mm, Math.min(billingDay, daysInMonth(yy, mm)));
}

/** Dia de vencimento da assinatura (até 28, para todo mês ter). */
export function billingDayFor(b: BillingPolicies, startDate: string): number {
  return b.billingDayMode === "enrollment" ? Math.min(parse(startDate).d, 28) : b.billingDay;
}

/** Primeiro vencimento DEPOIS da contratação (o 1º mês é a cobrança da matrícula). */
export function firstChargeAfter(startDate: string, billingDay: number): string {
  const {y, m, d} = parse(startDate);
  const sameMonth = fmt(y, m, Math.min(billingDay, daysInMonth(y, m)));
  return d < billingDay ? sameMonth : shiftMonths(startDate, 1, billingDay);
}

/**
 * Proporcional do 1º mês com vencimento fixo: os dias da contratação até o 1º vencimento sobre o
 * tamanho do ciclo. Mês cheio quando a política manda ou quando o vencimento é pela data da
 * matrícula (aí o ciclo já começa no dia).
 */
export function firstInvoiceCents(priceCents: number, b: BillingPolicies, startDate: string): {cents: number; prorated: boolean; days: number; cycleDays: number} {
  const day = billingDayFor(b, startDate);
  const next = firstChargeAfter(startDate, day);
  const prev = shiftMonths(next, -1, day);
  const cycleDays = daysBetween(prev, next);
  const days = daysBetween(startDate, next);
  if (b.firstMonth === "full" || b.billingDayMode === "enrollment" || days >= cycleDays) {
    return {cents: priceCents, prorated: false, days: cycleDays, cycleDays};
  }
  return {cents: Math.round((priceCents * days) / cycleDays), prorated: true, days, cycleDays};
}

/**
 * Mudar de plano no meio do ciclo: diferença de preço pelos dias que faltam até o próximo
 * vencimento. Downgrade não devolve (vale no próximo ciclo).
 */
export function planChangeProration(oldCents: number, newCents: number, today: string, nextCharge: string, billingDay: number): {cents: number; days: number; cycleDays: number} {
  const prev = shiftMonths(nextCharge, -1, billingDay);
  const cycleDays = daysBetween(prev, nextCharge);
  const days = Math.max(0, Math.min(cycleDays, daysBetween(today, nextCharge)));
  const cents = Math.max(0, Math.round(((newCents - oldCents) * days) / cycleDays));
  return {cents, days, cycleDays};
}

export function cycleKey(dueDate: string): string {
  return dueDate.slice(0, 7);
}

export function cycleInvoiceId(enrollmentId: string, cycle: string): string {
  return `sub_${enrollmentId}_${cycle}`;
}

/** Régua: 0 nada · 1 D+1 não aprovado · 2 D+7 lembrete · 3 D+15 aviso de bloqueio · 4 bloqueio · 5 suspensão. */
export type DunningStage = 0 | 1 | 2 | 3 | 4 | 5;

export function dunningStage(daysLate: number, b: BillingPolicies): DunningStage {
  if (daysLate < 1) return 0;
  if (b.suspendAfterDays > 0 && daysLate >= b.suspendAfterDays) return 5;
  if (b.blockAfterDays > 0 && daysLate >= b.blockAfterDays) return 4;
  if (b.blockAfterDays > 0 && daysLate >= Math.max(1, b.blockAfterDays - 5)) return 3;
  if (daysLate >= 7) return 2;
  return 1;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "05/11" para os avisos. */
export function shortDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

export function cycleLabel(cycle: string): string {
  return MONTHS[Number(cycle.slice(5, 7)) - 1] ?? cycle;
}

function dueInLabel(days: number): string {
  if (days <= 0) return "vence hoje";
  return days === 1 ? "vence amanhã" : `vence em ${days} dias`;
}

/** Texto do aviso ao pagador por estágio (stage 0 = lembrete D−3). */
export function dunningNotice(stage: DunningStage, ctx: {centerName: string; cycle: string; amount: string; blockDay: string | null; dueIn?: number; link?: boolean}): {title: string; body: string} {
  const n = dunningText(stage, ctx);
  // Sem fatura no provedor (recebimento não conectado): não há link — o aluno paga no centro.
  return ctx.link === false ? {title: n.title, body: n.body.replace(/ Toque para pagar[^.]*\.| Pague pelo link[^.]*\./, " Combine o pagamento com o centro.")} : n;
}

function dunningText(stage: DunningStage, ctx: {centerName: string; cycle: string; amount: string; blockDay: string | null; dueIn?: number}): {title: string; body: string} {
  const mes = cycleLabel(ctx.cycle);
  const ct = ctx.centerName || "seu centro";
  switch (stage) {
    case 0:
      return {title: `Mensalidade de ${mes} · ${ctx.amount}`, body: `${ct}: a mensalidade ${dueInLabel(ctx.dueIn ?? GENERATE_DAYS_BEFORE)}. Toque para pagar com Pix ou cartão.`};
    case 1:
      return {title: `Mensalidade de ${mes} em aberto`, body: `Ainda não identificamos o pagamento de ${ctx.amount} para ${ct}. Toque para pagar.`};
    case 2:
      return {title: `Lembrete · mensalidade de ${mes}`, body: `${ctx.amount} em aberto com ${ct}. Pague pelo link para continuar treinando.`};
    case 3:
      return {title: "Check-in vai ser bloqueado", body: `A mensalidade de ${mes} (${ctx.amount}) segue em aberto. ${ctx.blockDay ? `O check-in bloqueia em ${ctx.blockDay}.` : ""}`.trim()};
    case 4:
      return {title: "Check-in bloqueado por pendência", body: `${ct}: a mensalidade de ${mes} (${ctx.amount}) está em aberto. Regularize para voltar a treinar.`};
    default:
      return {title: "Matrícula suspensa", body: `${ct} suspendeu a matrícula por falta de pagamento de ${mes}. A vaga foi liberada; fale com o centro para voltar.`};
  }
}

/** Pacote vencido (validade em dias a partir da contratação) ou sem crédito. */
export function packFinished(contract: Data | undefined, creditsLeft: unknown, today: string): "expired" | "used" | null {
  if (!contract || contract["planType"] !== "class_pack") return null;
  const validity = Number(contract["validityDays"] ?? 0);
  const from = typeof contract["contractedAt"] === "string" ? (contract["contractedAt"] as string) : "";
  if (validity > 0 && from && addDays(from, validity) < today) return "expired";
  if (typeof creditsLeft === "number" && creditsLeft <= 0) return "used";
  return null;
}
