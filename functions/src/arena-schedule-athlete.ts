/**
 * Planos de horário — "Meu plano" do atleta (A3): as assinaturas de que ele participa, com as
 * ocorrências do mês corrente e do próximo, créditos de reposição, as mensalidades dele e as
 * ofertas da fila.
 */

import {onCall} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {nextMonthKey} from "./arena-class-billing";
import {monthKeyOf} from "./arena-class-ledger";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_CREDITS,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  ARENA_SCHEDULE_WAITLIST,
  endMinutes,
  firstDayOfMonth,
  lastDayOfMonth,
  occurrenceStartMs,
  str,
} from "./arena-schedule-plan-constants";
import {requireUid, rethrowSchedule} from "./arena-schedule-plans";

type Data = Record<string, unknown>;

export type OccurrenceView = "done" | "today" | "next" | "skipped" | "makeup";

/** Timestamps viram ISO (o callable devolve JSON). */
export function toPlain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value != null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Data).map(([k, v]) => [k, toPlain(v)]));
  }
  if (value != null && typeof value === "object") return null; // sentinelas do FieldValue etc.
  return value;
}

export function occurrenceStatus(booking: Data, todayKey: string, nowMs: number): OccurrenceView {
  const status = str(booking["status"]).toLowerCase();
  if (status === "cancelled" || status === "canceled") return "skipped";
  if (booking["scheduleMakeupCreditId"]) return "makeup";
  const date = str(booking["date"]);
  const endMin = endMinutes(str(booking["endTime"]));
  const endMs = occurrenceStartMs(date, "00:00") + endMin * 60_000;
  if (date < todayKey || endMs <= nowMs) return "done";
  return date === todayKey ? "today" : "next";
}

/** Liberadas pelo sistema (troca de horário, pausa, atraso, saída) não são falta: somem da lista. */
const SYSTEM_RELEASE_REASONS = new Set([
  "schedule_slots_changed",
  "schedule_subscription_paused",
  "schedule_subscription_overdue",
  "schedule_subscription_ended",
  "schedule_subscription_ending",
]);

export function isVisibleOccurrence(booking: Data): boolean {
  const status = str(booking["status"]).toLowerCase();
  if (status !== "cancelled" && status !== "canceled") return true;
  const reason = str(booking["cancelReason"]);
  return !SYSTEM_RELEASE_REASONS.has(reason) && !reason.startsWith("recurring_series_");
}

/**
 * Débito automático: o atleta vê só a própria autorização (bandeira e final do cartão dele); a dos
 * outros membros e a lista de quem autorizou não saem do servidor.
 */
export function ownAutopayOnly(data: Data, uid: string): Data {
  const {autopay, autopayAthleteIds: _ids, ...rest} = data;
  const own = autopay != null && typeof autopay === "object" ? (autopay as Data)[uid] : undefined;
  return own == null ? rest : {...rest, autopay: {[uid]: own}};
}

export async function getMySubscriptionsCore(db: Firestore, uid: string, todayKey: string, nowMs: number) {
  const fromKey = firstDayOfMonth(monthKeyOf(todayKey));
  const untilKey = lastDayOfMonth(nextMonthKey(monthKeyOf(todayKey)));
  const [subsSnap, offersSnap, waitingSnap] = await Promise.all([
    db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("memberAthleteIds", "array-contains", uid).get(),
    db.collection(ARENA_SCHEDULE_WAITLIST).where("athleteId", "==", uid).where("status", "==", "offered").get(),
    db.collection(ARENA_SCHEDULE_WAITLIST).where("athleteId", "==", uid).where("status", "==", "waiting").get(),
  ]);
  // Encerradas somem; "Sai em dd/mm" segue aparecendo até encerrar.
  const subs = subsSnap.docs.filter((d) => d.data()["status"] !== "canceled");

  const subscriptions = await Promise.all(subs.map(async (doc) => {
    const [bookings, credits, charges] = await Promise.all([
      db.collection("arenaBookings").where("scheduleSubscriptionId", "==", doc.id).get(),
      db.collection(ARENA_SCHEDULE_CREDITS).where("subscriptionId", "==", doc.id).get(),
      db.collection(ARENA_SCHEDULE_CHARGES).where("subscriptionId", "==", doc.id).get(),
    ]);
    const occurrences = bookings.docs
      .map((b) => ({id: b.id, data: b.data() as Data}))
      .filter((b) => str(b.data["date"]) >= fromKey && str(b.data["date"]) <= untilKey)
      .filter((b) => isVisibleOccurrence(b.data))
      .map((b) => ({
        bookingId: b.id,
        date: str(b.data["date"]),
        startTime: str(b.data["startTime"]),
        endTime: str(b.data["endTime"]),
        courtName: str(b.data["courtName"]) || "Quadra",
        status: occurrenceStatus(b.data, todayKey, nowMs),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return {
      subscriptionId: doc.id,
      ...ownAutopayOnly(toPlain(doc.data()) as Data, uid),
      occurrences,
      credits: credits.docs
        .filter((c) => c.data()["status"] !== "expired")
        .map((c) => ({creditId: c.id, ...(toPlain(c.data()) as Data)})),
      charges: charges.docs
        .filter((c) => c.data()["payerAthleteId"] === uid && c.data()["status"] !== "canceled")
        .map((c) => ({chargeId: c.id, ...(toPlain(c.data()) as Data)}))
        .sort((a, b) => str((a as Data)["period"]).localeCompare(str((b as Data)["period"]))),
    };
  }));

  return {
    subscriptions,
    offers: offersSnap.docs.map((d) => ({entryId: d.id, ...(toPlain(d.data()) as Data)})),
    waitlist: waitingSnap.docs.map((d) => ({entryId: d.id, ...(toPlain(d.data()) as Data)})),
  };
}

export const getMyArenaScheduleSubscriptions = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  try {
    return await getMySubscriptionsCore(getFirestore(), uid, dayKeyFromEventDate(new Date()), Date.now());
  } catch (e) {
    return rethrowSchedule("getMyArenaScheduleSubscriptions", e);
  }
});
