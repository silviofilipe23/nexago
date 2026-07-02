import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  ARENA_RECURRING_BOOKINGS,
  RECURRING_HORIZON_DAYS,
  WEEKDAY_LABELS_PT,
  addDaysToDateKey,
  cancelFutureOccurrences,
  materializeSeriesOccurrences,
  type RecurringSeriesData,
} from "./arena-recurring-booking";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";

function parseSeries(data: Record<string, unknown>): RecurringSeriesData {
  return {
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    courtId: String(data["courtId"] ?? ""),
    courtName: String(data["courtName"] ?? "Quadra"),
    weekday: Number(data["weekday"] ?? 0),
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null,
    customerName: typeof data["customerName"] === "string" ? data["customerName"] : null,
    amountReais: Number(data["amountReais"] ?? 0),
    status: String(data["status"] ?? ""),
    startDate: String(data["startDate"] ?? ""),
    endDate: typeof data["endDate"] === "string" ? data["endDate"] : null,
    skippedDates: Array.isArray(data["skippedDates"]) ?
      (data["skippedDates"] as unknown[]).map(String) :
      [],
  };
}

async function notifyManagerSafe(
  managerUserId: string,
  input: {title: string; body: string; type: string; data: Record<string, string>},
): Promise<void> {
  if (!managerUserId) return;
  try {
    await deliverNotificationToUser({
      userId: managerUserId,
      title: input.title,
      body: input.body,
      type: input.type,
      data: input.data,
      requireInteraction: false,
    });
  } catch (e) {
    logger.warn("materializeArenaRecurringBookings: notificação ao gestor falhou", e);
  }
}

/**
 * Rola o horizonte de materialização das séries ativas (diário, 03:00 SP).
 * Idempotente: ocorrências têm ID determinístico `rec_{seriesId}_{date}`.
 */
export const materializeArenaRecurringBookings = onSchedule({
  schedule: "every day 03:00",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);

  const seriesSnap = await db
    .collection(ARENA_RECURRING_BOOKINGS)
    .where("status", "==", "active")
    .where("materializedUntil", "<", horizonKey)
    .limit(300)
    .get();

  if (seriesSnap.empty) {
    logger.info("materializeArenaRecurringBookings: nenhuma série pendente");
    return;
  }

  let created = 0;
  let skipped = 0;
  let autoCanceled = 0;

  for (const doc of seriesSnap.docs) {
    const series = parseSeries(doc.data() as Record<string, unknown>);
    const materializedUntil = String(doc.data()["materializedUntil"] ?? todayKey);

    const arenaSnap = await db.collection("arenas").doc(series.arenaId).get();
    const managerUserId = typeof arenaSnap.data()?.["managerUserId"] === "string" ?
      (arenaSnap.data()?.["managerUserId"] as string).trim() :
      "";

    const seriesLabel =
      `${WEEKDAY_LABELS_PT[series.weekday] ?? "?"} ${series.startTime} · ${series.courtName}`;

    // Quadra excluída → encerra a série e libera as ocorrências futuras.
    const courtSnap = await db
      .collection("arenas").doc(series.arenaId)
      .collection("courts").doc(series.courtId)
      .get();
    if (!courtSnap.exists) {
      await doc.ref.set({
        status: "canceled",
        canceledAt: FieldValue.serverTimestamp(),
        cancelReason: "court_deleted",
      }, {merge: true});
      await cancelFutureOccurrences(db, doc.id, "recurring_series_court_deleted");
      await notifyManagerSafe(managerUserId, {
        title: "Horário fixo encerrado",
        body: `O horário fixo de ${seriesLabel} foi encerrado porque a quadra foi removida.`,
        type: "recurring_series_court_deleted",
        data: {recurringBookingId: doc.id, arenaId: series.arenaId},
      });
      autoCanceled += 1;
      continue;
    }

    try {
      const result = await materializeSeriesOccurrences(
        db,
        doc.id,
        series,
        materializedUntil,
        horizonKey,
      );
      created += result.createdDates.length;
      skipped += result.skippedDates.length;

      await doc.ref.set({
        materializedUntil: horizonKey,
        ...(result.skippedDates.length > 0 ?
          {skippedDates: FieldValue.arrayUnion(...result.skippedDates)} :
          {}),
      }, {merge: true});

      if (result.skippedDates.length > 0) {
        await notifyManagerSafe(managerUserId, {
          title: "Conflito no horário fixo",
          body: `${result.skippedDates.length} data(s) do horário fixo de ${seriesLabel} ` +
            "não puderam ser reservadas por conflito com outra reserva ou bloqueio.",
          type: "recurring_occurrence_conflict",
          data: {
            recurringBookingId: doc.id,
            arenaId: series.arenaId,
            skippedDates: result.skippedDates.join(","),
          },
        });
      }
    } catch (e) {
      logger.error("materializeArenaRecurringBookings: falha na série", {
        seriesId: doc.id,
        error: e,
      });
    }
  }

  logger.info("materializeArenaRecurringBookings: ciclo concluído", {
    series: seriesSnap.size,
    created,
    skipped,
    autoCanceled,
  });
});
