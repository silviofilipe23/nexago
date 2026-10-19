/**
 * Lembrete de aula 2h antes: push para os alunos com conta NexaGO que vêm naquele dia
 * (turma + encaixes) e para o professor. Agendador a cada 5 min com janela de 115–125 min,
 * como os lembretes de reserva (`arena-booking-reminders.ts`); a aula guarda
 * `reminder2hSentAt` numa transação para não avisar duas vezes.
 */
import * as logger from "firebase-functions/logger";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {ARENA_CLASSES, ARENA_CLASS_SESSIONS, CLASS_STUDENTS} from "./arena-class-constants";
import {classRulesRef, parseClassRules, studentAttendsWeekday} from "./arena-class-ledger";
import {
  deliverNotificationToUser,
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
} from "./notification-delivery";

export const CLASS_REMINDER_TYPE = "arena_class_reminder_2h";
export const CLASS_REMINDER_WINDOW_MIN = 115;
export const CLASS_REMINDER_WINDOW_MAX = 125;

export interface ClassReminderDeps {
  notify: (input: {
    userId: string;
    title: string;
    body: string;
    type: string;
    data: Record<string, string>;
  }) => Promise<void>;
}

const defaultDeps: ClassReminderDeps = {
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

interface ReminderSession {
  arenaId: string;
  arenaName: string;
  classId: string;
  className: string;
  courtName: string;
  date: string;
  startTime: string;
  teacherUserId: string | null;
  extras: Array<{athleteId: string | null}>;
}

function parseReminderSession(data: Record<string, unknown>): ReminderSession {
  const rawExtras = data["extras"];
  const extras = rawExtras != null && typeof rawExtras === "object" && !Array.isArray(rawExtras) ?
    Object.values(rawExtras as Record<string, unknown>).map((e) => {
      const athleteId = e != null && typeof e === "object" ? (e as Record<string, unknown>)["athleteId"] : null;
      return {athleteId: typeof athleteId === "string" && athleteId ? athleteId : null};
    }) :
    [];
  const teacherUserId = data["teacherUserId"];
  return {
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    classId: String(data["classId"] ?? ""),
    className: String(data["className"] ?? "Aula"),
    courtName: String(data["courtName"] ?? "Quadra"),
    date: String(data["date"] ?? ""),
    startTime: String(data["startTime"] ?? ""),
    teacherUserId: typeof teacherUserId === "string" && teacherUserId ? teacherUserId : null,
    extras,
  };
}

/** Texto do lembrete: o aluno sabe onde é; o professor sabe quantos esperar. */
export function classReminderMessage(
  session: Pick<ReminderSession, "className" | "courtName" | "arenaName" | "startTime">,
  role: "student" | "teacher",
  studentCount: number,
): {title: string; body: string} {
  if (role === "teacher") {
    return {
      title: `Você dá aula às ${session.startTime}`,
      body: `${session.className} · ${session.courtName} · ${studentCount} aluno${studentCount === 1 ? "" : "s"} na lista. Começa em 2 horas.`,
    };
  }
  return {
    title: `Aula às ${session.startTime}`,
    body: `${session.className} · ${session.courtName} · ${session.arenaName}. Começa em 2 horas — ` +
      "não vai conseguir ir? Avise a arena.",
  };
}

/**
 * Envia os lembretes das aulas que começam entre 115 e 125 min a partir de `now`. Pula aula
 * cancelada/fechada, arena com a regra desligada e aula já avisada.
 */
export async function sendClassRemindersCore(
  db: Firestore,
  now: Date,
  deps: ClassReminderDeps = defaultDeps,
): Promise<{sessions: number; notified: number}> {
  const from = Timestamp.fromMillis(now.getTime() + CLASS_REMINDER_WINDOW_MIN * 60_000);
  const to = Timestamp.fromMillis(now.getTime() + CLASS_REMINDER_WINDOW_MAX * 60_000);
  const snap = await db.collection(ARENA_CLASS_SESSIONS)
    .where("startAt", ">=", from)
    .where("startAt", "<=", to)
    .get();

  const rulesByArena = new Map<string, boolean>();
  let sessions = 0;
  let notified = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data["status"] !== "scheduled" || data["reminder2hSentAt"] != null) continue;
    const session = parseReminderSession(data);
    if (!session.arenaId || !session.classId) continue;

    if (!rulesByArena.has(session.arenaId)) {
      const rules = parseClassRules((await classRulesRef(db, session.arenaId).get()).data());
      rulesByArena.set(session.arenaId, rules.classReminderEnabled);
    }
    if (!rulesByArena.get(session.arenaId)) continue;

    // Marca antes de mandar: lembrete repetido incomoda mais que um que falhou.
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const d = fresh.data();
      if (!fresh.exists || d?.["status"] !== "scheduled" || d?.["reminder2hSentAt"] != null) return false;
      tx.set(doc.ref, {reminder2hSentAt: FieldValue.serverTimestamp()}, {merge: true});
      return true;
    });
    if (!claimed) continue;
    sessions += 1;

    const weekday = isoWeekdayOfDateKey(session.date);
    const roster = await db.collection(ARENA_CLASSES).doc(session.classId)
      .collection(CLASS_STUDENTS)
      .where("status", "==", "active")
      .get();
    const students = new Set<string>();
    let studentCount = 0;
    for (const s of roster.docs) {
      const sd = s.data() as Record<string, unknown>;
      if (!studentAttendsWeekday(sd, weekday)) continue;
      studentCount += 1;
      const athleteId = sd["athleteId"];
      if (typeof athleteId === "string" && athleteId) students.add(athleteId);
    }
    studentCount += session.extras.length;
    for (const e of session.extras) if (e.athleteId) students.add(e.athleteId);
    if (session.teacherUserId) students.delete(session.teacherUserId);

    const recipients: Array<[string, "student" | "teacher"]> = [...students].map((uid) => [uid, "student"]);
    if (session.teacherUserId) recipients.push([session.teacherUserId, "teacher"]);

    for (const [userId, role] of recipients) {
      const {title, body} = classReminderMessage(session, role, studentCount);
      try {
        await deps.notify({
          userId,
          title,
          body,
          type: CLASS_REMINDER_TYPE,
          data: {classSessionId: doc.id, arenaId: session.arenaId, date: session.date, startTime: session.startTime, role},
        });
        notified += 1;
      } catch (e) {
        logger.warn("sendClassRemindersCore: notificação falhou", {sessionId: doc.id, userId, error: e});
      }
    }
  }
  return {sessions, notified};
}

export const sendArenaClassReminders = onSchedule({
  schedule: "every 5 minutes",
  timeZone: "America/Sao_Paulo",
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await sendClassRemindersCore(getFirestore(), new Date());
  if (result.sessions > 0) logger.info("sendArenaClassReminders", result);
});
