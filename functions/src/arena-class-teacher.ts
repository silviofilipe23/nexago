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
  /**
   * Aluno com conta que liberou aparecer em story de treino
   * (`privacyPreferences.showOthers.storyTags`) — o professor só marca esses. Só o booleano: a
   * preferência em si e o uid não saem daqui.
   */
  storyTaggable: boolean;
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
      storyTaggable: false,
    }))
    .sort(byName);
  const extras = Object.entries(session.extras)
    .map(([id, extra]): TeacherRosterStudent => ({
      studentId: id,
      name: extra.name,
      photoUrl: null,
      kind: extra.kind === "makeup" ? "makeup" : "trial",
      mark: markOf(id),
      storyTaggable: false,
    }))
    .sort(byName);
  return [...regulars, ...extras];
}

/** Conta NexaGO de cada linha da chamada (aluno da turma ou encaixe), quando há. */
export function rosterAthleteIds(
  session: ClassSessionData,
  students: ReadonlyArray<{id: string; data: Record<string, unknown>}>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const {id, data} of students) {
    const athleteId = str(data["athleteId"]);
    if (athleteId) out.set(id, athleteId);
  }
  for (const [id, extra] of Object.entries(session.extras)) {
    if (extra.athleteId) out.set(id, extra.athleteId);
  }
  return out;
}

/** Liberou aparecer em story de treino de outra pessoa? Opt-in: sem a chave, não. */
export function allowsStoryTags(user: Record<string, unknown> | undefined): boolean {
  const privacy = user?.["privacyPreferences"];
  if (!privacy || typeof privacy !== "object") return false;
  const showOthers = (privacy as Record<string, unknown>)["showOthers"];
  if (!showOthers || typeof showOthers !== "object") return false;
  return (showOthers as Record<string, unknown>)["storyTags"] === true;
}

/** Quais dessas contas liberaram a marcação no story (uma leitura em lote dos perfis). */
export async function storyTaggableAthletes(db: Firestore, athleteIds: Iterable<string>): Promise<Set<string>> {
  const ids = [...new Set(athleteIds)];
  if (ids.length === 0) return new Set();
  const snaps = await db.getAll(...ids.map((id) => db.collection("users").doc(id)));
  const out = new Set<string>();
  snaps.forEach((snap, i) => {
    if (snap.exists && allowsStoryTags(snap.data() as Record<string, unknown>)) out.add(ids[i]!);
  });
  return out;
}

export interface TeacherClassSessionContext {
  data: Record<string, unknown>;
  session: ClassSessionData;
  students: TeacherRosterStudent[];
  /** Linha da chamada → conta do aluno. Fica no servidor: não vai na resposta. */
  athleteIds: Map<string, string>;
}

/** Aula + chamada, só para o professor da aula com a permissão valendo agora naquela arena. */
export async function loadTeacherClassSessionContext(
  db: Firestore,
  sessionId: string,
  uid: string,
): Promise<TeacherClassSessionContext> {
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
  const docs = studentsSnap.docs.map((d) => ({id: d.id, data: d.data() as Record<string, unknown>}));
  const roster = buildTeacherRoster(session, docs);
  const athleteIds = rosterAthleteIds(session, docs);
  const taggable = await storyTaggableAthletes(db, roster.flatMap((s) => {
    const athleteId = athleteIds.get(s.studentId);
    return athleteId ? [athleteId] : [];
  }));
  const students = roster.map((s) => {
    const athleteId = athleteIds.get(s.studentId);
    return {...s, storyTaggable: athleteId != null && taggable.has(athleteId)};
  });
  return {data, session, students, athleteIds};
}

/** Só o professor da aula, com a permissão valendo agora naquela arena. */
export async function loadTeacherClassSessionRosterCore(
  db: Firestore,
  sessionId: string,
  uid: string,
  todayKey: string,
): Promise<{session: TeacherRosterSession; students: TeacherRosterStudent[]}> {
  const {data, session, students} = await loadTeacherClassSessionContext(db, sessionId, uid);
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
