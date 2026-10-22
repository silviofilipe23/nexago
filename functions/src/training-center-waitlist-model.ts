/**
 * Oferta automática da lista de espera — lógica pura (espelha `frontend/projects/center/src/app/
 * domain/enrollment.ts`: `buildContract`, `priceOn`, `waitlistOf`). Mudou lá, muda aqui.
 */

const DEFAULT_ACCEPT_HOURS = 24;

type Data = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface WaitlistEntry {
  id: string;
  studentId: string;
  planId: string | null;
  waitlistedAtMs: number;
}

/** Fila da turma, mais antigo primeiro (empate: id, para ser determinístico). */
export function waitlistQueue(docs: {id: string; data: Data}[], classId: string): WaitlistEntry[] {
  return docs
    .filter(({data}) => data["classId"] === classId && data["status"] === "waitlisted")
    .map(({id, data}) => {
      const at = data["waitlistedAt"] as {toMillis?: () => number} | undefined;
      return {
        id,
        studentId: String(data["studentId"] ?? ""),
        planId: typeof data["planId"] === "string" && data["planId"] ? (data["planId"] as string) : null,
        waitlistedAtMs: typeof at?.toMillis === "function" ? at.toMillis() : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.waitlistedAtMs - b.waitlistedAtMs || a.id.localeCompare(b.id));
}

/** Vagas livres para oferecer agora (0 se a turma ou o centro não aceitam oferta). */
export function seatsToOffer(center: Data | undefined, cls: Data | undefined): number {
  if (!center || !cls) return 0;
  const policies = (center["policies"] ?? {}) as Data;
  if (center["status"] !== "active" || policies["waitlistEnabled"] === false) return 0;
  if (cls["status"] !== "active") return 0;
  const capacity = num(cls["capacity"]) ?? 0;
  const taken = num(cls["seatsTaken"]) ?? 0;
  return Math.max(0, capacity - taken);
}

export function acceptHours(center: Data | undefined): number {
  const h = num(((center?.["policies"] ?? {}) as Data)["waitlistAcceptHours"]);
  return h && h > 0 ? h : DEFAULT_ACCEPT_HOURS;
}

/** Preço do plano numa contratação feita em `day` (preço agendado só a partir da data). */
export function priceOn(plan: Data, day: string): number {
  const next = plan["scheduledPrice"] as Data | null | undefined;
  const from = typeof next?.["effectiveFrom"] === "string" ? (next["effectiveFrom"] as string) : "";
  const nextPrice = num(next?.["priceCents"]);
  return next && from && from <= day && nextPrice != null ? nextPrice : (num(plan["priceCents"]) ?? 0);
}

/** Contrato congelado no dia da oferta: plano + políticas do centro. */
export function buildContract(plan: Data, policies: Data, day: string): Data {
  return {
    planName: String(plan["name"] ?? "Plano"),
    planType: plan["type"] === "class_pack" ? "class_pack" : "monthly",
    priceCents: priceOn(plan, day),
    classesPerWeek: num(plan["classesPerWeek"]),
    makeupsPerMonth: num(plan["makeupsPerMonth"]),
    credits: num(plan["credits"]),
    validityDays: num(plan["validityDays"]),
    policies: {...policies},
    contractedAt: day,
  };
}

/** Plano que serve para oferecer: existe e não está arquivado. */
export function planOfferable(plan: Data | undefined): boolean {
  return !!plan && plan["status"] !== "archived" && (num(plan["priceCents"]) ?? -1) >= 0;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Mesma referência que a cobrança criada pelo portal ("Mensal 2x · out"). */
export function invoiceReference(contract: Data, day: string): string {
  const name = String(contract["planName"] ?? "Plano");
  return contract["planType"] === "class_pack" ? name : `${name} · ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** Dia de parede no fuso do centro. */
export function dayKeyIn(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone: tz || "America/Sao_Paulo"}).format(at);
}

/** Pagador: responsável legal quando o aluno é menor. */
export function payerName(student: Data | undefined, fallback: string): string {
  const guardian = student?.["guardian"] as Data | null | undefined;
  if (student?.["isMinor"] === true && typeof guardian?.["name"] === "string" && guardian["name"]) {
    return guardian["name"] as string;
  }
  return typeof student?.["name"] === "string" && student["name"] ? (student["name"] as string) : fallback;
}

/** Só a mudança em vaga/capacidade/situação da turma pode abrir oferta. */
export function classSeatInputChanged(before: Data | undefined, after: Data | undefined): boolean {
  if (!after) return false;
  const pick = (d: Data | undefined) => JSON.stringify([d?.["seatsTaken"] ?? null, d?.["capacity"] ?? null, d?.["status"] ?? null]);
  return pick(before) !== pick(after);
}
