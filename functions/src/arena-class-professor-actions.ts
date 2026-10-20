/**
 * App do Professor — fase 2: o professor DA EQUIPE age nas Aulas da arena, nas turmas dele, com as
 * chaves que a arena ligou no vínculo (`canEnrollStudents`, `canScheduleLessons`,
 * `canCancelLessons`). Preço sempre da tabela da arena; cobrança no caixa da arena.
 * Spec: `docs/superpowers/specs/2026-10-20-professor-app-alunos-fase-2-design.md`.
 *
 * Aqui ficam o que não existia para a equipe também (mover de turma, aviso aos alunos), a aula
 * avulsa com quadra escolhida pelo servidor e a leitura que as telas do professor precisam (as
 * coleções de Aulas seguem fechadas à equipe nas rules).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CREDITS,
  ARENA_CLASS_ENROLLMENTS,
  ARENA_CLASS_SESSIONS,
  CLASS_PLANS,
  CLASS_STUDENTS,
  CLASS_TEACHERS,
  CLASS_WAITLIST,
  classSessionId,
  type ArenaClassType,
} from "./arena-class-constants";
import {
  addClassStudentCore,
  authorizeClassAction,
  classHorizonKey,
  classSessionRecipients,
  discardNewClass,
  findClassConflicts,
  materializeClassRange,
  materializedUntilAfter,
  parseArenaClass,
  parseClassSession,
  requireClassEntitlement,
  requireUid,
  resolveStudentInput,
  str,
  validateClassInput,
  type ArenaClassData,
  type UpsertClassStudentInput,
} from "./arena-class";
import {classRulesRef, parseClassRules, studentAttendsWeekday} from "./arena-class-ledger";
import {parsePlan} from "./arena-class-billing";
import {addDaysToDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {effectiveArenaProfessorPermissions} from "./arena-professor-links";
import {requireArenaProfessorPermission} from "./arena-professor-permissions";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/** Janela das aulas que as telas do professor oferecem (encaixe, reposição, aviso). */
export const PROFESSOR_ACTIONS_WINDOW_DAYS = 14;
/** Experimentais dos últimos dias que ainda dá para converter (B7). */
export const PROFESSOR_TRIALS_WINDOW_DAYS = 14;
/** Aviso aos alunos: aulas por envio e tamanho da mensagem. */
export const MAX_NOTICE_SESSIONS = 10;
export const MAX_NOTICE_LENGTH = 300;

type Data = Record<string, unknown>;

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? (v as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7) : [];
}

// ---------------------------------------------------------------------------
// Aluno do professor
// ---------------------------------------------------------------------------

/**
 * O aluno está (ativo ou pausado) numa turma deste professor na arena — o professor só usa
 * crédito, agenda e move quem é dele.
 */
export async function assertTeacherOwnsStudent(
  db: Firestore,
  arenaId: string,
  uid: string,
  studentId: string,
): Promise<Data> {
  const classes = await db.collection(ARENA_CLASSES)
    .where("teacherUserId", "==", uid).where("arenaId", "==", arenaId).get();
  const refs = classes.docs
    .filter((d) => d.data()["status"] !== "archived")
    .map((d) => d.ref.collection(CLASS_STUDENTS).doc(studentId));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const own = snaps.find((s) => s.exists && ["active", "paused"].includes(str(s.data()?.["status"])));
  if (!own) {
    throw new HttpsError("permission-denied", "Este aluno não está em nenhuma turma sua nesta arena.");
  }
  return own.data() as Data;
}

/** Reposição pelo professor: o crédito tem que ser de um aluno dele. */
export async function assertTeacherCanUseCredit(db: Firestore, uid: string, creditId: string): Promise<void> {
  if (!creditId) return;
  const snap = await db.collection(ARENA_CLASS_CREDITS).doc(creditId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Crédito não encontrado.");
  await assertTeacherOwnsStudent(db, str(snap.data()?.["arenaId"]), uid, str(snap.data()?.["studentId"]));
}

// ---------------------------------------------------------------------------
// Mover para outra turma
// ---------------------------------------------------------------------------

export interface MoveClassStudentInput {
  fromClassId: string;
  toClassId: string;
  studentId: string;
  /** Dias da turma de destino (ISO 1–7); null = os mesmos dias quando der, completando pela ordem. */
  weekdays: number[] | null;
  actorUid: string;
}

/**
 * Dias na turma de destino: os escolhidos (precisam ser dela e somar a mesma quantidade) ou, sem
 * escolha, os mesmos dias da origem que a destino tem, completando pela ordem da semana.
 */
export function pickTargetWeekdays(
  targetWeekdays: readonly number[],
  currentWeekdays: readonly number[],
  count: number,
  chosen: readonly number[] | null,
  targetName: string,
): number[] {
  if (targetWeekdays.length < count) {
    throw new HttpsError(
      "failed-precondition",
      `A turma ${targetName} tem ${targetWeekdays.length} dia(s) por semana — o plano do aluno tem ${count}.`,
    );
  }
  if (chosen && chosen.length > 0) {
    const unique = [...new Set(chosen)].sort((a, b) => a - b);
    if (unique.some((d) => !targetWeekdays.includes(d))) {
      throw new HttpsError("invalid-argument", `A turma ${targetName} não tem aula nesse dia.`);
    }
    if (unique.length !== count) {
      throw new HttpsError("invalid-argument", `Escolha ${count} dia(s) na turma ${targetName}.`);
    }
    return unique;
  }
  const same = targetWeekdays.filter((d) => currentWeekdays.includes(d));
  const rest = targetWeekdays.filter((d) => !currentWeekdays.includes(d));
  return [...same, ...rest].slice(0, count).sort((a, b) => a - b);
}

/**
 * Tira o aluno de uma turma e põe em outra da mesma arena numa transação. Com matrícula, os
 * horários da origem são trocados pelos da destino na matrícula (o plano — e o preço — não mudam);
 * sem matrícula (aluno avulso antigo), só troca de turma.
 */
export async function moveClassStudentCore(
  db: Firestore,
  input: MoveClassStudentInput,
): Promise<{studentId: string; weekdays: number[] | null; enrollmentId: string | null}> {
  if (input.fromClassId === input.toClassId) {
    throw new HttpsError("invalid-argument", "Escolha outra turma.");
  }
  const fromRef = db.collection(ARENA_CLASSES).doc(input.fromClassId);
  const toRef = db.collection(ARENA_CLASSES).doc(input.toClassId);
  return db.runTransaction(async (tx: Transaction) => {
    const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    if (!fromSnap.exists || !toSnap.exists) throw new HttpsError("not-found", "Turma não encontrada.");
    const from = parseArenaClass(fromSnap.data() as Data);
    const to = parseArenaClass(toSnap.data() as Data);
    if (from.arenaId !== to.arenaId) throw new HttpsError("permission-denied", "Turma de outra arena.");
    if (to.status !== "active") throw new HttpsError("failed-precondition", `A turma ${to.name} não está ativa.`);
    if (to.weekdays.length === 0) {
      throw new HttpsError("failed-precondition", "Aula avulsa não recebe aluno de turma — agende uma aula.");
    }

    const fromStudentRef = fromRef.collection(CLASS_STUDENTS).doc(input.studentId);
    const toStudentRef = toRef.collection(CLASS_STUDENTS).doc(input.studentId);
    const [fromStudentSnap, toStudentSnap, roster] = await Promise.all([
      tx.get(fromStudentRef),
      tx.get(toStudentRef),
      tx.get(toRef.collection(CLASS_STUDENTS).where("status", "==", "active")),
    ]);
    const fromStudent = fromStudentSnap.data() as Data | undefined;
    const fromStatus = str(fromStudent?.["status"]);
    if (!fromStudentSnap.exists || (fromStatus !== "active" && fromStatus !== "paused")) {
      throw new HttpsError("not-found", "O aluno não está nesta turma.");
    }
    const toStatus = str(toStudentSnap.data()?.["status"]);
    if (toStudentSnap.exists && (toStatus === "active" || toStatus === "paused")) {
      throw new HttpsError("already-exists", `${str(fromStudent?.["name"]) || "O aluno"} já está na turma ${to.name}.`);
    }

    const enrollmentId = str(fromStudent?.["enrollmentId"]) || null;
    const enrollmentRef = enrollmentId ? db.collection(ARENA_CLASS_ENROLLMENTS).doc(enrollmentId) : null;
    const enrollmentSnap = enrollmentRef ? await tx.get(enrollmentRef) : null;
    const enrollment = enrollmentSnap?.exists ? enrollmentSnap.data() as Data : null;
    const slots = Array.isArray(enrollment?.["slots"]) ? enrollment!["slots"] as Data[] : [];
    const fromSlots = slots.filter((s) => str(s["classId"]) === input.fromClassId);
    const currentWeekdays = numbers(fromStudent?.["weekdays"]).length ?
      numbers(fromStudent?.["weekdays"]) :
      fromSlots.length ? fromSlots.map((s) => Number(s["weekday"])) : from.weekdays;

    // Com matrícula: a mesma quantidade de dias. Sem: todos os dias da turma (como hoje).
    const weekdays = enrollment ?
      pickTargetWeekdays(to.weekdays, currentWeekdays, Math.max(1, fromSlots.length || currentWeekdays.length), input.weekdays, to.name) :
      null;
    for (const weekday of weekdays ?? to.weekdays) {
      const taken = roster.docs.filter((d) =>
        d.id !== input.studentId && studentAttendsWeekday(d.data() as Data, weekday)).length;
      if (taken >= to.capacity) {
        throw new HttpsError("failed-precondition", `A turma ${to.name} está lotada nesse dia.`);
      }
    }

    const wasActive = fromStatus === "active";
    tx.set(fromStudentRef, {status: "removed", removedAt: FieldValue.serverTimestamp(), movedToClassId: input.toClassId}, {merge: true});
    tx.set(toStudentRef, {
      arenaId: to.arenaId,
      classId: input.toClassId,
      athleteId: fromStudent?.["athleteId"] ?? null,
      name: fromStudent?.["name"] ?? "Aluno",
      phone: fromStudent?.["phone"] ?? null,
      photoUrl: fromStudent?.["photoUrl"] ?? null,
      status: fromStatus,
      enrollmentId,
      weekdays: weekdays ?? FieldValue.delete(),
      planName: fromStudent?.["planName"] ?? null,
      removedAt: null,
      addedByUid: input.actorUid,
      movedFromClassId: input.fromClassId,
      ...(toStudentSnap.exists ? {} : {enrolledAt: FieldValue.serverTimestamp()}),
    }, {merge: true});
    if (wasActive) {
      tx.set(fromRef, {
        studentCount: Math.max(0, Number(fromSnap.data()?.["studentCount"] ?? 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(toRef, {
        studentCount: Number(toSnap.data()?.["studentCount"] ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    if (enrollmentRef && enrollment && weekdays) {
      const nextSlots = [
        ...slots.filter((s) => str(s["classId"]) !== input.fromClassId),
        ...weekdays.map((weekday) => ({
          classId: input.toClassId, weekday, className: to.name, startTime: to.startTime, teacherId: to.teacherId,
        })),
      ];
      tx.set(enrollmentRef, {slots: nextSlots, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    return {studentId: input.studentId, weekdays, enrollmentId};
  });
}

export const moveArenaClassStudent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  const fromClassId = str(input["fromClassId"]);
  const toClassId = str(input["toClassId"]);
  const studentId = str(input["studentId"]);
  if (!fromClassId || !toClassId || !studentId) throw new HttpsError("invalid-argument", "Escolha o aluno e a turma.");
  const db = getFirestore();
  const [fromSnap, toSnap] = await db.getAll(
    db.collection(ARENA_CLASSES).doc(fromClassId), db.collection(ARENA_CLASSES).doc(toClassId),
  );
  if (!fromSnap.exists || !toSnap.exists) throw new HttpsError("not-found", "Turma não encontrada.");
  const from = parseArenaClass(fromSnap.data() as Data);
  const to = parseArenaClass(toSnap.data() as Data);
  if (from.arenaId !== to.arenaId) throw new HttpsError("permission-denied", "Turma de outra arena.");
  const {role, arenaData} = await authorizeClassAction(
    db, from.arenaId, [from.teacherUserId, to.teacherUserId], uid, "canEnrollStudents",
  );
  requireClassEntitlement(arenaData);
  const chosen = Array.isArray(input["weekdays"]) ? numbers(input["weekdays"]) : null;
  const result = await moveClassStudentCore(db, {fromClassId, toClassId, studentId, weekdays: chosen, actorUid: uid});
  logger.info("moveArenaClassStudent", {fromClassId, toClassId, studentId, role});
  return {fromClassId, toClassId, ...result};
});

// ---------------------------------------------------------------------------
// Aula avulsa do professor (quadra escolhida pelo servidor, usa crédito do pacote)
// ---------------------------------------------------------------------------

export const PROFESSOR_LESSON_TYPES = ["particular", "dupla", "experimental"] as const;

/** Quadra livre e sem manutenção, que atende a modalidade (sem modalidade cadastrada = atende). */
export function courtFitsLesson(court: Data, sport: string): boolean {
  if (court["maintenance"] === true || str(court["status"]).toLowerCase() === "maintenance") return false;
  const types = Array.isArray(court["types"]) ? court["types"] : Array.isArray(court["sportTypes"]) ? court["sportTypes"] : [];
  const list = (types as unknown[]).map((t) => str(t).trim().toLowerCase()).filter(Boolean);
  const legacy = str(court["type"]).trim().toLowerCase();
  const all = legacy ? [...list, legacy] : list;
  return !sport || all.length === 0 || all.includes(sport.trim().toLowerCase());
}

/**
 * Pacote ativo do aluno na arena com aula sobrando — descontadas as aulas avulsas dele ainda por
 * dar que já contam com esse pacote. `null` = sem pacote com crédito.
 */
export async function findPackageWithCredit(
  db: Firestore,
  arenaId: string,
  studentId: string,
  todayKey: string,
): Promise<{enrollmentId: string; planName: string; creditsLeft: number} | null> {
  const snap = await db.collection(ARENA_CLASS_ENROLLMENTS)
    .where("arenaId", "==", arenaId).where("studentId", "==", studentId).where("status", "==", "active").get();
  for (const doc of snap.docs) {
    const data = doc.data() as Data;
    const plan = (data["plan"] ?? {}) as Data;
    if (plan["kind"] !== "package") continue;
    if (str(data["expiresOn"]) && str(data["expiresOn"]) < todayKey) continue;
    const left = Number(data["creditsLeft"] ?? 0);
    if (!(left > 0)) continue;
    const pending = await db.collection(ARENA_CLASSES).where("packageEnrollmentIds", "array-contains", doc.id).get();
    let reserved = 0;
    for (const lesson of pending.docs) {
      const cls = parseArenaClass(lesson.data() as Data);
      if (cls.status !== "active" || cls.startDate < todayKey) continue;
      const session = await db.collection(ARENA_CLASS_SESSIONS).doc(classSessionId(lesson.id, cls.startDate)).get();
      if (session.exists && ["completed", "canceled"].includes(str(session.data()?.["status"]))) continue;
      reserved += 1;
    }
    if (left - reserved > 0) return {enrollmentId: doc.id, planName: str(plan["name"]) || "Pacote", creditsLeft: left - reserved};
  }
  return null;
}

function lessonName(type: string, names: string[]): string {
  const label = type === "dupla" ? "Dupla" : type === "experimental" ? "Experimental" : "Particular";
  return `${label} · ${names.join(" e ")}`.slice(0, 60);
}

export interface CreateLessonResult {
  classId: string;
  sessionId: string;
  courtId: string;
  courtName: string;
  /** studentId → pacote usado (só particular/dupla). */
  packages: Record<string, string>;
}

export const createArenaClassLesson = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 120}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  const arenaId = str(input["arenaId"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  const type = str(input["type"]) as ArenaClassType;
  if (!(PROFESSOR_LESSON_TYPES as readonly string[]).includes(type)) {
    throw new HttpsError("invalid-argument", "Escolha particular, dupla ou experimental.");
  }
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());

  // Só o professor da aula agenda por aqui (a equipe tem o "Agendar aula" com quadra escolhida).
  await requireArenaProfessorPermission(db, arenaId, uid, "canScheduleLessons");
  const arenaSnap = await db.collection("arenas").doc(arenaId).get();
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const arenaData = arenaSnap.data() as Data;
  requireClassEntitlement(arenaData);
  const teacherSnap = await db.collection("arenas").doc(arenaId).collection(CLASS_TEACHERS)
    .where("userId", "==", uid).get();
  const teacherDoc = teacherSnap.docs.find((d) => d.data()["status"] !== "archived");
  if (!teacherDoc) {
    throw new HttpsError("failed-precondition", "Você ainda não está cadastrado nas Aulas desta arena. Peça à gestão.");
  }

  const rawStudents = Array.isArray(input["students"]) ? input["students"] as Data[] : [];
  const expected = type === "dupla" ? 2 : 1;
  if (rawStudents.length !== expected) {
    throw new HttpsError("invalid-argument", type === "dupla" ? "Escolha os 2 alunos da dupla." : "Escolha o aluno.");
  }
  const students: Array<{studentId: string | null; resolved: Awaited<ReturnType<typeof resolveStudentInput>>}> = [];
  for (const raw of rawStudents) {
    const studentId = str(raw["studentId"]) || str(raw["athleteId"]) || null;
    if (type === "experimental") {
      students.push({studentId, resolved: await resolveStudentInput(db, raw as UpsertClassStudentInput)});
      continue;
    }
    if (!studentId) throw new HttpsError("invalid-argument", "Escolha um aluno seu.");
    // Aluno dele: os dados vêm da turma (aluno sem conta mantém o mesmo id).
    const own = await assertTeacherOwnsStudent(db, arenaId, uid, studentId);
    const athleteId = str(own["athleteId"]) || null;
    const resolved = athleteId ?
      await resolveStudentInput(db, {athleteId}) :
      {athleteId: null, name: str(own["name"]) || "Aluno", phone: str(own["phone"]) || null, photoUrl: null};
    students.push({studentId, resolved});
  }
  const ids = students.map((s) => s.resolved.athleteId ?? s.studentId).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new HttpsError("invalid-argument", "O mesmo aluno aparece duas vezes.");

  // Particular e dupla do professor usam 1 aula do pacote de cada aluno.
  const packages: Record<string, string> = {};
  if (type !== "experimental") {
    for (const s of students) {
      const pkg = await findPackageWithCredit(db, arenaId, s.studentId!, todayKey);
      if (!pkg) {
        throw new HttpsError(
          "failed-precondition",
          `${s.resolved.name} não tem pacote com aula sobrando — a arena precisa vender o pacote antes.`,
        );
      }
      packages[s.studentId!] = pkg.enrollmentId;
    }
  }

  const v = validateClassInput({
    name: lessonName(type, students.map((s) => s.resolved.name.split(" ")[0])),
    type,
    sport: str(input["sport"]) || str(teacherDoc.data()["specialty"]) || "aula",
    level: "livre",
    teacherId: teacherDoc.id,
    weekdays: [],
    startTime: input["startTime"],
    endTime: input["endTime"],
    courtId: "auto",
    capacity: expected,
    startDate: input["date"],
  }, todayKey);
  const teacherData = teacherDoc.data() as Data;
  const base: ArenaClassData = {
    arenaId,
    arenaName: str(arenaData["name"]).trim() || "Arena",
    name: v.name,
    type: v.type,
    sport: v.sport,
    level: v.level,
    teacherId: teacherDoc.id,
    teacherUserId: uid,
    teacherName: str(teacherData["name"]) || "Professor",
    teacherColor: str(teacherData["color"]) || "#FF6A1A",
    weekdays: [],
    startTime: v.startTime,
    endTime: v.endTime,
    courtId: "",
    courtName: "",
    capacity: v.capacity,
    startDate: v.startDate,
    endDate: v.startDate,
    status: "active",
    notes: null,
  };

  const courts = await db.collection("arenas").doc(arenaId).collection("courts").get();
  const candidates = courts.docs
    .filter((d) => courtFitsLesson(d.data() as Data, str(input["sport"])))
    .sort((a, b) => (Number(a.data()["order"] ?? 0) - Number(b.data()["order"] ?? 0)) ||
      str(a.data()["name"]).localeCompare(str(b.data()["name"]), "pt-BR", {numeric: true}));
  const fromKey = addDaysToDateKey(todayKey, -1);
  for (const court of candidates) {
    const cls: ArenaClassData = {...base, courtId: court.id, courtName: str(court.data()["name"]).trim() || "Quadra"};
    const preview = await findClassConflicts(db, null, cls, fromKey, cls.startDate);
    if (preview.conflicts.length > 0) continue;
    const classRef = db.collection(ARENA_CLASSES).doc();
    await classRef.set({
      ...cls,
      studentCount: 0,
      conflictDates: [],
      materializedUntil: fromKey,
      packageEnrollmentIds: Object.values(packages),
      createdByUid: uid,
      createdByRole: "teacher",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    try {
      const result = await materializeClassRange(db, classRef.id, cls, fromKey, classHorizonKey(cls, todayKey));
      if (result.createdDates.length === 0) {
        // Alguém pegou a quadra entre a prévia e a gravação: tenta a próxima.
        await discardNewClass(db, classRef.id);
        continue;
      }
      for (const s of students) {
        const added = await addClassStudentCore(db, classRef.id, {
          ...s.resolved, studentId: s.resolved.athleteId ? null : s.studentId, addedByUid: uid,
        });
        const enrollmentId = s.studentId ? packages[s.studentId] : undefined;
        if (enrollmentId) {
          // A chamada fechada debita o pacote pela matrícula do aluno na turma.
          await classRef.collection(CLASS_STUDENTS).doc(added.studentId).set({enrollmentId, planName: "Pacote"}, {merge: true});
        }
      }
    } catch (e) {
      await discardNewClass(db, classRef.id);
      throw e;
    }
    await classRef.set({materializedUntil: materializedUntilAfter(cls, classHorizonKey(cls, todayKey))}, {merge: true});
    logger.info("createArenaClassLesson", {arenaId, classId: classRef.id, courtId: court.id, type});
    const out: CreateLessonResult = {
      classId: classRef.id,
      sessionId: classSessionId(classRef.id, cls.startDate),
      courtId: court.id,
      courtName: cls.courtName,
      packages,
    };
    return out;
  }
  throw new HttpsError("failed-precondition", "Nenhuma quadra livre nesse horário. Tente outro.");
});

// ---------------------------------------------------------------------------
// Aviso aos alunos (comunicado)
// ---------------------------------------------------------------------------

export const sendArenaClassNotice = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Data;
  const message = str(input["message"]).trim().slice(0, MAX_NOTICE_LENGTH);
  if (!message) throw new HttpsError("invalid-argument", "Escreva a mensagem.");
  const sessionIds = [...new Set(Array.isArray(input["sessionIds"]) ? (input["sessionIds"] as unknown[]).map(str).filter(Boolean) : [])];
  if (sessionIds.length === 0) throw new HttpsError("invalid-argument", "Escolha pelo menos uma aula.");
  if (sessionIds.length > MAX_NOTICE_SESSIONS) {
    throw new HttpsError("invalid-argument", `Até ${MAX_NOTICE_SESSIONS} aulas por aviso.`);
  }
  const db = getFirestore();
  const todayKey = dayKeyFromEventDate(new Date());
  const snaps = await db.getAll(...sessionIds.map((id) => db.collection(ARENA_CLASS_SESSIONS).doc(id)));
  const recipients = new Set<string>();
  for (const snap of snaps) {
    if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
    const data = snap.data() as Data;
    const session = parseClassSession(data);
    if (session.status !== "scheduled" || session.date < todayKey) {
      throw new HttpsError("failed-precondition", `A aula ${session.className} já passou ou foi cancelada.`);
    }
    await authorizeClassAction(db, session.arenaId, [str(data["teacherUserId"]) || null], uid, "canCancelLessons");
    for (const id of await classSessionRecipients(db, session)) recipients.add(id);
  }
  const first = parseClassSession(snaps[0].data() as Data);
  let notified = 0;
  for (const userId of recipients) {
    try {
      await deliverNotificationToUser({
        userId,
        title: "Aviso da aula",
        body: message,
        type: "arena_class_notice",
        data: {classSessionId: snaps[0].id, arenaId: first.arenaId},
        requireInteraction: false,
      });
      notified += 1;
    } catch (e) {
      logger.warn("sendArenaClassNotice: notificação falhou", {userId, error: e});
    }
  }
  logger.info("sendArenaClassNotice", {sessions: sessionIds.length, notified});
  return {notified};
});

// ---------------------------------------------------------------------------
// O que as telas do professor leem
// ---------------------------------------------------------------------------

export interface ProfessorActionsContext {
  todayKey: string;
  arenaId: string;
  permissions: {canEnrollStudents: boolean; canScheduleLessons: boolean; canCancelLessons: boolean};
  rules: {onlineBillingEnabled: boolean; makeupValidityDays: number; arenaCancelGeneratesCredit: boolean; enrollmentFeeReais: number};
  plans: Array<{planId: string; name: string; kind: string; priceReais: number; classesPerWeek: number | null; credits: number | null; validityDays: number | null}>;
  classes: Array<{classId: string; name: string; type: string; level: string; sport: string; weekdays: number[]; startTime: string; endTime: string; courtName: string; capacity: number; takenByWeekday: Record<string, number>}>;
  sessions: Array<{sessionId: string; classId: string; className: string; type: string; date: string; startTime: string; endTime: string; courtName: string; capacity: number; taken: number; studentCount: number; extras: Array<{studentId: string; name: string; kind: string; athleteId: string | null}>}>;
  waitlist: Array<{entryId: string; classId: string; name: string; athleteId: string | null; note: string | null; since: string | null}>;
  credits: Array<{creditId: string; studentId: string; name: string; expiresOn: string | null; sourceDate: string | null}>;
  /** Experimentais com conta das aulas dele (últimos dias até hoje) que ainda não são alunos dele. */
  trials: Array<{sessionId: string; classId: string; className: string; date: string; startTime: string; studentId: string; athleteId: string; name: string; mark: string | null}>;
}

/** Monta o contexto a partir do que foi lido (pura — os testes chamam direto). */
export function buildProfessorActionsContext(input: {
  arenaId: string;
  todayKey: string;
  link: Data | null;
  rules: Data | undefined;
  plans: Array<{id: string; data: Data}>;
  classes: Array<{id: string; data: Data}>;
  rosters: Map<string, Array<{id: string; data: Data}>>;
  sessions: Array<{id: string; data: Data}>;
  waitlist: Array<{id: string; data: Data}>;
  credits: Array<{id: string; data: Data}>;
}): ProfessorActionsContext {
  const effective = effectiveArenaProfessorPermissions(input.link ?? {});
  const rules = parseClassRules(input.rules);
  const classes = input.classes.map((c) => ({id: c.id, cls: parseArenaClass(c.data)}));
  const myStudents = new Set<string>();
  const takenByWeekday = (classId: string, weekdays: number[]) => {
    const roster = (input.rosters.get(classId) ?? []).filter((d) => str(d.data["status"]) === "active");
    return Object.fromEntries(weekdays.map((w) => [String(w), roster.filter((d) => studentAttendsWeekday(d.data, w)).length]));
  };
  for (const [, roster] of input.rosters) {
    for (const d of roster) if (["active", "paused"].includes(str(d.data["status"]))) myStudents.add(d.id);
  }
  return {
    todayKey: input.todayKey,
    arenaId: input.arenaId,
    permissions: {
      canEnrollStudents: effective.canEnrollStudents,
      canScheduleLessons: effective.canScheduleLessons,
      canCancelLessons: effective.canCancelLessons,
    },
    rules: {
      onlineBillingEnabled: rules.onlineBillingEnabled,
      makeupValidityDays: rules.makeupValidityDays,
      arenaCancelGeneratesCredit: rules.arenaCancelGeneratesCredit,
      enrollmentFeeReais: rules.enrollmentFeeReais,
    },
    plans: input.plans
      .map((p) => ({id: p.id, plan: parsePlan(p.data)}))
      .filter((p) => p.plan.status !== "archived" && p.plan.kind !== "single")
      .map(({id, plan}) => ({
        planId: id, name: plan.name, kind: plan.kind, priceReais: plan.priceReais,
        classesPerWeek: plan.classesPerWeek, credits: plan.credits, validityDays: plan.validityDays,
      }))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.priceReais - b.priceReais),
    classes: classes
      .filter(({cls}) => cls.status === "active" && cls.weekdays.length > 0)
      .map(({id, cls}) => ({
        classId: id, name: cls.name, type: cls.type, level: cls.level, sport: cls.sport, weekdays: cls.weekdays,
        startTime: cls.startTime, endTime: cls.endTime, courtName: cls.courtName, capacity: cls.capacity,
        takenByWeekday: takenByWeekday(id, cls.weekdays),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    sessions: input.sessions
      .map((d) => ({id: d.id, data: d.data, s: parseClassSession(d.data)}))
      .filter(({s}) => s.status === "scheduled" && s.date >= input.todayKey)
      .map(({id, data, s}) => {
        const weekday = isoWeekdayOfDateKey(s.date);
        const regulars = (input.rosters.get(s.classId) ?? [])
          .filter((d) => str(d.data["status"]) === "active" && studentAttendsWeekday(d.data, weekday)).length;
        const extras = Object.entries(s.extras).map(([studentId, e]) => ({studentId, name: e.name, kind: e.kind, athleteId: e.athleteId}));
        return {
          sessionId: id, classId: s.classId, className: s.className, type: str(data["type"]) || "turma", date: s.date,
          startTime: s.startTime, endTime: s.endTime, courtName: str(data["courtName"]) || "Quadra",
          capacity: Number(data["capacity"] ?? 0), taken: regulars + extras.length, studentCount: regulars, extras,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    waitlist: input.waitlist
      .filter((d) => str(d.data["status"]) === "waiting")
      .map((d) => {
        const created = d.data["createdAt"];
        return {
          entryId: d.id, classId: str(d.data["classId"]), name: str(d.data["name"]) || "Aluno",
          athleteId: str(d.data["athleteId"]) || null, note: str(d.data["note"]) || null,
          since: created instanceof Timestamp ? dayKeyFromEventDate(created.toDate()) : null,
          _order: created instanceof Timestamp ? created.toMillis() : 0,
        };
      })
      .sort((a, b) => a._order - b._order)
      .map(({_order, ...rest}) => rest),
    trials: trialsOf(input.sessions, myStudents, input.todayKey),
    credits: input.credits
      .filter((d) => str(d.data["status"]) === "available" && myStudents.has(str(d.data["studentId"])))
      .filter((d) => !str(d.data["expiresOn"]) || str(d.data["expiresOn"]) >= input.todayKey)
      .map((d) => ({
        creditId: d.id, studentId: str(d.data["studentId"]), name: str(d.data["name"]) || "Aluno",
        expiresOn: str(d.data["expiresOn"]) || null, sourceDate: str(d.data["sourceDate"]) || null,
      }))
      .sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999")),
  };
}

function trialsOf(
  sessions: Array<{id: string; data: Data}>,
  myStudents: Set<string>,
  todayKey: string,
): ProfessorActionsContext["trials"] {
  const fromKey = addDaysToDateKey(todayKey, -PROFESSOR_TRIALS_WINDOW_DAYS);
  const latest = new Map<string, ProfessorActionsContext["trials"][number]>();
  const ordered = sessions
    .map((d) => ({id: d.id, s: parseClassSession(d.data)}))
    .filter(({s}) => s.status !== "canceled" && s.date >= fromKey && s.date <= todayKey)
    .sort((a, b) => a.s.date.localeCompare(b.s.date) || a.s.startTime.localeCompare(b.s.startTime));
  for (const {id, s} of ordered) {
    for (const [studentId, extra] of Object.entries(s.extras)) {
      if (extra.kind !== "trial" || !extra.athleteId || myStudents.has(extra.athleteId)) continue;
      latest.set(extra.athleteId, {
        sessionId: id, classId: s.classId, className: s.className, date: s.date, startTime: s.startTime,
        studentId, athleteId: extra.athleteId, name: extra.name, mark: s.attendance[studentId]?.mark ?? null,
      });
    }
  }
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "pt-BR"));
}

export async function loadProfessorActionsContextCore(
  db: Firestore,
  uid: string,
  arenaId: string,
  todayKey: string,
): Promise<ProfessorActionsContext> {
  // Mesma porta de entrada da tela de alunos: vínculo ativo + "Gerenciar as próprias aulas".
  const link = await requireArenaProfessorPermission(db, arenaId, uid, "canManageOwnLessons");
  const untilKey = addDaysToDateKey(todayKey, PROFESSOR_ACTIONS_WINDOW_DAYS);
  const fromKey = addDaysToDateKey(todayKey, -PROFESSOR_TRIALS_WINDOW_DAYS);
  const [classSnap, sessionSnap, planSnap, rulesSnap, creditSnap] = await Promise.all([
    db.collection(ARENA_CLASSES).where("teacherUserId", "==", uid).where("arenaId", "==", arenaId).get(),
    db.collection(ARENA_CLASS_SESSIONS).where("teacherUserId", "==", uid)
      .where("date", ">=", fromKey).where("date", "<=", untilKey).get(),
    db.collection("arenas").doc(arenaId).collection(CLASS_PLANS).get(),
    classRulesRef(db, arenaId).get(),
    db.collection(ARENA_CLASS_CREDITS).where("arenaId", "==", arenaId).where("status", "==", "available").get(),
  ]);
  const classes = classSnap.docs
    .filter((d) => d.data()["status"] !== "archived")
    .map((d) => ({id: d.id, data: d.data() as Data}));
  const rosters = new Map<string, Array<{id: string; data: Data}>>();
  const waitlist: Array<{id: string; data: Data}> = [];
  await Promise.all(classes.map(async (c) => {
    const ref = db.collection(ARENA_CLASSES).doc(c.id);
    const [roster, wait] = await Promise.all([
      ref.collection(CLASS_STUDENTS).get(),
      ref.collection(CLASS_WAITLIST).where("status", "==", "waiting").get(),
    ]);
    rosters.set(c.id, roster.docs.map((d) => ({id: d.id, data: d.data() as Data})));
    waitlist.push(...wait.docs.map((d) => ({id: d.id, data: d.data() as Data})));
  }));
  return buildProfessorActionsContext({
    arenaId,
    todayKey,
    link: link as Data,
    rules: rulesSnap.data(),
    plans: planSnap.docs.map((d) => ({id: d.id, data: d.data() as Data})),
    classes,
    rosters,
    sessions: sessionSnap.docs
      .filter((d) => d.data()["arenaId"] === arenaId)
      .map((d) => ({id: d.id, data: d.data() as Data})),
    waitlist,
    credits: creditSnap.docs.map((d) => ({id: d.id, data: d.data() as Data})),
  });
}

export const getProfessorClassActions = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (request) => {
  const uid = requireUid(request.auth);
  const arenaId = str((request.data as Data | undefined)?.["arenaId"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  return loadProfessorActionsContextCore(getFirestore(), uid, arenaId, dayKeyFromEventDate(new Date()));
});
