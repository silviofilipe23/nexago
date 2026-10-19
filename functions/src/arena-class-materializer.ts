import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  MATERIALIZED_DONE,
  classHorizonKey,
  classScheduleLabel,
  materializeClassRange,
  materializedUntilAfter,
  parseArenaClass,
  releaseFutureClassSessions,
} from "./arena-class";
import {ARENA_CLASSES, CLASS_HORIZON_DAYS} from "./arena-class-constants";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";

async function notifyManagerSafe(
  managerUserId: string,
  input: {title: string; body: string; type: string; data: Record<string, string>},
): Promise<void> {
  if (!managerUserId) return;
  try {
    await deliverNotificationToUser({...input, userId: managerUserId, requireInteraction: false});
  } catch (e) {
    logger.warn("materializeArenaClassSessions: notificação ao gestor falhou", e);
  }
}

/**
 * Rola o horizonte das turmas ativas (diário, 03:20 SP — depois do mensalista
 * e do clubinho, que têm prioridade na quadra que já era deles). Idempotente:
 * aulas têm id determinístico `class_{classId}_{date}`.
 */
export const materializeArenaClassSessions = onSchedule({
  schedule: "every day 03:20",
  timeZone: "America/Sao_Paulo",
}, async () => {
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());

  const classesSnap = await db
    .collection(ARENA_CLASSES)
    .where("status", "==", "active")
    .where("materializedUntil", "<", addDaysToDateKey(todayKey, CLASS_HORIZON_DAYS))
    .limit(300)
    .get();

  if (classesSnap.empty) {
    logger.info("materializeArenaClassSessions: nenhuma turma pendente");
    return;
  }

  let created = 0;
  let conflicts = 0;
  let autoPaused = 0;

  for (const doc of classesSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const cls = parseArenaClass(data);
    const horizonKey = classHorizonKey(cls, todayKey);
    const materializedUntil = String(data["materializedUntil"] ?? todayKey);

    // Avulsa (ou turma sem data nova a gerar): sai da fila de vez.
    if (materializedUntilAfter(cls, materializedUntil) === MATERIALIZED_DONE) {
      await doc.ref.set({materializedUntil: MATERIALIZED_DONE}, {merge: true});
      continue;
    }

    const arenaSnap = await db.collection("arenas").doc(cls.arenaId).get();
    const managerUserId = typeof arenaSnap.data()?.["managerUserId"] === "string" ?
      (arenaSnap.data()?.["managerUserId"] as string).trim() :
      "";

    // Quadra removida → pausa a turma e libera as aulas futuras.
    const courtSnap = await db
      .collection("arenas").doc(cls.arenaId)
      .collection("courts").doc(cls.courtId)
      .get();
    if (!courtSnap.exists) {
      await releaseFutureClassSessions(db, doc.id, Date.now());
      await doc.ref.set({
        status: "paused",
        pausedReason: "court_deleted",
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      await notifyManagerSafe(managerUserId, {
        title: "Turma pausada",
        body: `A turma "${cls.name}" foi pausada porque a quadra dela foi removida. ` +
          "Escolha outra quadra e reative.",
        type: "arena_class_paused_court_deleted",
        data: {classId: doc.id, arenaId: cls.arenaId},
      });
      autoPaused += 1;
      continue;
    }

    try {
      const result = await materializeClassRange(db, doc.id, cls, materializedUntil, horizonKey);
      created += result.createdDates.length;
      conflicts += result.conflictDates.length;
      const previous = Array.isArray(data["conflictDates"]) ? (data["conflictDates"] as unknown[]).map(String) : [];
      await doc.ref.set({
        materializedUntil: materializedUntilAfter(cls, horizonKey),
        conflictDates: [...new Set([...previous, ...result.conflictDates])].sort(),
      }, {merge: true});

      if (result.conflictDates.length > 0) {
        await notifyManagerSafe(managerUserId, {
          title: "Conflito na agenda da turma",
          body: `${result.conflictDates.length} aula(s) da turma "${cls.name}" (${classScheduleLabel(cls)}) ` +
            "não foram agendadas porque a quadra já estava ocupada.",
          type: "arena_class_occurrence_conflict",
          data: {classId: doc.id, arenaId: cls.arenaId, conflictDates: result.conflictDates.join(",")},
        });
      }
    } catch (e) {
      logger.error("materializeArenaClassSessions: falha na turma", {classId: doc.id, error: e});
    }
  }

  logger.info("materializeArenaClassSessions: ciclo concluído", {
    classes: classesSnap.size,
    created,
    conflicts,
    autoPaused,
  });
});
