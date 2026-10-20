/**
 * Cobrança online das mensalidades de aula — modelo puro (sem Asaas, sem I/O).
 *
 * Um **grupo** (`arenaClassAsaasPayments/{groupId}`) vira UM pagamento Asaas e cobre uma ou mais
 * mensalidades (`arenaClassCharges`): na matrícula, proporcional do mês + taxa saem juntos; depois,
 * uma mensalidade por grupo. As mensalidades guardam um espelho (`asaas`) para as telas — o grupo é
 * só do servidor (rules negam tudo).
 *
 * Estados do grupo: `pending` (gravado na transação, sem chamar o Asaas) → `creating` (worker
 * assumiu) → `open` (link pronto) → `paid`; `voiding` (baixa manual ou cancelamento pediu para apagar
 * no Asaas) → `void`; `failed` (o worker tenta de novo); `needs_cpf` (sem CPF não há como cobrar —
 * fica manual).
 */
import {FieldValue} from "firebase-admin/firestore";

export type ClassAsaasState = "pending" | "creating" | "open" | "paid" | "voiding" | "void" | "failed" | "needs_cpf";

/** Estados em que ainda pode existir (ou vir a existir) um pagamento vivo no Asaas. */
export const LIVE_ASAAS_STATES: readonly ClassAsaasState[] = ["pending", "creating", "open", "failed"];

export interface ClassAsaasGroupCharge {
  id: string;
  description: string;
  amountReais: number;
  dueDate: string;
}

export interface ClassAsaasGroupOwner {
  arenaId: string;
  enrollmentId: string;
  studentId: string;
  athleteId: string | null;
  name: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Doc novo do grupo (estado `pending`); o vencimento é o mais cedo das mensalidades. */
export function classAsaasGroupData(
  owner: ClassAsaasGroupOwner,
  charges: readonly ClassAsaasGroupCharge[],
): Record<string, unknown> {
  const sorted = [...charges].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    arenaId: owner.arenaId,
    enrollmentId: owner.enrollmentId,
    studentId: owner.studentId,
    athleteId: owner.athleteId,
    name: owner.name,
    chargeIds: sorted.map((c) => c.id),
    amountReais: round2(sorted.reduce((sum, c) => sum + c.amountReais, 0)),
    dueDate: sorted[0]?.dueDate ?? "",
    description: sorted.map((c) => c.description).join(" + ").slice(0, 480),
    state: "pending" satisfies ClassAsaasState,
    attempt: 0,
    paymentId: null,
    invoiceUrl: null,
    asaasStatus: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Espelho na mensalidade (o que portal e app leem). */
export function chargeAsaasMirror(
  groupId: string,
  state: ClassAsaasState,
  extra: {invoiceUrl?: string | null; status?: string | null} = {},
): Record<string, unknown> {
  return {
    groupId,
    state,
    invoiceUrl: extra.invoiceUrl ?? null,
    status: extra.status ?? null,
  };
}

/** Ids dos grupos: 1º mês da matrícula, volta da pausa; a mensalidade do agendador usa o próprio id. */
export function firstGroupId(enrollmentId: string): string {
  return `${enrollmentId}_first`;
}

export function resumeGroupId(enrollmentId: string, month: string): string {
  return `${enrollmentId}_resume_${month}`;
}

/** CPF/CNPJ só com os 3 dígitos do meio à mostra: `***.456.789-**` (CNPJ: `**.***.678/0001-**`). */
export function maskCpfCnpj(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return "";
}
