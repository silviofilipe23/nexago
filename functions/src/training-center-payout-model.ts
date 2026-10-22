/**
 * Repasse ao professor — o mesmo cálculo do portal (`frontend/projects/center/src/app/domain/payouts.ts`)
 * para o fechamento automático, e a política da automação. Lógica pura.
 *
 * Aula conta para quem DEU a aula e só com chamada finalizada (`status: done`). `per_class`: valor ×
 * aulas; `monthly`: fixo; `percent`: % do que foi pago no mês (aprovado − estorno) pelas matrículas
 * das turmas em que ele é titular.
 */

type Data = Record<string, unknown>;

export type PayRuleKind = "per_class" | "percent" | "monthly" | "none";

export interface PayRule {
  kind: PayRuleKind;
  amountCents: number;
  percent: number;
}

export function readPayRule(raw: unknown): PayRule {
  const d = raw && typeof raw === "object" ? (raw as Data) : {};
  const kind = ["per_class", "percent", "monthly"].includes(String(d["kind"])) ? (d["kind"] as PayRuleKind) : "none";
  const amount = Number(d["amountCents"]);
  const percent = Number(d["percent"]);
  return {
    kind,
    amountCents: Number.isInteger(amount) && amount > 0 ? amount : 0,
    percent: Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : 0,
  };
}

export interface PayoutLine {
  kind: "class" | "revenue" | "fixed";
  ref: string;
  date: string;
  label: string;
  amountCents: number;
  baseCents: number;
}

export interface PayoutCalc {
  coachUid: string;
  rule: PayRule;
  classesGiven: number;
  pendingAttendance: number;
  baseCents: number;
  totalCents: number;
  lines: PayoutLine[];
}

export function monthRangeOf(month: string): {from: string; to: string} {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return {from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`};
}

export function previousMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 2, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

function str(d: Data, k: string): string {
  return typeof d[k] === "string" ? (d[k] as string) : "";
}

export function computePayout(input: {
  coachUid: string;
  rule: PayRule;
  month: string;
  today: string;
  sessions: {id: string; data: Data}[];
  classes: {id: string; data: Data}[];
  enrollments: {id: string; data: Data}[];
  invoices: {id: string; data: Data}[];
  /** Dia de parede (fuso do centro) de um instante. */
  dayOf: (at: Date) => string;
}): PayoutCalc {
  const {from, to} = monthRangeOf(input.month);
  const mine = input.sessions.filter((s) => str(s.data, "coachUid") === input.coachUid && str(s.data, "date") >= from && str(s.data, "date") <= to);
  const given = mine
    .filter((s) => s.data["status"] === "done")
    .sort((a, b) => (str(a.data, "date") + str(a.data, "startTime")).localeCompare(str(b.data, "date") + str(b.data, "startTime")));
  const pendingAttendance = mine.filter((s) => s.data["status"] === "scheduled" && str(s.data, "date") < input.today).length;
  const r = input.rule;
  const lines: PayoutLine[] = [];
  let baseCents = 0;

  if (r.kind === "per_class") {
    for (const s of given) {
      lines.push({kind: "class", ref: s.id, date: str(s.data, "date"), label: `${str(s.data, "className")} · ${str(s.data, "startTime")}`, amountCents: r.amountCents, baseCents: 0});
    }
  } else if (r.kind === "monthly") {
    lines.push({kind: "fixed", ref: input.month, date: from, label: "Valor fixo do mês", amountCents: r.amountCents, baseCents: 0});
  } else if (r.kind === "percent") {
    const titularOf = new Set(input.classes.filter((c) => str(c.data, "coachUid") === input.coachUid).map((c) => c.id));
    const byEnrollment = new Map(input.enrollments.map((e) => [e.id, e.data]));
    for (const inv of input.invoices) {
      const st = inv.data["status"];
      if (st !== "approved" && st !== "refunded") continue;
      const e = byEnrollment.get(str(inv.data, "enrollmentId"));
      const approvedAt = (inv.data["approvedAt"] as {toDate?: () => Date} | null)?.toDate?.();
      if (!e || !titularOf.has(str(e, "classId")) || !approvedAt) continue;
      const day = input.dayOf(approvedAt);
      if (day < from || day > to) continue;
      const paid = Math.max(0, Math.round(Number(inv.data["amountCents"] ?? 0)) - Math.round(Number(inv.data["refundedCents"] ?? 0)));
      if (paid === 0) continue;
      baseCents += paid;
      lines.push({
        kind: "revenue", ref: inv.id, date: day,
        label: `${str(inv.data, "payerName") || str(e, "studentName")} · ${str(inv.data, "reference")}`,
        amountCents: Math.round((paid * r.percent) / 100), baseCents: paid,
      });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
  }
  const totalCents = r.kind === "percent" ? Math.round((baseCents * r.percent) / 100) : lines.reduce((t, l) => t + l.amountCents, 0);
  return {coachUid: input.coachUid, rule: r, classesGiven: given.length, pendingAttendance, baseCents, totalCents, lines};
}

/** `trainingCenters/{c}/settings/payouts` — só o owner liga (mexe em dinheiro). */
export interface PayoutAutomation {
  /** Fecha sozinho o mês anterior no `closeDay`. */
  autoClose: boolean;
  closeDay: number;
  /** Depois do prazo de conferência, paga pelo NexaGO o que ninguém segurou. */
  autoPay: boolean;
  reviewDays: number;
  /** Repasse acima disto não sai sozinho (0 = sem teto). */
  maxAutoPayCents: number;
}

export const DEFAULT_AUTOMATION: PayoutAutomation = {autoClose: false, closeDay: 1, autoPay: false, reviewDays: 3, maxAutoPayCents: 0};

export function readAutomation(raw: unknown): PayoutAutomation {
  const d = raw && typeof raw === "object" ? (raw as Data) : {};
  const int = (k: keyof PayoutAutomation, min: number, max: number) => {
    const v = Number(d[k]);
    return Number.isInteger(v) && v >= min && v <= max ? v : (DEFAULT_AUTOMATION[k] as number);
  };
  const autoClose = d["autoClose"] === true;
  return {
    autoClose,
    closeDay: int("closeDay", 1, 28),
    // Pagar sozinho só faz sentido com o fechamento automático.
    autoPay: autoClose && d["autoPay"] === true,
    reviewDays: int("reviewDays", 0, 15),
    maxAutoPayCents: int("maxAutoPayCents", 0, 100_000_000),
  };
}

/** O mês anterior já pode ser fechado hoje? (no dia ou depois — rodada perdida recupera). */
export function monthToClose(a: PayoutAutomation, today: string): string | null {
  if (!a.autoClose) return null;
  return Number(today.slice(8, 10)) >= a.closeDay ? previousMonth(today) : null;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  return t.toISOString().slice(0, 10);
}

/** Por que um repasse fechado NÃO sai sozinho hoje (null = pode pagar). */
export function autoPayBlock(p: Data, a: PayoutAutomation, today: string): string | null {
  if (!a.autoPay) return "automação desligada";
  if (p["status"] !== "closed") return "não está fechado";
  const at = str(p, "autoPayAt");
  if (!at) return "fora do pagamento automático";
  if (at > today) return "em conferência";
  if (p["autoPayHold"] === true) return "segurado";
  if (["requested", "pending", "unknown", "done"].includes(str(p, "transferStatus"))) return "transferência em andamento";
  if (str(p, "autoPayError")) return "tentativa automática falhou";
  const cents = Math.round(Number(p["totalCents"] ?? 0));
  if (cents < 100) return "valor baixo";
  if (a.maxAutoPayCents > 0 && cents > a.maxAutoPayCents) return "acima do teto";
  return null;
}
