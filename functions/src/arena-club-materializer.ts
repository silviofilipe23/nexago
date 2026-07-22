import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  clubScheduleLabel,
  materializeClubSeries,
  parseArenaClub,
} from "./arena-club";
import {ARENA_CLUBS, CLUB_HORIZON_DAYS} from "./arena-club-constants";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";

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
    logger.warn("materializeArenaClubSessions: notificação ao gestor falhou", e);
  }
}

/**
 * Rola o horizonte de materialização das séries de clubinho ativas
 * (diário, 03:10 SP — depois do materializador de mensalistas).
 * Idempotente: sessões têm ID determinístico `club_{clubId}_{date}`.
 */
export const materializeArenaClubSessions = onSchedule({
  schedule: "every day 03:10",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());
  const horizonKey = addDaysToDateKey(todayKey, CLUB_HORIZON_DAYS);

  const clubsSnap = await db
    .collection(ARENA_CLUBS)
    .where("status", "==", "active")
    .where("materializedUntil", "<", horizonKey)
    .limit(200)
    .get();

  if (clubsSnap.empty) {
    logger.info("materializeArenaClubSessions: nenhum clubinho pendente");
    return;
  }

  let created = 0;
  let skipped = 0;
  let autoPaused = 0;

  for (const doc of clubsSnap.docs) {
    const club = parseArenaClub(doc.data() as Record<string, unknown>);
    const materializedUntil = String(doc.data()["materializedUntil"] ?? todayKey);

    if (club.weekday == null) {
      // Só sessões avulsas — mantém fora da fila do scheduler.
      await doc.ref.set({materializedUntil: horizonKey}, {merge: true});
      continue;
    }

    const arenaSnap = await db.collection("arenas").doc(club.arenaId).get();
    const managerUserId = typeof arenaSnap.data()?.["managerUserId"] === "string" ?
      (arenaSnap.data()?.["managerUserId"] as string).trim() :
      "";

    // Quadras removidas saem da série; sem nenhuma quadra, pausa o clubinho.
    const existingCourtIds: string[] = [];
    const existingCourtNames: string[] = [];
    for (let i = 0; i < club.courtIds.length; i++) {
      const courtSnap = await db
        .collection("arenas").doc(club.arenaId)
        .collection("courts").doc(club.courtIds[i]!)
        .get();
      if (courtSnap.exists) {
        existingCourtIds.push(club.courtIds[i]!);
        existingCourtNames.push(club.courtNames[i] ?? "Quadra");
      }
    }
    if (existingCourtIds.length === 0) {
      await doc.ref.set({
        status: "paused",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await notifyManagerSafe(managerUserId, {
        title: "Clubinho pausado",
        body: `O clubinho "${club.name}" foi pausado porque as quadras dele foram removidas.`,
        type: "club_paused_courts_deleted",
        data: {clubId: doc.id, arenaId: club.arenaId},
      });
      autoPaused += 1;
      continue;
    }

    try {
      const result = await materializeClubSeries(
        db,
        doc.id,
        {...club, courtIds: existingCourtIds, courtNames: existingCourtNames},
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

      if (result.skippedDates.length > 0 || result.partialDates.length > 0) {
        const parts: string[] = [];
        if (result.skippedDates.length > 0) {
          parts.push(`${result.skippedDates.length} data(s) sem nenhuma quadra livre`);
        }
        if (result.partialDates.length > 0) {
          parts.push(`${result.partialDates.length} data(s) com quadra em conflito`);
        }
        await notifyManagerSafe(managerUserId, {
          title: "Conflito no clubinho",
          body: `Clubinho "${club.name}" (${clubScheduleLabel(club)}): ${parts.join(" e ")}.`,
          type: "club_occurrence_conflict",
          data: {
            clubId: doc.id,
            arenaId: club.arenaId,
            skippedDates: result.skippedDates.join(","),
          },
        });
      }
    } catch (e) {
      logger.error("materializeArenaClubSessions: falha no clubinho", {
        clubId: doc.id,
        error: e,
      });
    }
  }

  logger.info("materializeArenaClubSessions: ciclo concluído", {
    clubs: clubsSnap.size,
    created,
    skipped,
    autoPaused,
  });
});
