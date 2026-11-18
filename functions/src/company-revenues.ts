/**
 * Receita avulsa (backoffice › Financeiro › Resultado): dinheiro que entrou na NexaGO fora do
 * Asaas e que nenhuma fonte automática enxerga — hoje, mensalidade de plano de arena paga por PIX
 * direto, transferência ou dinheiro. Fica em `companyRevenues/{id}` e entra na fonte gravada
 * ("Planos das arenas") no mês do recebimento (`addCompanyRevenue` em `company-finance.ts`).
 *
 * Registro errado é anulado (`voidedAt`), nunca apagado: o histórico de quem lançou o quê fica.
 * Só regra pura aqui; a leitura e a gravação ficam em `backoffice-company-revenues.ts`.
 */

export const COMPANY_REVENUES = "companyRevenues";

/** Fontes do Resultado que aceitam lançamento à mão. */
export const MANUAL_REVENUE_SOURCES = ["planosArena"] as const;
export type ManualRevenueSource = typeof MANUAL_REVENUE_SOURCES[number];

export const REVENUE_NOTE_MAX = 200;
/** R$ 20.000: folga sobre o plano mais caro (Parceiro anual, R$ 3.990); barra erro de digitação. */
export const REVENUE_MAX_CENTS = 2_000_000;
/** Antes disso não havia plano de arena. */
const EARLIEST_DAY = "2025-01-01";
/** Id de doc do Firestore gerado ou escrito à mão: sem `/` nem pontos. */
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;

export interface RecordRevenueInput {
  source: ManualRevenueSource;
  arenaId: string;
  amountCents: number;
  /** Dia em que o dinheiro entrou, `YYYY-MM-DD` (São Paulo). */
  receivedOn: string;
  note: string;
}

export interface RevenueRecord extends RecordRevenueInput {
  arenaName: string | null;
  createdBy: string;
}

export type RecordRevenuePlan =
  | {status: "error"; message: string}
  | {status: "create"; record: RevenueRecord};

export type VoidRevenuePlan =
  | {status: "error"; message: string}
  | {status: "unchanged"}
  | {status: "void"};

export interface ManualRevenueRow {
  id: string;
  source: ManualRevenueSource;
  arenaId: string;
  arenaName: string | null;
  amountCents: number;
  receivedOn: string;
  note: string;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isSource(v: unknown): v is ManualRevenueSource {
  return (MANUAL_REVENUE_SOURCES as readonly unknown[]).includes(v);
}

/** Dia real do calendário (barra 30/02). */
function isRealDay(v: string): boolean {
  if (!DAY.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Data civil de hoje em São Paulo, `YYYY-MM-DD`. */
export function saoPauloToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Sao_Paulo"}).format(now);
}

/** Valida o que o backoffice mandou; erro com mensagem pronta para a tela. */
export function parseRecordRevenueInput(raw: unknown, today: string): RecordRevenueInput {
  const data = (raw ?? {}) as Raw;
  if (!isSource(data["source"])) throw new Error("Escolha o tipo de receita.");
  const arenaId = text(data["arenaId"]);
  if (!arenaId || !DOC_ID.test(arenaId)) throw new Error("Escolha a arena que pagou.");
  const amountCents = data["amountCents"];
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0 || amountCents > REVENUE_MAX_CENTS) {
    throw new Error("Informe um valor entre R$ 0,01 e R$ 20.000,00.");
  }
  const receivedOn = typeof data["receivedOn"] === "string" ? data["receivedOn"] : "";
  if (!isRealDay(receivedOn) || receivedOn < EARLIEST_DAY || receivedOn > today) {
    throw new Error("Informe a data em que o dinheiro entrou (até hoje).");
  }
  const note = typeof data["note"] === "string" ? data["note"].trim() : "";
  if (note.length > REVENUE_NOTE_MAX) throw new Error(`A observação aceita até ${REVENUE_NOTE_MAX} caracteres.`);
  return {source: data["source"], arenaId, amountCents, receivedOn, note};
}

/**
 * Decide a gravação. `arena` é o doc da arena (`null` se não existe); `arenaRevenues`, as receitas
 * avulsas já lançadas para ela: a mesma (fonte, dia e valor) ainda valendo é lançamento em dobro.
 */
export function planRecordRevenue(p: {
  input: RecordRevenueInput;
  arena: Raw | null;
  arenaRevenues: readonly Raw[];
  uid: string;
}): RecordRevenuePlan {
  const {input} = p;
  if (!p.arena) return {status: "error", message: "Arena não encontrada."};
  const twin = p.arenaRevenues.some((r) => !r["voidedAt"] &&
    r["source"] === input.source &&
    r["receivedOn"] === input.receivedOn &&
    r["amountCents"] === input.amountCents);
  if (twin) {
    return {status: "error", message: "Essa receita já foi registrada: mesma arena, dia e valor."};
  }
  return {
    status: "create",
    record: {...input, arenaName: text(p.arena["name"]), createdBy: p.uid},
  };
}

export function parseVoidRevenueInput(raw: unknown): {id: string; reason: string} {
  const data = (raw ?? {}) as Raw;
  const id = text(data["id"]);
  if (!id || !DOC_ID.test(id)) throw new Error("Receita não informada.");
  const reason = typeof data["reason"] === "string" ? data["reason"].trim() : "";
  if (reason.length > REVENUE_NOTE_MAX) throw new Error(`O motivo aceita até ${REVENUE_NOTE_MAX} caracteres.`);
  return {id, reason};
}

/** Anular de novo não muda nada (o duplo clique não vira erro). */
export function planVoidRevenue(existing: Raw | null): VoidRevenuePlan {
  if (!existing) return {status: "error", message: "Receita não encontrada."};
  if (existing["voidedAt"]) return {status: "unchanged"};
  return {status: "void"};
}

/**
 * Mensalidade contada duas vezes: a receita avulsa e uma cobrança do plano marcada no Asaas como
 * "recebida em dinheiro" (o jeito de manter o plano ativo quando a arena paga por fora), mesma
 * arena, mesmo mês e mesmo valor. Não dá para saber qual vale; o aviso pede para anular uma.
 * `arenaOfCustomer`: cliente do Asaas → arena (do `billing/subscription`).
 */
export function cashTwinWarnings(
  rows: readonly ManualRevenueRow[],
  payments: readonly Raw[],
  arenaOfCustomer: ReadonlyMap<string, string>,
): string[] {
  const warnings: string[] = [];
  for (const p of payments) {
    if (p["status"] !== "RECEIVED_IN_CASH") continue;
    const arenaId = arenaOfCustomer.get(text(p["customer"]) ?? "");
    const day = text(p["paymentDate"]) ?? text(p["clientPaymentDate"]) ?? text(p["confirmedDate"]);
    const cents = typeof p["value"] === "number" ? Math.round(p["value"] * 100) : 0;
    if (!arenaId || !day || !cents) continue;
    const twin = rows.find((r) => r.arenaId === arenaId && r.amountCents === cents && r.receivedOn.slice(0, 7) === day.slice(0, 7));
    if (!twin) continue;
    const name = twin.arenaName ?? "Arena sem nome";
    const month = `${day.slice(5, 7)}/${day.slice(0, 4)}`;
    warnings.push(`${name}: a mensalidade de ${month} conta em dobro — está em Receitas avulsas e também marcada ` +
      "como recebida em dinheiro no Asaas. Anule a receita avulsa.");
  }
  return warnings;
}

/** Receitas avulsas que valem, com recebimento nos meses da janela; mais recente primeiro. */
export function manualRevenueRows(
  docs: readonly {id: string; data: Raw}[],
  monthKeys: readonly string[],
): ManualRevenueRow[] {
  const months = new Set(monthKeys);
  return docs
    .filter(({data}) => !data["voidedAt"] && isSource(data["source"]) &&
      typeof data["receivedOn"] === "string" && months.has(data["receivedOn"].slice(0, 7)))
    .map(({id, data}) => ({
      id,
      source: data["source"] as ManualRevenueSource,
      arenaId: text(data["arenaId"]) ?? "",
      arenaName: text(data["arenaName"]),
      amountCents: Math.max(0, typeof data["amountCents"] === "number" ? Math.round(data["amountCents"]) : 0),
      receivedOn: data["receivedOn"] as string,
      note: typeof data["note"] === "string" ? data["note"] : "",
    }))
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || a.id.localeCompare(b.id));
}
