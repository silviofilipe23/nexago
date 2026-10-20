/**
 * Aulas na agenda do atleta (app e portal web).
 *
 * As coleções de aula são só da equipe da arena (rules) — abrir `arenaClassSessions` para o
 * atleta exporia a chamada dos colegas. Então a agenda sai desta callable, montada no servidor e
 * sem dado de outro aluno (precedente: `getMySquad`):
 * - aluno: aulas das turmas em que está (`classStudents.athleteId`), nos dias da semana que faz —
 *   futura só como ativo (pausado não, como nos lembretes); passada só se tem marca na chamada;
 * - encaixe: aulas com o atleta em `extraAthleteIds` (reposição/experimental);
 * - professor: aulas com `teacherUserId` = ele, com a contagem da lista (sem nomes).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {addDaysToDateKey, isValidDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {ARENA_CLASSES, ARENA_CLASS_SESSIONS, CLASS_STUDENTS} from "./arena-class-constants";
import {studentAttendsWeekday} from "./arena-class-ledger";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export const MAX_AGENDA_RANGE_DAYS = 100;
const MAX_CLASSES = 30;

export interface ClassMembership {
  studentId: string;
  classId: string;
  arenaId: string;
  status: string;
  weekdays: number[] | null;
}

export interface AgendaSession {
  id: string;
  data: Record<string, unknown>;
}

export interface ClassAgendaItem {
  sessionId: string;
  arenaId: string;
  arenaName: string;
  classId: string;
  className: string;
  teacherName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  /** ISO 8601 (UTC). */
  startAt: string | null;
  status: "scheduled" | "canceled" | "completed";
  role: "student" | "teacher";
  kind: "regular" | "makeup" | "trial";
  myMark: "present" | "absent" | "excused" | null;
  /** Só para o professor: alunos do dia + encaixes. */
  studentCount: number | null;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function recordOf(v: unknown): Record<string, Record<string, unknown>> {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, Record<string, unknown>> : {};
}

function markOf(attendance: Record<string, Record<string, unknown>>, studentId: string): ClassAgendaItem["myMark"] {
  const mark = attendance[studentId]?.["mark"];
  return mark === "present" || mark === "absent" || mark === "excused" ? mark : null;
}

function baseItem(s: AgendaSession): Omit<ClassAgendaItem, "role" | "kind" | "myMark" | "studentCount"> {
  const d = s.data;
  const startAt = d["startAt"];
  const status = str(d["status"]);
  return {
    sessionId: s.id,
    arenaId: str(d["arenaId"]),
    arenaName: str(d["arenaName"], "Arena"),
    classId: str(d["classId"]),
    className: str(d["className"], "Aula"),
    teacherName: str(d["teacherName"]),
    courtName: str(d["courtName"]),
    date: str(d["date"]),
    startTime: str(d["startTime"]),
    endTime: str(d["endTime"]),
    startAt: startAt instanceof Timestamp ? startAt.toDate().toISOString() : null,
    status: status === "canceled" || status === "completed" ? status : "scheduled",
  };
}

/**
 * Itens da agenda, um por aula (professor ganha de aluno se for os dois), em ordem de horário.
 * `rosterCounts`: classId → alunos ativos por dia da semana (para o professor).
 */
export function buildClassAgendaItems(input: {
  uid: string;
  todayKey: string;
  memberships: readonly ClassMembership[];
  /** Aulas das turmas do aluno (todas as datas do intervalo). */
  classSessions: readonly AgendaSession[];
  extraSessions: readonly AgendaSession[];
  teacherSessions: readonly AgendaSession[];
  rosterCounts: ReadonlyMap<string, ReadonlyMap<number, number>>;
}): ClassAgendaItem[] {
  const items = new Map<string, ClassAgendaItem>();
  const byClass = new Map<string, ClassMembership[]>();
  for (const m of input.memberships) byClass.set(m.classId, [...(byClass.get(m.classId) ?? []), m]);

  for (const s of input.classSessions) {
    const attendance = recordOf(s.data["attendance"]);
    const weekday = isoWeekdayOfDateKey(str(s.data["date"]));
    for (const m of byClass.get(str(s.data["classId"])) ?? []) {
      const date = str(s.data["date"]);
      const show = date < input.todayKey ?
        attendance[m.studentId] != null :
        m.status === "active" && studentAttendsWeekday({weekdays: m.weekdays ?? undefined}, weekday);
      if (!show) continue;
      items.set(s.id, {...baseItem(s), role: "student", kind: "regular", myMark: markOf(attendance, m.studentId), studentCount: null});
    }
  }

  for (const s of input.extraSessions) {
    if (items.has(s.id)) continue;
    const extras = recordOf(s.data["extras"]);
    const entry = Object.entries(extras).find(([, e]) => e["athleteId"] === input.uid);
    if (!entry) continue;
    const [studentId, extra] = entry;
    const kind = extra["kind"] === "trial" ? "trial" : "makeup";
    items.set(s.id, {
      ...baseItem(s), role: "student", kind, myMark: markOf(recordOf(s.data["attendance"]), studentId), studentCount: null,
    });
  }

  for (const s of input.teacherSessions) {
    if (s.data["teacherUserId"] !== input.uid) continue;
    const weekday = isoWeekdayOfDateKey(str(s.data["date"]));
    const regulars = input.rosterCounts.get(str(s.data["classId"]))?.get(weekday) ?? 0;
    const extras = Object.keys(recordOf(s.data["extras"])).length;
    const marked = Object.keys(recordOf(s.data["attendance"])).length;
    // Aula passada com chamada: quem estava na lista daquele dia; futura: a turma de hoje.
    const count = str(s.data["date"]) < input.todayKey && marked > 0 ? marked : regulars + extras;
    items.set(s.id, {...baseItem(s), role: "teacher", kind: "regular", myMark: null, studentCount: count});
  }

  return [...items.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className, "pt-BR"));
}

/** Lê o que o atleta precisa para a agenda e monta os itens. */
export async function loadClassAgenda(db: Firestore, uid: string, fromKey: string, toKey: string, todayKey: string): Promise<ClassAgendaItem[]> {
  const sessions = db.collection(ARENA_CLASS_SESSIONS);
  const [memberSnap, extraSnap, teacherSnap] = await Promise.all([
    db.collectionGroup(CLASS_STUDENTS).where("athleteId", "==", uid).get(),
    sessions.where("extraAthleteIds", "array-contains", uid).where("date", ">=", fromKey).where("date", "<=", toKey).get(),
    sessions.where("teacherUserId", "==", uid).where("date", ">=", fromKey).where("date", "<=", toKey).get(),
  ]);

  const memberships: ClassMembership[] = memberSnap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        studentId: d.id,
        classId: str(data["classId"]) || d.ref.parent.parent?.id || "",
        arenaId: str(data["arenaId"]),
        status: str(data["status"]),
        weekdays: Array.isArray(data["weekdays"]) ? (data["weekdays"] as unknown[]).map(Number) : null,
      };
    })
    // Removido só vale pelo histórico (marca na chamada); a busca da turma é a mesma.
    .filter((m) => m.classId && m.arenaId)
    .slice(0, MAX_CLASSES);

  const classSessionSnaps = await Promise.all([...new Map(memberships.map((m) => [m.classId, m])).values()].map((m) =>
    sessions.where("arenaId", "==", m.arenaId).where("classId", "==", m.classId)
      .where("date", ">=", fromKey).where("date", "<=", toKey).get()));

  const teacherClassIds = [...new Set(teacherSnap.docs.map((d) => str(d.data()["classId"])).filter(Boolean))].slice(0, MAX_CLASSES);
  const rosterCounts = new Map<string, Map<number, number>>();
  await Promise.all(teacherClassIds.map(async (classId) => {
    const roster = await db.collection(ARENA_CLASSES).doc(classId).collection(CLASS_STUDENTS).where("status", "==", "active").get();
    const perDay = new Map<number, number>();
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      perDay.set(weekday, roster.docs.filter((d) => studentAttendsWeekday(d.data() as Record<string, unknown>, weekday)).length);
    }
    rosterCounts.set(classId, perDay);
  }));

  const toSessions = (docs: FirebaseFirestore.QueryDocumentSnapshot[]): AgendaSession[] =>
    docs.map((d) => ({id: d.id, data: d.data() as Record<string, unknown>}));
  return buildClassAgendaItems({
    uid,
    todayKey,
    memberships,
    classSessions: classSessionSnaps.flatMap((snap) => toSessions(snap.docs)),
    extraSessions: toSessions(extraSnap.docs),
    teacherSessions: toSessions(teacherSnap.docs),
    rosterCounts,
  });
}

/** Intervalo pedido, limitado (padrão: 30 dias para trás, 35 para a frente — o horizonte das aulas). */
export function parseAgendaRange(input: Record<string, unknown>, todayKey: string): {fromKey: string; toKey: string} {
  const fromKey = typeof input["fromKey"] === "string" && isValidDateKey(input["fromKey"]) ? input["fromKey"] : addDaysToDateKey(todayKey, -30);
  const toKey = typeof input["toKey"] === "string" && isValidDateKey(input["toKey"]) ? input["toKey"] : addDaysToDateKey(todayKey, 35);
  if (toKey < fromKey) throw new HttpsError("invalid-argument", "Intervalo inválido.");
  if (addDaysToDateKey(fromKey, MAX_AGENDA_RANGE_DAYS) < toKey) {
    throw new HttpsError("invalid-argument", `Intervalo de até ${MAX_AGENDA_RANGE_DAYS} dias.`);
  }
  return {fromKey, toKey};
}

export const getMyClassAgenda = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const todayKey = dayKeyFromEventDate(new Date());
  const {fromKey, toKey} = parseAgendaRange((request.data ?? {}) as Record<string, unknown>, todayKey);
  const items = await loadClassAgenda(getFirestore(), uid, fromKey, toKey, todayKey);
  return {items, fromKey, toKey};
});
