/**
 * CRM da arena — lembretes automáticos (puro). Decide, para um contrato e um dia, qual push o
 * mensalista recebe; e monta o resumo do dia para o time. Quem envia é `arena-crm-reminders.ts`.
 *
 * Só contratos do CRM com atleta do app (`athleteId`). Assinantes dos Planos de horário já têm
 * os lembretes deles (`arena-schedule-billing.ts`) e ficam de fora.
 */
import {
  addDays,
  contractView,
  daysBetween,
  installmentDueDate,
  type CrmContractRecord,
  type CrmOverview,
} from "./arena-crm-model";

export const CRM_REMINDERS = "arenaCrmReminders";

export const REMINDER_KINDS = ["due_soon", "due_today", "overdue_1", "overdue_7", "renewal_15", "renewal_3", "absence"] as const;
export type ReminderKind = typeof REMINDER_KINDS[number];

/** Grupo de cada lembrete (é o que a arena liga/desliga). */
export const REMINDER_GROUP: Record<ReminderKind, keyof ReminderSettings> = {
  due_soon: "due",
  due_today: "due",
  overdue_1: "overdue",
  overdue_7: "overdue",
  renewal_15: "renewal",
  renewal_3: "renewal",
  absence: "absence",
};

export interface ReminderSettings {
  due: boolean;
  overdue: boolean;
  renewal: boolean;
  absence: boolean;
  teamDigest: boolean;
}

/** Tudo ligado: o lembrete só sai para quem a arena cadastrou como mensalista no CRM. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {due: true, overdue: true, renewal: true, absence: true, teamDigest: true};

export const DUE_SOON_DAYS = 3;
export const OVERDUE_DAYS = [1, 7] as const;
export const RENEWAL_DAYS = [15, 3] as const;
export const ABSENCE_DAYS = 14;

export function reminderSettingsFrom(raw: unknown): ReminderSettings {
  const d = raw != null && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const pick = (k: keyof ReminderSettings) => (typeof d[k] === "boolean" ? d[k] as boolean : DEFAULT_REMINDER_SETTINGS[k]);
  return {due: pick("due"), overdue: pick("overdue"), renewal: pick("renewal"), absence: pick("absence"), teamDigest: pick("teamDigest")};
}

export interface PlannedReminder {
  kind: ReminderKind;
  /** Data que identifica o evento (vencimento, fim do contrato ou último jogo). Entra no id do doc. */
  refDate: string;
  /** Parcela do lembrete de cobrança (0 = 1ª); `null` nos outros. */
  installment: number | null;
  title: string;
  body: string;
}

function brl(v: number): string {
  const fixed = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
  return `R$ ${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function dm(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Id determinístico: o mesmo lembrete nunca sai duas vezes (o envio cria o doc com `create`). */
export function reminderDocId(contractId: string, kind: ReminderKind, refDate: string): string {
  return `${contractId}_${kind}_${refDate}`;
}

/**
 * Lembretes de um contrato no dia. `lastVisit` = último jogo do atleta na arena (ou `null` se
 * não jogou na janela consultada). Dias exatos: se o agendador falhar num dia, aquele marco passa.
 * No máximo um por dia (o mais urgente), para o atleta não receber três pushes de uma vez.
 */
export function planContractReminders(
  c: CrmContractRecord,
  today: string,
  arenaName: string,
  lastVisit: string | null,
  settings: ReminderSettings,
): PlannedReminder[] {
  if (!c.athleteId || c.status !== "active" || c.renewedToId) return [];
  const v = contractView(c, today);
  if (v.status === "canceled" || v.status === "not_renewed") return [];
  const out: PlannedReminder[] = [];
  const name = first(c.customerName);
  const plan = c.planName;

  if (settings.due && v.nextDueDate) {
    const k = c.paidInstallments + v.overdueCount;
    const left = daysBetween(today, v.nextDueDate);
    if (left === DUE_SOON_DAYS || left === 0) {
      out.push({
        kind: left === 0 ? "due_today" : "due_soon",
        refDate: v.nextDueDate,
        installment: k,
        title: left === 0 ? "Mensalidade vence hoje" : `Mensalidade vence em ${DUE_SOON_DAYS} dias`,
        body: `${name}, a mensalidade do ${plan} na ${arenaName} (${brl(c.monthlyPriceReais)}) vence ${left === 0 ? "hoje" : `em ${dm(v.nextDueDate)}`}. Pode pagar por Pix ou na recepção.`,
      });
    }
  }

  if (settings.overdue && v.overdueCount > 0) {
    const k = c.paidInstallments;
    const due = installmentDueDate(c.startDate, c.dueDay, k);
    const late = daysBetween(due, today);
    if ((OVERDUE_DAYS as readonly number[]).includes(late)) {
      out.push({
        kind: late === 1 ? "overdue_1" : "overdue_7",
        refDate: due,
        installment: k,
        title: "Mensalidade em aberto",
        body: `${name}, a mensalidade do ${plan} na ${arenaName} (${brl(v.overdueReais)}) está em aberto desde ${dm(due)}. Já pagou? Avisa a recepção.`,
      });
    }
  }

  if (settings.renewal && !c.autoRenew && v.endDate && v.daysToEnd !== null && (RENEWAL_DAYS as readonly number[]).includes(v.daysToEnd)) {
    out.push({
      kind: v.daysToEnd === 15 ? "renewal_15" : "renewal_3",
      refDate: v.endDate,
      installment: null,
      title: `Seu plano termina em ${v.daysToEnd} dias`,
      body: `Seu ${plan} na ${arenaName} termina em ${dm(v.endDate)}. Fale com a arena para renovar e manter seu horário.`,
    });
  }

  if (settings.absence && daysBetween(c.startDate, today) >= ABSENCE_DAYS) {
    const since = lastVisit ?? c.startDate;
    const days = daysBetween(since, today);
    if (days >= ABSENCE_DAYS) {
      out.push({
        kind: "absence",
        // Um por sumiço: o próximo só sai depois que ele voltar a jogar e sumir de novo.
        refDate: since,
        installment: null,
        title: "Sentimos sua falta!",
        body: lastVisit ?
          `Faz ${days} dias que você não joga na ${arenaName}. Seu horário do ${plan} continua garantido, te esperamos!` :
          `Faz tempo que não te vemos na quadra da ${arenaName}. Seu horário do ${plan} está garantido, te esperamos!`,
      });
    }
  }
  // Um push por dia por contrato: o mais urgente.
  out.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  return out.slice(0, 1);
}

const PRIORITY: readonly ReminderKind[] = ["overdue_7", "overdue_1", "due_today", "renewal_3", "due_soon", "renewal_15", "absence"];

/** Resumo do dia para o dono/gestor, ou `null` quando não há nada pra fazer. */
export function teamDigest(overview: CrmOverview, arenaName: string): {title: string; body: string} | null {
  const today = overview.today;
  const dueToday = overview.queues.dueThisWeek.filter((q) => q.date === today && q.kind !== "term_end").length;
  const dueWeek = overview.queues.dueThisWeek.length;
  const overdue = overview.queues.overdue.length;
  const overdueReais = overview.queues.overdue.reduce((s, q) => s + q.amountReais, 0);
  const absent = overview.queues.absent.length;
  const notRenewed = overview.queues.notRenewed.length;
  const convert = overview.queues.convert.length;
  const parts: string[] = [];
  if (dueToday) parts.push(`${dueToday} ${dueToday === 1 ? "mensalidade vence" : "mensalidades vencem"} hoje`);
  else if (dueWeek) parts.push(`${dueWeek} ${dueWeek === 1 ? "vence" : "vencem"} esta semana`);
  if (overdue) parts.push(`${overdue} em atraso (${brl(Math.round(overdueReais))})`);
  if (absent) parts.push(`${absent} ${absent === 1 ? "mensalista sumido" : "mensalistas sumidos"}`);
  if (notRenewed) parts.push(`${notRenewed} não ${notRenewed === 1 ? "renovou" : "renovaram"}`);
  if (parts.length === 0) return null;
  const tail = convert ? ` E ${convert} ${convert === 1 ? "avulso pronto" : "avulsos prontos"} pra virar mensalista.` : "";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
  return {title: `CRM de hoje · ${arenaName}`, body: `${list.charAt(0).toUpperCase()}${list.slice(1)}.${tail} Abra Clientes para agir.`};
}

// ── Efeito dos lembretes (KPI da aba Hoje) ────────────────────────────────────

export interface SentReminder {
  contractId: string;
  customerKey: string;
  kind: ReminderKind;
  refDate: string;
  installment: number | null;
  sentAt: string;
}

export interface ReminderOutcome {
  sent7d: number;
  byGroup: Record<"due" | "overdue" | "renewal" | "absence", number>;
  paid: {done: number; total: number};
  renewed: {done: number; total: number};
  cameBack: {done: number; total: number};
}

/** Quanto os lembretes dos últimos 7 dias funcionaram: pagou a parcela, renovou, voltou a jogar. */
export function reminderOutcome(
  sent: SentReminder[],
  contracts: Map<string, CrmContractRecord>,
  lastVisitByKey: Map<string, string | null>,
  today: string,
): ReminderOutcome {
  const from = addDays(today, -6);
  const recent = sent.filter((r) => r.sentAt.slice(0, 10) >= from);
  const out: ReminderOutcome = {
    sent7d: recent.length,
    byGroup: {due: 0, overdue: 0, renewal: 0, absence: 0},
    paid: {done: 0, total: 0},
    renewed: {done: 0, total: 0},
    cameBack: {done: 0, total: 0},
  };
  for (const r of recent) {
    const group = REMINDER_GROUP[r.kind] as keyof ReminderOutcome["byGroup"];
    out.byGroup[group] += 1;
    const c = contracts.get(r.contractId);
    if (group === "due" || group === "overdue") {
      out.paid.total += 1;
      if (c && r.installment !== null && c.paidInstallments > r.installment) out.paid.done += 1;
    } else if (group === "renewal") {
      out.renewed.total += 1;
      if (c?.renewedToId) out.renewed.done += 1;
    } else {
      out.cameBack.total += 1;
      const last = lastVisitByKey.get(r.customerKey) ?? null;
      if (last && last > r.sentAt.slice(0, 10)) out.cameBack.done += 1;
    }
  }
  return out;
}
