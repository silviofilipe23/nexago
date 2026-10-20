/**
 * Alunos pelo lado do professor (app, modo Professor): Alunos, Aluno e Minhas turmas.
 *
 * As coleções de aula seguem fechadas à equipe da arena (rules). O professor lê por esta callable,
 * que projeta só o necessário — mesma régua da chamada (`getMyClassSessionRoster`): só turmas com
 * `teacherUserId` = ele, nas arenas com vínculo `ACTIVE` + "Gerenciar as próprias aulas". Plano e
 * situação do pagamento saem só para vínculo de equipe (`ARENA_STAFF`), sem valor de fatura nem
 * telefone. Spec: `docs/superpowers/specs/2026-10-20-professor-app-alunos-fase-1-design.md`.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CHARGES,
  ARENA_CLASS_CREDITS,
  ARENA_CLASS_ENROLLMENTS,
  ARENA_CLASS_SESSIONS,
  CLASS_STUDENTS,
  CLASS_WAITLIST,
  type AttendanceMark,
} from "./arena-class-constants";
import {parseArenaClass, parseClassSession} from "./arena-class";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {type ArenaProfessorLinkData} from "./arena-professor-links";
import {loadArenaProfessorLink, professorPermissionDenial} from "./arena-professor-permissions";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/** Turmas lidas por professor (as mais antigas primeiro ficam de fora acima disso). */
export const MAX_PROFESSOR_CLASSES = 40;
/** Janela das marcas de presença (dias para trás). */
export const PROFESSOR_MARKS_WINDOW_DAYS = 120;
/** Janela da "próxima aula" das turmas (o horizonte das aulas materializadas). */
export const PROFESSOR_NEXT_WINDOW_DAYS = 35;
/** Marcas que a tela do aluno mostra. */
export const PROFESSOR_RECENT_MARKS = 12;

export type ProfessorRelationshipType = "ARENA_STAFF" | "INDEPENDENT";
export type ProfessorBillingStanding = "up_to_date" | "due_today" | "overdue" | "paused" | "no_plan";

export interface ProfessorArenaSummary {
  arenaId: string;
  arenaName: string;
  relationshipType: ProfessorRelationshipType | null;
  /** Vínculo `ACTIVE` com "Gerenciar as próprias aulas" — sem isso não há nomes. */
  canSeeStudents: boolean;
  studentCount: number;
  classCount: number;
}

export interface ProfessorClassSummary {
  classId: string;
  arenaId: string;
  arenaName: string;
  name: string;
  type: string;
  level: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  courtName: string;
  capacity: number;
  activeCount: number;
  waitlistCount: number;
  /** % de presentes nas marcas das aulas da janela; `null` sem marca. */
  presenceRate: number | null;
  nextDate: string | null;
  status: string;
}

export interface ProfessorStudentMark {
  date: string;
  mark: AttendanceMark;
  /** Veio como reposição (encaixe com crédito) nesta aula. */
  makeup: boolean;
}

export interface ProfessorStudentClass {
  classId: string;
  name: string;
  type: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
}

export interface ProfessorStudentPlan {
  enrollmentId: string;
  status: "active" | "paused";
  name: string;
  kind: string;
  priceReais: number;
  /** Pacote: aulas do pacote e as que restam; mensal: `null`. */
  credits: number | null;
  creditsLeft: number | null;
  expiresOn: string | null;
}

export interface ProfessorStudent {
  studentId: string;
  arenaId: string;
  arenaName: string;
  athleteId: string | null;
  name: string;
  photoUrl: string | null;
  status: "active" | "paused";
  /** `YYYY-MM-DD` da entrada mais antiga numa turma do professor. */
  since: string | null;
  classes: ProfessorStudentClass[];
  /** Mais antiga → mais recente. */
  marks: ProfessorStudentMark[];
  presenceRate: number | null;
  lastDate: string | null;
  /** Créditos de reposição disponíveis (não vencidos) na arena. */
  credits: number;
  /** Matrículas vigentes (ativa ou pausada) — mensal e pacote podem conviver. Só equipe da arena. */
  plans: ProfessorStudentPlan[];
  billing: {standing: ProfessorBillingStanding; nextDueDate: string | null} | null;
}

export interface ProfessorStudentsResult {
  todayKey: string;
  arenas: ProfessorArenaSummary[];
  classes: ProfessorClassSummary[];
  students: ProfessorStudent[];
}

type Doc = {id: string; data: Record<string, unknown>};

export interface ProfessorStudentsInput {
  uid: string;
  todayKey: string;
  /** Turmas com `teacherUserId` = uid (qualquer status — as arquivadas saem aqui). */
  classes: Doc[];
  /** arenaId → vínculo (ou `null`). */
  links: Map<string, ArenaProfessorLinkData | null>;
  /** classId → `classStudents` (só das turmas liberadas). */
  students: Map<string, Doc[]>;
  /** classId → quantos esperando. */
  waitlistCounts: Map<string, number>;
  /** Aulas do professor na janela. */
  sessions: Doc[];
  /** enrollmentId → matrícula. */
  enrollments: Map<string, Record<string, unknown>>;
  /** Cobranças `open` das arenas liberadas. */
  openCharges: Record<string, unknown>[];
  /** Créditos `available` das arenas liberadas. */
  credits: Record<string, unknown>[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? (v as unknown[]).map(Number).filter((n) => Number.isInteger(n)) : [];
}

function dateKeyOf(v: unknown): string | null {
  if (v instanceof Timestamp) return dayKeyFromEventDate(v.toDate());
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function rate(present: number, total: number): number | null {
  return total > 0 ? Math.round((present / total) * 100) : null;
}

const studentKey = (arenaId: string, studentId: string) => `${arenaId}::${studentId}`;

const isCurrentEnrollment = (e: Record<string, unknown>) => ["active", "paused"].includes(str(e["status"]));

/**
 * Situação do pagamento — mesma régua do app da arena (`arenaClassStudentStanding`): dívida
 * primeiro (pausar não perdoa o que venceu), depois sem plano, pausado (todas as matrículas
 * vigentes pausadas), vence hoje, em dia. `nextDueDate`: a vencida mais antiga, senão a próxima.
 */
export function professorBillingStanding(
  enrollments: ReadonlyArray<Record<string, unknown>>,
  openCharges: ReadonlyArray<Record<string, unknown>>,
  todayKey: string,
): {standing: ProfessorBillingStanding; nextDueDate: string | null} {
  const dues = openCharges.map((c) => str(c["dueDate"])).filter(Boolean).sort();
  const nextDueDate = dues.find((d) => d >= todayKey) ?? null;
  if (dues.some((d) => d < todayKey)) return {standing: "overdue", nextDueDate: dues[0] ?? null};
  const current = enrollments.filter(isCurrentEnrollment);
  if (current.length === 0) return {standing: "no_plan", nextDueDate};
  if (current.every((e) => str(e["status"]) === "paused")) return {standing: "paused", nextDueDate};
  if (dues.includes(todayKey)) return {standing: "due_today", nextDueDate};
  return {standing: "up_to_date", nextDueDate};
}

function planOf(enrollmentId: string, enrollment: Record<string, unknown>): ProfessorStudentPlan | null {
  const raw = enrollment["plan"];
  if (raw == null || typeof raw !== "object") return null;
  const plan = raw as Record<string, unknown>;
  const kind = str(plan["kind"]);
  const isPackage = kind === "package";
  return {
    enrollmentId,
    status: str(enrollment["status"]) === "paused" ? "paused" : "active",
    name: str(plan["name"]) || "Plano",
    kind,
    priceReais: num(plan["priceReais"]) ?? 0,
    credits: isPackage ? num(plan["credits"]) : null,
    creditsLeft: isPackage ? num(enrollment["creditsLeft"]) : null,
    expiresOn: isPackage ? str(enrollment["expiresOn"]) || null : null,
  };
}

/** Monta a resposta a partir do que foi lido (pura — os testes chamam direto). */
export function buildProfessorStudents(input: ProfessorStudentsInput): ProfessorStudentsResult {
  const {todayKey} = input;
  const classes = input.classes
    .map((d) => ({id: d.id, data: d.data, cls: parseArenaClass(d.data)}))
    .filter((c) => c.cls.teacherUserId === input.uid && c.cls.status !== "archived");

  const allowed = new Set<string>();
  for (const [arenaId, link] of input.links) {
    if (professorPermissionDenial(link, "canManageOwnLessons") == null) allowed.add(arenaId);
  }
  const isStaff = (arenaId: string) => input.links.get(arenaId)?.relationshipType === "ARENA_STAFF";

  // Aulas do professor nas arenas liberadas, em ordem.
  const sessions = input.sessions
    .map((d) => ({id: d.id, s: parseClassSession(d.data), teacher: str(d.data["teacherUserId"])}))
    .filter((x) => x.teacher === input.uid && allowed.has(x.s.arenaId))
    .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.startTime.localeCompare(b.s.startTime));

  // Marcas por aluno e presença por turma.
  const marksByStudent = new Map<string, ProfessorStudentMark[]>();
  const classMarks = new Map<string, {present: number; total: number}>();
  const nextDateByClass = new Map<string, string>();
  for (const {s} of sessions) {
    if (s.status === "canceled") continue;
    if (s.date >= todayKey && s.status === "scheduled" && !nextDateByClass.has(s.classId)) {
      nextDateByClass.set(s.classId, s.date);
    }
    if (s.date > todayKey) continue;
    for (const [studentId, entry] of Object.entries(s.attendance)) {
      const key = studentKey(s.arenaId, studentId);
      const list = marksByStudent.get(key) ?? [];
      list.push({date: s.date, mark: entry.mark, makeup: s.extras[studentId]?.kind === "makeup"});
      marksByStudent.set(key, list);
      const agg = classMarks.get(s.classId) ?? {present: 0, total: 0};
      agg.total += 1;
      if (entry.mark === "present") agg.present += 1;
      classMarks.set(s.classId, agg);
    }
  }

  const chargesByEnrollment = new Map<string, Record<string, unknown>[]>();
  for (const c of input.openCharges) {
    if (str(c["status"]) !== "open") continue;
    const id = str(c["enrollmentId"]);
    if (!id) continue;
    chargesByEnrollment.set(id, [...(chargesByEnrollment.get(id) ?? []), c]);
  }
  const creditsByStudent = new Map<string, number>();
  for (const c of input.credits) {
    if (str(c["status"]) !== "available") continue;
    const expires = str(c["expiresOn"]);
    if (expires && expires < todayKey) continue;
    const key = studentKey(str(c["arenaId"]), str(c["studentId"]));
    creditsByStudent.set(key, (creditsByStudent.get(key) ?? 0) + 1);
  }

  // Alunos: um por arena, juntando as turmas do professor.
  const students = new Map<string, ProfessorStudent & {enrollmentIds: string[]}>();
  const activeByClass = new Map<string, number>();
  for (const {id: classId, cls} of classes) {
    if (!allowed.has(cls.arenaId)) continue;
    for (const doc of input.students.get(classId) ?? []) {
      const status = str(doc.data["status"]);
      if (status !== "active" && status !== "paused") continue;
      if (status === "active") activeByClass.set(classId, (activeByClass.get(classId) ?? 0) + 1);
      const key = studentKey(cls.arenaId, doc.id);
      const own = numbers(doc.data["weekdays"]);
      const entry = students.get(key) ?? {
        studentId: doc.id,
        arenaId: cls.arenaId,
        arenaName: cls.arenaName,
        athleteId: str(doc.data["athleteId"]) || null,
        name: str(doc.data["name"]) || "Aluno",
        photoUrl: str(doc.data["photoUrl"]) || null,
        status: "paused" as const,
        since: null,
        classes: [],
        marks: [],
        presenceRate: null,
        lastDate: null,
        credits: 0,
        plans: [],
        billing: null,
        enrollmentIds: [],
      };
      if (status === "active") entry.status = "active";
      if (!entry.photoUrl) entry.photoUrl = str(doc.data["photoUrl"]) || null;
      const since = dateKeyOf(doc.data["enrolledAt"]);
      if (since && (!entry.since || since < entry.since)) entry.since = since;
      entry.classes.push({
        classId,
        name: cls.name,
        type: cls.type,
        weekdays: own.length ? own : cls.weekdays,
        startTime: cls.startTime,
        endTime: cls.endTime,
      });
      const enrollmentId = str(doc.data["enrollmentId"]);
      if (enrollmentId && !entry.enrollmentIds.includes(enrollmentId)) entry.enrollmentIds.push(enrollmentId);
      students.set(key, entry);
    }
  }

  const studentList: ProfessorStudent[] = [];
  for (const [key, {enrollmentIds, ...student}] of students) {
    const marks = marksByStudent.get(key) ?? [];
    const recent = marks.slice(-PROFESSOR_RECENT_MARKS);
    student.marks = recent;
    student.presenceRate = rate(recent.filter((m) => m.mark === "present").length, recent.length);
    student.lastDate = marks.length ? marks[marks.length - 1].date : null;
    student.credits = creditsByStudent.get(key) ?? 0;
    student.classes.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (isStaff(student.arenaId)) {
      const enrollments = enrollmentIds
        .map((id) => ({id, data: input.enrollments.get(id)}))
        .filter((e): e is {id: string; data: Record<string, unknown>} => e.data != null);
      const charges = enrollmentIds.flatMap((id) => chargesByEnrollment.get(id) ?? []);
      student.plans = enrollments
        .filter((e) => isCurrentEnrollment(e.data))
        .map((e) => planOf(e.id, e.data))
        .filter((p): p is ProfessorStudentPlan => p != null)
        .sort((a, b) => (a.kind === "package" ? 1 : 0) - (b.kind === "package" ? 1 : 0) || a.name.localeCompare(b.name, "pt-BR"));
      student.billing = professorBillingStanding(enrollments.map((e) => e.data), charges, todayKey);
    }
    studentList.push(student);
  }
  studentList.sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.arenaName.localeCompare(b.arenaName, "pt-BR"));

  const classList: ProfessorClassSummary[] = classes
    .filter((c) => allowed.has(c.cls.arenaId))
    .map(({id, cls}) => {
      const agg = classMarks.get(id);
      return {
        classId: id,
        arenaId: cls.arenaId,
        arenaName: cls.arenaName,
        name: cls.name,
        type: cls.type,
        level: cls.level,
        weekdays: cls.weekdays,
        startTime: cls.startTime,
        endTime: cls.endTime,
        courtName: cls.courtName,
        capacity: cls.capacity,
        activeCount: activeByClass.get(id) ?? 0,
        waitlistCount: input.waitlistCounts.get(id) ?? 0,
        presenceRate: agg ? rate(agg.present, agg.total) : null,
        nextDate: nextDateByClass.get(id) ?? null,
        status: cls.status,
      };
    })
    .sort((a, b) =>
      (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999") ||
      a.startTime.localeCompare(b.startTime) ||
      a.name.localeCompare(b.name, "pt-BR"));

  const arenaIds = [...new Set(classes.map((c) => c.cls.arenaId))];
  const arenas: ProfessorArenaSummary[] = arenaIds.map((arenaId) => {
    const link = input.links.get(arenaId) ?? null;
    const name = link?.arenaName || classes.find((c) => c.cls.arenaId === arenaId)?.cls.arenaName || "Arena";
    const type = link?.relationshipType;
    return {
      arenaId,
      arenaName: name,
      relationshipType: type === "ARENA_STAFF" || type === "INDEPENDENT" ? type : null,
      canSeeStudents: allowed.has(arenaId),
      studentCount: studentList.filter((s) => s.arenaId === arenaId).length,
      classCount: classes.filter((c) => c.cls.arenaId === arenaId).length,
    };
  }).sort((a, b) => a.arenaName.localeCompare(b.arenaName, "pt-BR"));

  return {todayKey, arenas, classes: classList, students: studentList};
}

/** Lê tudo o que o professor pode ver e monta a resposta. */
export async function loadProfessorStudentsCore(
  db: Firestore,
  uid: string,
  todayKey: string,
): Promise<ProfessorStudentsResult> {
  const fromKey = addDaysToDateKey(todayKey, -PROFESSOR_MARKS_WINDOW_DAYS);
  const toKey = addDaysToDateKey(todayKey, PROFESSOR_NEXT_WINDOW_DAYS);
  const [classSnap, sessionSnap] = await Promise.all([
    db.collection(ARENA_CLASSES).where("teacherUserId", "==", uid).get(),
    db.collection(ARENA_CLASS_SESSIONS).where("teacherUserId", "==", uid)
      .where("date", ">=", fromKey).where("date", "<=", toKey).get(),
  ]);
  const classes: Doc[] = classSnap.docs
    .map((d) => ({id: d.id, data: d.data() as Record<string, unknown>}))
    .filter((d) => d.data["status"] !== "archived")
    .slice(0, MAX_PROFESSOR_CLASSES);

  const arenaIds = [...new Set(classes.map((c) => str(c.data["arenaId"])).filter(Boolean))];
  const linkList = await Promise.all(arenaIds.map((arenaId) => loadArenaProfessorLink(db, arenaId, uid)));
  const links = new Map(arenaIds.map((arenaId, i) => [arenaId, linkList[i]]));
  const allowed = arenaIds.filter((arenaId) => professorPermissionDenial(links.get(arenaId) ?? null, "canManageOwnLessons") == null);
  const allowedClasses = classes.filter((c) => allowed.includes(str(c.data["arenaId"])));
  const staffArenas = allowed.filter((arenaId) => links.get(arenaId)?.relationshipType === "ARENA_STAFF");

  const students = new Map<string, Doc[]>();
  const waitlistCounts = new Map<string, number>();
  await Promise.all(allowedClasses.map(async (c) => {
    const ref = db.collection(ARENA_CLASSES).doc(c.id);
    const [roster, waitlist] = await Promise.all([
      ref.collection(CLASS_STUDENTS).get(),
      ref.collection(CLASS_WAITLIST).where("status", "==", "waiting").get(),
    ]);
    students.set(c.id, roster.docs.map((d) => ({id: d.id, data: d.data() as Record<string, unknown>})));
    waitlistCounts.set(c.id, waitlist.size);
  }));

  // Matrícula, cobrança: só onde o professor é equipe da arena.
  const staffSet = new Set(staffArenas);
  const enrollmentIds = new Set<string>();
  for (const c of allowedClasses) {
    if (!staffSet.has(str(c.data["arenaId"]))) continue;
    for (const s of students.get(c.id) ?? []) {
      const id = str(s.data["enrollmentId"]);
      if (id) enrollmentIds.add(id);
    }
  }
  const enrollmentRefs = [...enrollmentIds].map((id) => db.collection(ARENA_CLASS_ENROLLMENTS).doc(id));
  const [enrollmentSnaps, chargeSnaps, creditSnaps] = await Promise.all([
    enrollmentRefs.length ? db.getAll(...enrollmentRefs) : Promise.resolve([]),
    Promise.all(staffArenas.map((arenaId) =>
      db.collection(ARENA_CLASS_CHARGES).where("arenaId", "==", arenaId).where("status", "==", "open").get())),
    Promise.all(allowed.map((arenaId) =>
      db.collection(ARENA_CLASS_CREDITS).where("arenaId", "==", arenaId).where("status", "==", "available").get())),
  ]);
  const enrollments = new Map<string, Record<string, unknown>>();
  for (const snap of enrollmentSnaps) {
    if (snap.exists) enrollments.set(snap.id, snap.data() as Record<string, unknown>);
  }

  return buildProfessorStudents({
    uid,
    todayKey,
    classes,
    links,
    students,
    waitlistCounts,
    sessions: sessionSnap.docs.map((d) => ({id: d.id, data: d.data() as Record<string, unknown>})),
    enrollments,
    openCharges: chargeSnaps.flatMap((snap) => snap.docs.map((d) => d.data() as Record<string, unknown>)),
    credits: creditSnaps.flatMap((snap) => snap.docs.map((d) => d.data() as Record<string, unknown>)),
  });
}

export const getMyProfessorStudents = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return loadProfessorStudentsCore(getFirestore(), uid, dayKeyFromEventDate(new Date()));
});
