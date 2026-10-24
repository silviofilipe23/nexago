/**
 * Preferências de aviso do Centro de Treinamento (Configurações › Notificações) — lógica pura.
 * Espelho no portal: `frontend/projects/center/src/app/domain/notification-settings.ts`.
 *
 * Guardadas em `trainingCenters/{c}.notifications`:
 *   { events: {[eventKey]: {push: boolean}}, quietHours: {enabled, start, end}, reminderLeadMin }
 *
 * Só há canal push por enquanto (e-mail e WhatsApp não têm provedor). Evento obrigatório (afeta
 * aula ou cobrança) sempre vai por push — o centro não desliga.
 */

type Data = Record<string, unknown>;

export type NotificationEventKey =
  | "class_reminder"
  | "session_cancelled"
  | "session_changed"
  | "attendance_pending"
  | "student_absence"
  | "seat_offered"
  | "enrollment_confirmed"
  | "makeup_expiring"
  | "billing_reminder"
  | "billing_overdue"
  | "payment_confirmed"
  | "billing_block_warning"
  | "staff_pending_payments"
  | "enrollment_request"
  | "enrollment_request_answered"
  | "daily_summary";

export interface NotificationEventSpec {
  /** Sempre por push; o centro não desliga. */
  mandatory: boolean;
  defaultPush: boolean;
  /** Chega mesmo no horário de silêncio (cancelamento e troca de local/horário). */
  quietExempt: boolean;
  /** No silêncio: `defer` manda quando o silêncio acaba; `drop` descarta (lembrete que perde o sentido). */
  inQuiet: "defer" | "drop";
  /** Ainda não implementado no servidor (a tela mostra "em breve"). */
  available: boolean;
}

const spec = (p: Partial<NotificationEventSpec>): NotificationEventSpec => ({
  mandatory: false, defaultPush: true, quietExempt: false, inQuiet: "defer", available: true, ...p,
});

export const NOTIFICATION_EVENTS: Record<NotificationEventKey, NotificationEventSpec> = {
  class_reminder: spec({inQuiet: "drop"}),
  session_cancelled: spec({mandatory: true, quietExempt: true}),
  session_changed: spec({mandatory: true, quietExempt: true}),
  attendance_pending: spec({}),
  // Aluno avisou pelo app que não vai: o professor sabe antes de abrir a chamada.
  student_absence: spec({}),
  seat_offered: spec({}),
  enrollment_confirmed: spec({}),
  makeup_expiring: spec({available: false}),
  billing_reminder: spec({mandatory: true}),
  billing_overdue: spec({mandatory: true}),
  payment_confirmed: spec({defaultPush: false}),
  billing_block_warning: spec({}),
  staff_pending_payments: spec({}),
  // Trancar/pausa por lesão/cancelar: pedido novo → gestão; resposta da gestão → aluno.
  enrollment_request: spec({}),
  enrollment_request_answered: spec({mandatory: true}),
  daily_summary: spec({defaultPush: false, available: false}),
};

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface NotificationSettings {
  push: Record<NotificationEventKey, boolean>;
  quietHours: QuietHours;
  /** Antecedência do lembrete de aula, em minutos. */
  reminderLeadMin: number;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const REMINDER_LEADS = [60, 120, 180, 240];

export function readNotificationSettings(raw: unknown): NotificationSettings {
  const d = raw && typeof raw === "object" ? (raw as Data) : {};
  const events = d["events"] && typeof d["events"] === "object" ? (d["events"] as Data) : {};
  const push = {} as Record<NotificationEventKey, boolean>;
  for (const [key, s] of Object.entries(NOTIFICATION_EVENTS) as [NotificationEventKey, NotificationEventSpec][]) {
    const e = events[key] && typeof events[key] === "object" ? (events[key] as Data) : {};
    push[key] = s.mandatory ? true : typeof e["push"] === "boolean" ? (e["push"] as boolean) : s.defaultPush;
  }
  const q = d["quietHours"] && typeof d["quietHours"] === "object" ? (d["quietHours"] as Data) : {};
  const lead = Number(d["reminderLeadMin"]);
  return {
    push,
    quietHours: {
      enabled: q["enabled"] !== false,
      start: typeof q["start"] === "string" && TIME.test(q["start"]) ? q["start"] : "22:00",
      end: typeof q["end"] === "string" && TIME.test(q["end"]) ? q["end"] : "07:00",
    },
    reminderLeadMin: REMINDER_LEADS.includes(lead) ? lead : 120,
  };
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Hora de parede "HH:MM" no fuso do centro. */
export function wallTime(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone: tz || "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23"})
    .formatToParts(at);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/** Está no silêncio? A janela pode virar a meia-noite (22:00–07:00). */
export function inQuietHours(q: QuietHours, time: string): boolean {
  if (!q.enabled || q.start === q.end) return false;
  const t = minutes(time);
  const s = minutes(q.start);
  const e = minutes(q.end);
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Minutos até o silêncio acabar (a partir de `time`). */
export function minutesUntilQuietEnds(q: QuietHours, time: string): number {
  return (minutes(q.end) - minutes(time) + 1440) % 1440;
}

export type Decision = {action: "send"} | {action: "skip"; reason: "disabled" | "unavailable" | "quiet"} | {action: "defer"; minutes: number};

/** O que fazer com um aviso deste evento agora. */
export function decide(key: NotificationEventKey, s: NotificationSettings, time: string): Decision {
  const e = NOTIFICATION_EVENTS[key];
  if (!e.available) return {action: "skip", reason: "unavailable"};
  if (!s.push[key]) return {action: "skip", reason: "disabled"};
  if (e.quietExempt || !inQuietHours(s.quietHours, time)) return {action: "send"};
  return e.inQuiet === "drop" ? {action: "skip", reason: "quiet"} : {action: "defer", minutes: minutesUntilQuietEnds(s.quietHours, time)};
}

/** Evento da régua de cobrança por estágio (0 lembrete · 1–2 não pago · 3 aviso · 4–5 bloqueio/suspensão). */
export function billingEventForStage(stage: number): NotificationEventKey {
  if (stage <= 0) return "billing_reminder";
  if (stage === 3) return "billing_block_warning";
  return "billing_overdue";
}

/** Fim da aula em minutos do dia. */
export function sessionEndMinutes(startTime: string, durationMin: number): number {
  return minutes(startTime) + Math.max(0, durationMin);
}

export {minutes as timeToMinutes};
