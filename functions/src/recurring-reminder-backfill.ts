import {Timestamp} from "firebase-admin/firestore";
import {BOOKING_REMINDER_15M_MINUTES_BEFORE} from "./arena-booking-reminder-15m";

const ARENA_TIMEZONE_OFFSET = "-03:00";
const LIVE_STATUSES = new Set(["active", "confirmed"]);

/**
 * Ocorrência de horário fixo que perdeu o `reminder15mAt`: antes da correção, editar ou retomar
 * a série regravava a ocorrência no mesmo id sem o campo, e o gatilho de criação não rodava de
 * novo. Devolve quando o lembrete deve disparar, ou `null` se não há nada a gravar (já tem o
 * campo, não é de série, não está ativa ou a hora do lembrete já passou).
 * Usado por `scripts/backfill-recurring-reminder-15m.js`.
 */
export function missingRecurringReminder15mAt(
  data: Record<string, unknown>,
  now: Date,
): Date | null {
  if (data["reminder15mAt"] instanceof Timestamp) return null;

  const seriesId = typeof data["recurringBookingId"] === "string" ? data["recurringBookingId"].trim() : "";
  if (!seriesId) return null;

  const status = typeof data["status"] === "string" ? data["status"].toLowerCase() : "";
  if (!LIVE_STATUSES.has(status)) return null;

  const dateKey = typeof data["date"] === "string" ? data["date"].trim() : "";
  const startTime = typeof data["startTime"] === "string" ? data["startTime"].trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^\d{2}:\d{2}$/.test(startTime)) return null;

  const startAt = new Date(`${dateKey}T${startTime}:00${ARENA_TIMEZONE_OFFSET}`);
  if (Number.isNaN(startAt.getTime())) return null;

  const reminderAt = new Date(startAt.getTime() - BOOKING_REMINDER_15M_MINUTES_BEFORE * 60 * 1000);
  return reminderAt.getTime() > now.getTime() ? reminderAt : null;
}
