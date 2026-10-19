/**
 * Aulas — fase 2: encaixe na aula (reposição com crédito ou experimental) e lista de espera.
 * O encaixe vive na própria aula (`extras`) — não é aluno da turma — e conta na vaga daquele dia.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CREDITS,
  ARENA_CLASS_SESSIONS,
  CLASS_STUDENTS,
  CLASS_WAITLIST,
} from "./arena-class-constants";
import {studentAttendsWeekday} from "./arena-class-ledger";
import {
  loadClassOrThrow,
  parseClassSession,
  requireClassManager,
  requireUid,
  resolveStudentInput,
  str,
  type UpsertClassStudentInput,
} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export interface AddExtraInput {
  kind: "makeup" | "trial";
  creditId: string | null;
  student: {athleteId: string | null; name: string};
}

/** Encaixa na aula: confere aula futura/de hoje, vaga do dia e (reposição) crédito válido. */
export async function addExtraCore(
  db: Firestore,
  sessionId: string,
  input: AddExtraInput,
  todayKey: string,
): Promise<{studentId: string}> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(sessionId);
  return db.runTransaction(async (tx: Transaction) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
    const raw = sessionSnap.data() as Record<string, unknown>;
    const session = parseClassSession(raw);
    if (session.status !== "scheduled") throw new HttpsError("failed-precondition", "Esta aula não recebe mais encaixe.");
    if (session.date < todayKey) throw new HttpsError("failed-precondition", "Esta aula já passou.");

    let studentId: string;
    let name = input.student.name;
    let athleteId = input.student.athleteId;
    const creditRef = input.creditId ? db.collection(ARENA_CLASS_CREDITS).doc(input.creditId) : null;
    if (input.kind === "makeup") {
      if (!creditRef) throw new HttpsError("invalid-argument", "Escolha o crédito de reposição.");
      const creditSnap = await tx.get(creditRef);
      const credit = creditSnap.data();
      if (!creditSnap.exists || credit?.["arenaId"] !== session.arenaId) {
        throw new HttpsError("not-found", "Crédito não encontrado.");
      }
      if (credit?.["status"] !== "available") throw new HttpsError("failed-precondition", "Este crédito já foi usado ou venceu.");
      if (String(credit?.["expiresOn"] ?? "") < session.date) {
        throw new HttpsError("failed-precondition", "O crédito vence antes desta aula.");
      }
      studentId = String(credit?.["studentId"] ?? "");
      name = String(credit?.["name"] ?? name);
      athleteId = typeof credit?.["athleteId"] === "string" ? credit["athleteId"] : null;
    } else {
      studentId = athleteId ?? `trial_${db.collection(ARENA_CLASS_SESSIONS).doc().id}`;
    }

    const weekday = isoWeekdayOfDateKey(session.date);
    const roster = await tx.get(db.collection(ARENA_CLASSES).doc(session.classId)
      .collection(CLASS_STUDENTS).where("status", "==", "active"));
    const regulars = roster.docs.filter((d) => studentAttendsWeekday(d.data() as Record<string, unknown>, weekday));
    if (regulars.some((d) => d.id === studentId) || session.extras[studentId]) {
      throw new HttpsError("already-exists", `${name} já está nesta aula.`);
    }
    const capacity = Number(raw["capacity"] ?? 0);
    if (regulars.length + Object.keys(session.extras).length >= capacity) {
      throw new HttpsError("failed-precondition", "A aula está sem vaga.");
    }

    tx.set(sessionRef, {
      extras: {[studentId]: {name, kind: input.kind, creditId: input.creditId, athleteId}},
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (creditRef) {
      tx.set(creditRef, {status: "used", usedSessionId: sessionId, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    }
    return {studentId};
  });
}

/** Tira o encaixe; a reposição devolve o crédito (se a chamada ainda não fechou). */
export async function removeExtraCore(db: Firestore, sessionId: string, studentId: string): Promise<void> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(sessionId);
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
    const session = parseClassSession(snap.data() as Record<string, unknown>);
    const extra = session.extras[studentId];
    if (!extra) throw new HttpsError("not-found", "Encaixe não encontrado.");
    if (session.status === "completed") throw new HttpsError("failed-precondition", "A chamada já foi fechada.");
    tx.set(sessionRef, {
      extras: {[studentId]: FieldValue.delete()},
      attendance: {[studentId]: FieldValue.delete()},
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    if (extra.kind === "makeup" && extra.creditId) {
      tx.set(db.collection(ARENA_CLASS_CREDITS).doc(extra.creditId), {
        status: "available", usedSessionId: null, updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  });
}

async function sessionArenaOrThrow(db: Firestore, sessionId: string): Promise<string> {
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const snap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  return String(snap.data()?.["arenaId"] ?? "");
}

export const addArenaClassExtra = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = str(input["sessionId"]);
  const kind = str(input["kind"]);
  if (kind !== "makeup" && kind !== "trial") throw new HttpsError("invalid-argument", "Tipo de encaixe inválido.");
  const db = getFirestore();
  await requireClassManager(db, await sessionArenaOrThrow(db, sessionId), uid);
  let student = {athleteId: null as string | null, name: "Aluno"};
  if (kind === "trial") {
    const resolved = await resolveStudentInput(db, input as UpsertClassStudentInput);
    student = {athleteId: resolved.athleteId, name: resolved.name};
  }
  return addExtraCore(db, sessionId, {
    kind,
    creditId: str(input["creditId"]) || null,
    student,
  }, dayKeyFromEventDate(new Date()));
});

export const removeArenaClassExtra = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const sessionId = str(input["sessionId"]);
  const studentId = str(input["studentId"]);
  if (!studentId) throw new HttpsError("invalid-argument", "Aluno inválido.");
  const db = getFirestore();
  await requireClassManager(db, await sessionArenaOrThrow(db, sessionId), uid);
  await removeExtraCore(db, sessionId, studentId);
  return {sessionId, studentId};
});

// ---------------------------------------------------------------------------
// Lista de espera (manual — a oferta da vaga é pelo WhatsApp)
// ---------------------------------------------------------------------------

export const addArenaClassWaitlist = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const db = getFirestore();
  const {ref: classRef, cls} = await loadClassOrThrow(db, str(input["classId"]));
  await requireClassManager(db, cls.arenaId, uid);
  const student = await resolveStudentInput(db, input as UpsertClassStudentInput);
  const col = classRef.collection(CLASS_WAITLIST);
  if (student.athleteId) {
    const dup = await col.where("athleteId", "==", student.athleteId).where("status", "==", "waiting").get();
    if (!dup.empty) throw new HttpsError("already-exists", `${student.name} já está na lista de espera.`);
  }
  const ref = col.doc();
  await ref.set({
    arenaId: cls.arenaId, classId: classRef.id, athleteId: student.athleteId, name: student.name,
    phone: student.phone, note: str(input["note"]).slice(0, 120) || null, status: "waiting",
    addedByUid: uid, createdAt: FieldValue.serverTimestamp(),
  });
  return {entryId: ref.id};
});

export const removeArenaClassWaitlist = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const entryId = str(input["entryId"]);
  if (!entryId) throw new HttpsError("invalid-argument", "Entrada inválida.");
  const db = getFirestore();
  const {ref: classRef, cls} = await loadClassOrThrow(db, str(input["classId"]));
  await requireClassManager(db, cls.arenaId, uid);
  const ref = classRef.collection(CLASS_WAITLIST).doc(entryId);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Entrada não encontrada.");
  await ref.set({status: "removed", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  return {entryId};
});
