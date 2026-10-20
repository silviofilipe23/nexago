/**
 * Aulas pelo lado do professor: a lista da chamada das próprias aulas.
 *
 * As coleções de aula seguem fechadas à equipe da arena (rules). O professor com vínculo `ACTIVE`
 * e "Gerenciar as próprias aulas" lê a lista por esta callable — nome, foto, tipo e marca, sem
 * telefone nem financeiro — e grava a chamada pela mesma `saveArenaClassAttendance` da equipe
 * (`authorizeClassAttendance`). Spec: `docs/superpowers/specs/2026-10-20-vinculos-permissoes-reserva-aulas-design.md`.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASSES, ARENA_CLASS_SESSIONS, CLASS_STUDENTS, type AttendanceMark} from "./arena-class-constants";
import {parseClassSession, str, type ClassSessionData} from "./arena-class";
import {studentAttendsWeekday} from "./arena-class-ledger";
import {isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {requireArenaProfessorPermission} from "./arena-professor-permissions";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export interface TeacherRosterStudent {
  studentId: string;
  name: string;
  photoUrl: string | null;
  kind: "regular" | "makeup" | "trial";
  mark: AttendanceMark | null;
}

export interface TeacherRosterSession {
  sessionId: string;
  arenaId: string;
  arenaName: string;
  classId: string;
  className: string;
  date: string;
  startTime: string;
  endTime: string;
  courtName: string;
  status: "scheduled" | "canceled" | "completed";
  teacherNote: string | null;
  /** A chamada abre no dia da aula e fica fechada em aula cancelada (`saveClassAttendanceCore`). */
  attendanceOpen: boolean;
}

/**
 * Lista da chamada — mesma composição do app da arena (`arenaClassAttendanceRoster`): alunos
 * ativos que fazem aquele dia da semana, quem saiu/pausou mas já tem marca nesta aula, e no fim os
 * encaixes. Ordem alfabética em cada bloco.
 */
export function buildTeacherRoster(
  session: ClassSessionData,
  students: ReadonlyArray<{id: string; data: Record<string, unknown>}>,
): TeacherRosterStudent[] {
  const weekday = isoWeekdayOfDateKey(session.date);
  const byName = (a: TeacherRosterStudent, b: TeacherRosterStudent) => a.name.localeCompare(b.name, "pt-BR");
  const markOf = (id: string) => session.attendance[id]?.mark ?? null;
  const regulars = students
    .filter(({id, data}) => {
      if (session.extras[id]) return false;
      const expected = data["status"] === "active" && studentAttendsWeekday(data, weekday);
      return expected || session.attendance[id] != null;
    })
    .map(({id, data}): TeacherRosterStudent => ({
      studentId: id,
      name: str(data["name"]) || "Aluno",
      photoUrl: str(data["photoUrl"]) || null,
      kind: "regular",
      mark: markOf(id),
    }))
    .sort(byName);
  const extras = Object.entries(session.extras)
    .map(([id, extra]): TeacherRosterStudent => ({
      studentId: id,
      name: extra.name,
      photoUrl: null,
      kind: extra.kind === "makeup" ? "makeup" : "trial",
      mark: markOf(id),
    }))
    .sort(byName);
  return [...regulars, ...extras];
}

/** Só o professor da aula, com a permissão valendo agora naquela arena. */
export async function loadTeacherClassSessionRosterCore(
  db: Firestore,
  sessionId: string,
  uid: string,
  todayKey: string,
): Promise<{session: TeacherRosterSession; students: TeacherRosterStudent[]}> {
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const snap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const data = snap.data() as Record<string, unknown>;
  if (str(data["teacherUserId"]) !== uid) {
    throw new HttpsError("permission-denied", "Esta aula não é sua.");
  }
  const session = parseClassSession(data);
  await requireArenaProfessorPermission(db, session.arenaId, uid, "canManageOwnLessons");

  const studentsSnap = await db.collection(ARENA_CLASSES).doc(session.classId).collection(CLASS_STUDENTS).get();
  const students = buildTeacherRoster(
    session,
    studentsSnap.docs.map((d) => ({id: d.id, data: d.data() as Record<string, unknown>})),
  );
  const status = session.status === "canceled" || session.status === "completed" ? session.status : "scheduled";
  return {
    session: {
      sessionId,
      arenaId: session.arenaId,
      arenaName: str(data["arenaName"]) || "Arena",
      classId: session.classId,
      className: session.className,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      courtName: str(data["courtName"]) || "Quadra",
      status,
      teacherNote: str(data["teacherNote"]) || null,
      attendanceOpen: status !== "canceled" && session.date <= todayKey,
    },
    students,
  };
}

export const getMyClassSessionRoster = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const sessionId = str((request.data as Record<string, unknown> | null)?.["sessionId"]);
  return loadTeacherClassSessionRosterCore(getFirestore(), sessionId, uid, dayKeyFromEventDate(new Date()));
});
