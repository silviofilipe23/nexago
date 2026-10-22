/**
 * Cobrança online do Centro de Treinamento (portal `frontend/projects/center`) — modelo puro,
 * sem Asaas e sem I/O.
 *
 * A cobrança é `trainingCenters/{c}/invoices/{id}` (o portal cria, sempre `pending`). Daqui só
 * sai o que o servidor decide:
 * - gerar a cobrança no Asaas (fatura hospedada: Pix ou cartão) com split para a conta de
 *   recebimento do centro (`trainingCenterReceiving/{c}`, só servidor) → `providerRef`;
 * - o webhook/consulta aprova (`approved` + evento) e ativa a matrícula pendente ligada;
 * - a varredura libera a vaga de reserva vencida e consulta o provedor das pendentes.
 *
 * Regra de ouro: nada é dado como pago porque a cobrança foi emitida — recebido = só aprovado.
 */

export const TRAINING_CENTERS = "trainingCenters";
/** Conta de recebimento do centro (walletId Asaas). Rules negam tudo: só o Admin SDK escreve. */
export const TRAINING_CENTER_RECEIVING = "trainingCenterReceiving";
/** Cliente Asaas por pagador do centro (CPF informado no portal). Só servidor. */
export const TRAINING_CENTER_PAYERS = "trainingCenterPayers";
export const CENTER_INVOICE_REF_PREFIX = "trainingCenterInvoice:";

/** Taxa NexaGO sobre a cobrança online do centro (o resto vai pelo split para o centro). */
export const CENTER_CHARGE_FEE_PERCENT = 5;
/** Primeira consulta ao provedor 2h depois de gerar; depois a cada 2h no 1º dia e 12h dali em diante. */
export const PROVIDER_FIRST_CHECK_MS = 2 * 60 * 60_000;
export const PROVIDER_LATER_CHECK_MS = 12 * 60 * 60_000;

export const SYSTEM_ACTOR = "NexaGO";

export type CenterInvoiceEventType = "provider" | "webhook" | "duplicate" | "query" | "refund" | "cancel" | "note";

export interface CenterInvoiceEvent {
  at: unknown;
  type: CenterInvoiceEventType;
  title: string;
  detail: string;
  byName: string;
}

export function centerInvoiceRef(centerId: string, invoiceId: string): string {
  return `${CENTER_INVOICE_REF_PREFIX}${centerId}:${invoiceId}`;
}

function cleanId(id: string): boolean {
  return id.length > 0 && !id.includes("/") && !id.includes(":");
}

export function parseCenterInvoiceRef(ref: string): {centerId: string; invoiceId: string} | null {
  if (!ref.startsWith(CENTER_INVOICE_REF_PREFIX)) return null;
  const parts = ref.slice(CENTER_INVOICE_REF_PREFIX.length).trim().split(":");
  if (parts.length !== 2) return null;
  const [centerId, invoiceId] = parts as [string, string];
  return cleanId(centerId) && cleanId(invoiceId) ? {centerId, invoiceId} : null;
}

export type ProviderOutcome = "paid" | "refunded" | "disputed" | "deleted" | "overdue" | "waiting";

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
const DISPUTED = new Set([
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_REQUESTED",
  "DUNNING_RECEIVED",
]);

/** O que o status do Asaas significa para a cobrança do centro. */
export function providerOutcome(status: string, deleted: boolean): ProviderOutcome {
  const s = status.trim().toUpperCase();
  if (deleted) return "deleted";
  if (PAID.has(s)) return "paid";
  if (s === "REFUNDED" || s === "REFUND_REQUESTED") return "refunded";
  if (DISPUTED.has(s)) return "disputed";
  if (s === "OVERDUE") return "overdue";
  return "waiting";
}

export function methodFromBillingType(billingType: string | undefined): "pix" | "card" | "other" {
  const t = (billingType ?? "").trim().toUpperCase();
  if (t === "PIX") return "pix";
  if (t === "CREDIT_CARD" || t === "DEBIT_CARD") return "card";
  return "other";
}

const METHOD_LABEL = {pix: "Pix", card: "Cartão", other: "Outro"} as const;

export function methodLabel(method: "pix" | "card" | "other"): string {
  return METHOD_LABEL[method];
}

export function centerEvent(
  at: unknown,
  type: CenterInvoiceEventType,
  title: string,
  detail: string,
  byName = SYSTEM_ACTOR,
): CenterInvoiceEvent {
  return {at, type, title, detail, byName};
}

/** Eventos atuais + o novo (o portal lê o array inteiro; sem `arrayUnion` para dar pra testar). */
export function withEvent(current: unknown, ev: CenterInvoiceEvent): unknown[] {
  return [...(Array.isArray(current) ? current : []), ev];
}

/** Quem gera/consulta/reenvia: owner ou admin ativos (mesmo papel que as rules exigem para mexer na cobrança). */
export function canManageCenterBilling(member: Record<string, unknown> | undefined): boolean {
  return member?.["status"] === "active" && (member["role"] === "center_owner" || member["role"] === "center_admin");
}

/** Percentual que vai para a carteira do centro no split. */
export function centerSplitPercent(feePercent: number = CENTER_CHARGE_FEE_PERCENT): number {
  const fee = Number.isFinite(feePercent) ? Math.min(Math.max(feePercent, 0), 100) : CENTER_CHARGE_FEE_PERCENT;
  return Math.round((100 - fee) * 100) / 100;
}

/** Asaas não aceita vencimento no passado: cobrança vencida sai com vencimento hoje. */
export function providerDueDate(dueDate: string, todayKey: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) && dueDate >= todayKey ? dueDate : todayKey;
}

/** Próxima consulta ao provedor de uma cobrança que segue pendente. */
export function nextProviderCheck(issuedAtMs: number, nowMs: number): number {
  const age = nowMs - issuedAtMs;
  return nowMs + (age < 24 * 60 * 60_000 ? PROVIDER_FIRST_CHECK_MS : PROVIDER_LATER_CHECK_MS);
}

/** Reserva vencida: matrícula ainda pendente com `holdUntil` no passado. */
export function holdExpired(enrollment: Record<string, unknown> | undefined, nowMs: number, holdUntilMs: number | null): boolean {
  return enrollment?.["status"] === "pending" && holdUntilMs != null && holdUntilMs <= nowMs;
}

export function reaisFromCents(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}

export function brlFromCents(cents: number): string {
  return reaisFromCents(cents).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}
