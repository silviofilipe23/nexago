/**
 * Hub › Aulas · "Agendar experimental": o atleta escolhe a aula no calendário do local.
 *
 * - Arena: o próprio atleta se encaixa como experimental (`extras.{uid}.kind = "trial"`), pela
 *   mesma `addExtraCore` da equipe e do professor — conta na vaga do dia, aparece na chamada, na
 *   agenda do professor e na agenda do atleta (`getMyClassAgenda`). Desmarcar = "Não vou".
 * - CT: o atleta pede a aula e o pedido fica em `trainingCenters/{c}/trialBookings/{sessionId_uid}`
 *   (`pending`). A equipe do centro (owner/admin/recepção) confirma ou recusa no portal (tela
 *   Experimentais) e o atleta recebe o push. Pendente e confirmada seguram a vaga da aula. Só o
 *   servidor grava nessa coleção (rules: catch-all). A aula leva um espelho dos pedidos ativos em
 *   `sessions/{id}.trials.{athleteId}` (nome, foto, status) para o professor e a chamada verem —
 *   recusa e desmarque tiram o atleta; o cliente não grava esse campo (rules).
 *
 * As aulas são da equipe (rules) — aqui sai só o que a vitrine mostra: horário, turma, professor
 * (nome), local e vagas. Nunca quem são os alunos.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {addDaysToDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {ARENA_CLASSES, ARENA_CLASS_SESSIONS, CLASS_STUDENTS} from "./arena-class-constants";
import {studentAttendsWeekday} from "./arena-class-ledger";
import {classSessionStartAt, parseClassSession, requireUid, resolveStudentInput, str} from "./arena-class";
import {findClassSeat, sessionStartAt} from "./arena-class-athlete-actions";
import {addExtraCore} from "./arena-class-makeup";
import {arenaShowcaseRef, parseShowcase} from "./class-showcase";
import {isListedArenaClass, isListedCenterClass} from "./class-directory";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {defaultNotifyDeps, managerUids, type NotifyDeps} from "./training-center-notify";

type Data = Record<string, unknown>;

/** Janela do calendário da experimental (dias a partir de hoje). */
export const TRIAL_WINDOW_DAYS = 21;
const MAX_TRIAL_OPTIONS = 120;

export interface TrialOption {
  sessionId: string;
  classId: string;
  className: string;
  level: string;
  teacherName: string;
  place: string;
  date: string;
  startTime: string;
  endTime: string;
  spotsLeft: number;
}

export type TrialBookingStatus = "pending" | "confirmed" | "declined" | "canceled";

export interface TrialOptions {
  /** Hoje os dois agendam pelo app (o CT confirma depois). */
  booking: "app";
  options: TrialOption[];
  /** Experimental que o atleta já marcou neste local, ainda por acontecer. */
  booked: TrialOption | null;
  /** Arena: sempre `confirmed`. CT: `pending` até a equipe confirmar. */
  bookedStatus: TrialBookingStatus | null;
  /** CT: id do pedido (para desmarcar). */
  bookingId: string | null;
}

export const CENTER_TRIAL_BOOKINGS = "trialBookings";
/** Pedido que ainda segura a vaga. */
const ACTIVE_TRIAL: TrialBookingStatus[] = ["pending", "confirmed"];
export const CENTER_TRIAL_REQUEST_TYPE = "training_center_trial_request";
export const CENTER_TRIAL_DECIDED_TYPE = "training_center_trial_decided";
const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h! * 60 + m! + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sortOptions(list: TrialOption[]): TrialOption[] {
  return list.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) ||
    a.className.localeCompare(b.className, "pt-BR"));
}

async function assertArenaTrialEnabled(db: Firestore, arenaId: string): Promise<void> {
  const showcase = parseShowcase((await arenaShowcaseRef(db, arenaId).get()).data());
  if (!showcase.trial.enabled) {
    throw new HttpsError("failed-precondition", "Esta arena não está agendando aula experimental.");
  }
}

/** Experimental do atleta nesta arena que ainda não aconteceu (uma por vez). */
async function upcomingArenaTrial(db: Firestore, uid: string, arenaId: string, todayKey: string, now: Date) {
  const snap = await db.collection(ARENA_CLASS_SESSIONS)
    .where("extraAthleteIds", "array-contains", uid).where("date", ">=", todayKey).get();
  for (const doc of snap.docs) {
    const raw = doc.data() as Data;
    if (str(raw["arenaId"]) !== arenaId) continue;
    const session = parseClassSession(raw);
    if (session.status !== "scheduled" || sessionStartAt(raw).getTime() <= now.getTime()) continue;
    if (Object.values(session.extras).some((e) => e.athleteId === uid && e.kind === "trial")) {
      return {id: doc.id, raw};
    }
  }
  return null;
}

function arenaOption(id: string, raw: Data, cls: Data, spotsLeft: number): TrialOption {
  const session = parseClassSession(raw);
  return {
    sessionId: id,
    classId: session.classId,
    className: str(raw["className"]) || str(cls["name"]) || "Turma",
    level: str(cls["level"]),
    teacherName: str(raw["teacherName"]) || str(cls["teacherName"]),
    place: str(raw["courtName"]) || str(cls["courtName"]),
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    spotsLeft,
  };
}

/** Aulas da arena com vaga nos próximos dias, onde o atleta ainda não está. */
export async function loadArenaTrialOptionsCore(
  db: Firestore, uid: string, arenaId: string, todayKey: string, now: Date,
): Promise<TrialOptions> {
  await assertArenaTrialEnabled(db, arenaId);
  const toKey = addDaysToDateKey(todayKey, TRIAL_WINDOW_DAYS);
  const [classSnap, sessionSnap] = await Promise.all([
    db.collection(ARENA_CLASSES).where("arenaId", "==", arenaId).get(),
    db.collection(ARENA_CLASS_SESSIONS).where("arenaId", "==", arenaId)
      .where("date", ">=", todayKey).where("date", "<=", toKey).get(),
  ]);
  const classes = new Map(classSnap.docs
    .filter((d) => isListedArenaClass(d.data() as Data, todayKey))
    .map((d) => [d.id, d] as const));
  const rosters = new Map<string, Data[]>();
  await Promise.all([...classes.values()].map(async (d) => {
    const roster = await d.ref.collection(CLASS_STUDENTS).where("status", "==", "active").get();
    rosters.set(d.id, roster.docs.map((r) => r.data() as Data));
  }));

  const options: TrialOption[] = [];
  let booked: TrialOption | null = null;
  for (const doc of sessionSnap.docs) {
    const raw = doc.data() as Data;
    const session = parseClassSession(raw);
    const clsDoc = classes.get(session.classId);
    if (!clsDoc || session.status !== "scheduled") continue;
    if (sessionStartAt(raw).getTime() <= now.getTime()) continue;
    const cls = clsDoc.data() as Data;
    const weekday = isoWeekdayOfDateKey(session.date);
    const regulars = (rosters.get(clsDoc.id) ?? []).filter((d) => studentAttendsWeekday(d, weekday));
    const capacity = num(raw["capacity"]) || num(cls["capacity"]);
    const spotsLeft = Math.max(0, capacity - regulars.length - Object.keys(session.extras).length);
    const mine = Object.values(session.extras).find((e) => e.athleteId === uid);
    if (mine?.kind === "trial" && booked == null) booked = arenaOption(doc.id, raw, cls, spotsLeft);
    if (mine || regulars.some((d) => d["athleteId"] === uid) || spotsLeft === 0) continue;
    options.push(arenaOption(doc.id, raw, cls, spotsLeft));
  }
  return {
    booking: "app", options: sortOptions(options).slice(0, MAX_TRIAL_OPTIONS), booked,
    bookedStatus: booked ? "confirmed" : null, bookingId: null,
  };
}

function centerTrialRef(db: Firestore, centerId: string) {
  return db.doc(`${TRAINING_CENTERS}/${centerId}`).collection(CENTER_TRIAL_BOOKINGS);
}

export function centerTrialBookingId(sessionId: string, uid: string): string {
  return `${sessionId}_${uid}`;
}

function isActiveTrial(b: Data): boolean {
  return ACTIVE_TRIAL.includes(str(b["status"]) as TrialBookingStatus);
}

async function loadActiveCenter(db: Firestore, centerId: string): Promise<Data> {
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  const snap = await db.doc(`${TRAINING_CENTERS}/${centerId}`).get();
  const center = snap.data() as Data | undefined;
  if (!snap.exists || !center || str(center["status"]) !== "active") {
    throw new HttpsError("not-found", "Centro de treinamento não encontrado.");
  }
  return center;
}

function assertCenterTrialEnabled(center: Data): void {
  if (!parseShowcase(center["showcase"]).trial.enabled) {
    throw new HttpsError("failed-precondition", "Este centro não está agendando aula experimental.");
  }
}

/** Vagas da aula do CT: turma − fixos − reposições − experimentais ativas. */
export function centerSpotsLeft(cls: Data, session: Data, activeTrials: number): number {
  const roster = Array.isArray(cls["rosterStudentIds"]) ? cls["rosterStudentIds"].length : num(cls["seatsTaken"]);
  const makeups = Array.isArray(session["makeupStudentIds"]) ? session["makeupStudentIds"].length : 0;
  return Math.max(0, num(cls["capacity"]) - roster - makeups - activeTrials);
}

function centerOption(id: string, s: Data, cls: Data, spotsLeft: number): TrialOption {
  const startTime = str(s["startTime"]) || str(cls["startTime"]);
  const duration = num(s["durationMin"]) || num(cls["durationMin"]) || 60;
  return {
    sessionId: id,
    classId: str(s["classId"]),
    className: str(s["className"]) || str(cls["name"]) || "Turma",
    level: str(cls["level"]),
    teacherName: str(s["coachName"]) || str(cls["coachName"]),
    place: str(s["locationName"]) || str(cls["locationName"]),
    date: str(s["date"]),
    startTime,
    endTime: addMinutes(startTime, duration),
    spotsLeft,
  };
}

/** Espelho do pedido na aula (`sessions/{id}.trials.{athleteId}`). */
export function sessionTrialMirror(bookingId: string, b: Data, status: TrialBookingStatus): Data {
  return {bookingId, name: str(b["name"]) || "Atleta", photoUrl: str(b["photoUrl"]) || null, status};
}

function trialStartAt(b: Data): Date {
  return classSessionStartAt(str(b["date"]), str(b["startTime"]));
}

/** Aulas do CT com vaga nos próximos dias e o pedido do atleta, se houver. */
export async function loadCenterTrialOptionsCore(
  db: Firestore, uid: string, centerId: string, todayKey: string, now: Date,
): Promise<TrialOptions> {
  const center = await loadActiveCenter(db, centerId);
  assertCenterTrialEnabled(center);
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const toKey = addDaysToDateKey(todayKey, TRIAL_WINDOW_DAYS);
  const [classSnap, sessionSnap, trialSnap] = await Promise.all([
    ref.collection("classes").where("status", "==", "active").get(),
    ref.collection("sessions").where("date", ">=", todayKey).where("date", "<=", toKey).get(),
    centerTrialRef(db, centerId).where("date", ">=", todayKey).get(),
  ]);
  const classes = new Map(classSnap.docs
    .filter((d) => isListedCenterClass(d.data() as Data, todayKey))
    .map((d) => [d.id, d.data() as Data] as const));
  const trials = trialSnap.docs.map((d) => ({id: d.id, data: d.data() as Data})).filter((t) => isActiveTrial(t.data));
  const trialsBySession = new Map<string, number>();
  for (const t of trials) {
    const sid = str(t.data["sessionId"]);
    trialsBySession.set(sid, (trialsBySession.get(sid) ?? 0) + 1);
  }
  const mine = trials.find((t) => str(t.data["athleteId"]) === uid && trialStartAt(t.data).getTime() > now.getTime());

  const options: TrialOption[] = [];
  for (const doc of sessionSnap.docs) {
    const s = doc.data() as Data;
    const cls = classes.get(str(s["classId"]));
    if (!cls || str(s["status"]) !== "scheduled") continue;
    const startTime = str(s["startTime"]) || str(cls["startTime"]);
    if (classSessionStartAt(str(s["date"]), startTime).getTime() <= now.getTime()) continue;
    const spotsLeft = centerSpotsLeft(cls, s, trialsBySession.get(doc.id) ?? 0);
    if (spotsLeft === 0) continue;
    options.push(centerOption(doc.id, s, cls, spotsLeft));
  }
  const booked: TrialOption | null = mine ? {
    sessionId: str(mine.data["sessionId"]),
    classId: str(mine.data["classId"]),
    className: str(mine.data["className"]) || "Turma",
    level: str(mine.data["level"]),
    teacherName: str(mine.data["coachName"]),
    place: str(mine.data["locationName"]),
    date: str(mine.data["date"]),
    startTime: str(mine.data["startTime"]),
    endTime: str(mine.data["endTime"]),
    spotsLeft: 0,
  } : null;
  return {
    booking: "app",
    options: sortOptions(options).slice(0, MAX_TRIAL_OPTIONS),
    booked,
    bookedStatus: mine ? str(mine.data["status"]) as TrialBookingStatus : null,
    bookingId: mine?.id ?? null,
  };
}

/** O atleta pede a experimental no CT; fica pendente até a equipe confirmar. */
export async function bookCenterTrialCore(
  db: Firestore, deps: NotifyDeps, uid: string, centerId: string, sessionId: string, todayKey: string,
): Promise<{bookingId: string; status: TrialBookingStatus}> {
  const center = await loadActiveCenter(db, centerId);
  assertCenterTrialEnabled(center);
  if (!sessionId || sessionId.includes("/")) throw new HttpsError("invalid-argument", "Aula inválida.");
  const now = deps.now();
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const sessionRef = ref.collection("sessions").doc(sessionId);
  const student = await resolveStudentInput(db, {athleteId: uid});
  const mineSnap = await ref.collection("students").where("athleteId", "==", uid).get();
  const myStudentIds = new Set(mineSnap.docs.map((d) => d.id));
  const bookingRef = centerTrialRef(db, centerId).doc(centerTrialBookingId(sessionId, uid));

  const booking = await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(sessionRef);
    const s = sSnap.data() as Data | undefined;
    if (!sSnap.exists || !s) throw new HttpsError("not-found", "Aula não encontrada.");
    if (str(s["status"]) !== "scheduled") throw new HttpsError("failed-precondition", "Esta aula não está mais na agenda.");
    const clsSnap = await tx.get(ref.collection("classes").doc(str(s["classId"])));
    const cls = clsSnap.data() as Data | undefined;
    if (!clsSnap.exists || !cls || !isListedCenterClass(cls, todayKey)) {
      throw new HttpsError("failed-precondition", "Esta turma não recebe aula experimental.");
    }
    const option = centerOption(sessionId, s, cls, 0);
    if (classSessionStartAt(option.date, option.startTime).getTime() <= now.getTime()) {
      throw new HttpsError("failed-precondition", "Esta aula já começou.");
    }
    const roster = Array.isArray(cls["rosterStudentIds"]) ? cls["rosterStudentIds"].map(String) : [];
    const makeups = Array.isArray(s["makeupStudentIds"]) ? s["makeupStudentIds"].map(String) : [];
    if ([...roster, ...makeups].some((id) => myStudentIds.has(id))) {
      throw new HttpsError("already-exists", "Você já está nesta aula.");
    }
    const trialSnap = await tx.get(centerTrialRef(db, centerId).where("date", ">=", todayKey));
    const active = trialSnap.docs.map((d) => d.data() as Data).filter(isActiveTrial);
    if (active.some((t) => str(t["athleteId"]) === uid && trialStartAt(t).getTime() > now.getTime())) {
      throw new HttpsError("already-exists", "Você já tem uma aula experimental marcada neste centro.");
    }
    const taken = active.filter((t) => str(t["sessionId"]) === sessionId).length;
    if (centerSpotsLeft(cls, s, taken) === 0) throw new HttpsError("failed-precondition", "A aula está sem vaga.");
    const doc = {
      centerId, centerName: str(center["name"]) || "Centro de treinamento", sessionId, classId: option.classId, className: option.className, level: option.level,
      coachName: option.teacherName, coachUid: str(s["coachUid"]) || str(cls["coachUid"]) || null,
      locationName: option.place, date: option.date, startTime: option.startTime, endTime: option.endTime,
      athleteId: uid, name: student.name, phone: student.phone, photoUrl: student.photoUrl,
      priceReais: parseShowcase(center["showcase"]).trial.priceReais,
      status: "pending" as TrialBookingStatus, note: null, decidedAt: null, decidedByUid: null, decidedByName: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(bookingRef, doc);
    tx.set(sessionRef, {trials: {[uid]: sessionTrialMirror(bookingRef.id, doc, "pending")}}, {merge: true});
    return doc;
  });

  const uids = await managerUids(db, centerId).catch(() => [] as string[]);
  await Promise.all(uids.map((to) => deps.notify({
    userId: to,
    title: "Nova aula experimental para confirmar",
    body: `${booking.name} · ${booking.className} · ${dateBr(booking.date)} ${booking.startTime}`,
    type: CENTER_TRIAL_REQUEST_TYPE,
    data: {centerId, bookingId: bookingRef.id, url: `/competir/aulas/ct/${centerId}`, webUrl: `/centro/${centerId}/experimentais`},
  }).catch((e) => logger.warn("aviso de experimental à equipe falhou", {centerId, to, e}))));
  return {bookingId: bookingRef.id, status: "pending"};
}

function dateBr(dateKey: string): string {
  return dateKey.length === 10 ? `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}` : dateKey;
}

/** O atleta desmarca o próprio pedido (pendente ou confirmado) antes da aula. */
export async function cancelCenterTrialCore(
  db: Firestore, uid: string, centerId: string, bookingId: string, now: Date,
): Promise<{bookingId: string}> {
  if (!centerId || centerId.includes("/") || !bookingId || bookingId.includes("/")) {
    throw new HttpsError("invalid-argument", "Pedido inválido.");
  }
  const ref = centerTrialRef(db, centerId).doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const b = snap.data() as Data | undefined;
    if (!snap.exists || !b || str(b["athleteId"]) !== uid) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (!isActiveTrial(b)) throw new HttpsError("failed-precondition", "Este pedido já foi encerrado.");
    if (trialStartAt(b).getTime() <= now.getTime()) throw new HttpsError("failed-precondition", "Esta aula já começou.");
    const sessionRef = db.doc(`${TRAINING_CENTERS}/${centerId}/sessions/${str(b["sessionId"])}`);
    const session = await tx.get(sessionRef);
    tx.update(ref, {status: "canceled", updatedAt: FieldValue.serverTimestamp()});
    if (session.exists) tx.set(sessionRef, {trials: {[uid]: FieldValue.delete()}}, {merge: true});
  });
  return {bookingId};
}

// ── equipe do CT (portal › Experimentais) ────────────────────────────────

/** Owner/admin, recepção ou quem tem "Matricular alunos". */
export function canHandleCenterTrials(member: Data | undefined): boolean {
  if (!member || member["status"] !== "active") return false;
  const role = str(member["role"]);
  if (role === "center_owner" || role === "center_admin" || role === "receptionist") return true;
  return Array.isArray(member["extraPerms"]) && member["extraPerms"].includes("enroll_students");
}

async function requireTrialStaff(db: Firestore, uid: string, centerId: string): Promise<{name: string}> {
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  const member = (await db.doc(`${TRAINING_CENTERS}/${centerId}/centerMembers/${uid}`).get()).data();
  if (!canHandleCenterTrials(member)) {
    throw new HttpsError("permission-denied", "Só a gestão ou a recepção do centro confirma experimentais.");
  }
  return {name: str(member?.["displayName"]) || "Equipe"};
}

export interface CenterTrialBookingView {
  id: string;
  status: TrialBookingStatus;
  athleteId: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  sessionId: string;
  classId: string;
  className: string;
  level: string;
  coachName: string;
  locationName: string;
  date: string;
  startTime: string;
  endTime: string;
  priceReais: number;
  note: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
}

function isoOf(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}

/** Pedidos de experimental dos últimos 7 dias em diante, pendentes primeiro. */
export async function loadCenterTrialBookingsCore(
  db: Firestore, uid: string, centerId: string, todayKey: string,
): Promise<{bookings: CenterTrialBookingView[]}> {
  await requireTrialStaff(db, uid, centerId);
  const snap = await centerTrialRef(db, centerId).where("date", ">=", addDaysToDateKey(todayKey, -7)).get();
  const order: Record<string, number> = {pending: 0, confirmed: 1, declined: 2, canceled: 3};
  const bookings = snap.docs.map((d): CenterTrialBookingView => {
    const b = d.data() as Data;
    return {
      id: d.id,
      status: (str(b["status"]) || "pending") as TrialBookingStatus,
      athleteId: str(b["athleteId"]),
      name: str(b["name"]) || "Atleta",
      phone: str(b["phone"]) || null,
      photoUrl: str(b["photoUrl"]) || null,
      sessionId: str(b["sessionId"]),
      classId: str(b["classId"]),
      className: str(b["className"]) || "Turma",
      level: str(b["level"]),
      coachName: str(b["coachName"]),
      locationName: str(b["locationName"]),
      date: str(b["date"]),
      startTime: str(b["startTime"]),
      endTime: str(b["endTime"]),
      priceReais: num(b["priceReais"]),
      note: str(b["note"]) || null,
      createdAt: isoOf(b["createdAt"]),
      decidedAt: isoOf(b["decidedAt"]),
      decidedByName: str(b["decidedByName"]) || null,
    };
  }).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return {bookings};
}

/** Confirma ou recusa um pedido pendente e avisa o atleta. */
export async function decideCenterTrialCore(
  db: Firestore, deps: NotifyDeps, uid: string, raw: Data,
): Promise<{bookingId: string; status: TrialBookingStatus}> {
  const centerId = str(raw["centerId"]);
  const bookingId = str(raw["bookingId"]);
  const decision = str(raw["decision"]);
  const note = str(raw["note"]).slice(0, 200) || null;
  if (decision !== "confirm" && decision !== "decline") throw new HttpsError("invalid-argument", "Decisão inválida.");
  if (!bookingId || bookingId.includes("/")) throw new HttpsError("invalid-argument", "Pedido inválido.");
  const staff = await requireTrialStaff(db, uid, centerId);
  const center = (await db.doc(`${TRAINING_CENTERS}/${centerId}`).get()).data() ?? {};
  const ref = centerTrialRef(db, centerId).doc(bookingId);
  const status: TrialBookingStatus = decision === "confirm" ? "confirmed" : "declined";
  const b = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Data | undefined;
    if (!snap.exists || !data) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (str(data["status"]) !== "pending") throw new HttpsError("failed-precondition", "Este pedido já foi respondido.");
    const sessionRef = db.doc(`${TRAINING_CENTERS}/${centerId}/sessions/${str(data["sessionId"])}`);
    const session = await tx.get(sessionRef);
    const athleteId = str(data["athleteId"]);
    if (session.exists && athleteId) {
      tx.set(sessionRef, {
        trials: {[athleteId]: status === "confirmed" ? sessionTrialMirror(bookingId, data, status) : FieldValue.delete()},
      }, {merge: true});
    }
    tx.update(ref, {
      status, note, decidedAt: FieldValue.serverTimestamp(), decidedByUid: uid, decidedByName: staff.name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return data;
  });

  const when = `${dateBr(str(b["date"]))} às ${str(b["startTime"])}`;
  const centerName = str(center["name"]) || "O centro";
  try {
    await deps.notify({
      userId: str(b["athleteId"]),
      title: status === "confirmed" ? "Aula experimental confirmada" : "Aula experimental não confirmada",
      body: status === "confirmed" ?
        `${centerName} confirmou sua experimental · ${str(b["className"])} · ${when}.` :
        `${centerName} não pôde confirmar ${str(b["className"])} · ${when}.${note ? ` ${note}` : " Escolha outro horário."}`,
      type: CENTER_TRIAL_DECIDED_TYPE,
      data: {centerId, bookingId, url: `/competir/aulas/ct/${centerId}`},
    });
  } catch (e) {
    logger.warn("aviso de experimental ao atleta falhou", {centerId, bookingId, e});
  }
  return {bookingId, status};
}

/** O atleta se encaixa como experimental na aula da arena. */
export async function bookArenaTrialCore(
  db: Firestore, uid: string, sessionId: string, todayKey: string, now: Date,
): Promise<{sessionId: string; studentId: string}> {
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const sessionSnap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const raw = sessionSnap.data() as Data;
  const arenaId = str(raw["arenaId"]);
  await assertArenaTrialEnabled(db, arenaId);
  const cls = await db.collection(ARENA_CLASSES).doc(str(raw["classId"])).get();
  if (!cls.exists || !isListedArenaClass(cls.data() as Data, todayKey)) {
    throw new HttpsError("failed-precondition", "Esta turma não recebe aula experimental.");
  }
  if (sessionStartAt(raw).getTime() <= now.getTime()) throw new HttpsError("failed-precondition", "Esta aula já começou.");
  if (await findClassSeat(db, (q) => q.get(), raw, uid)) {
    throw new HttpsError("already-exists", "Você já está nesta aula.");
  }
  if (await upcomingArenaTrial(db, uid, arenaId, todayKey, now)) {
    throw new HttpsError("already-exists", "Você já tem uma aula experimental marcada nesta arena.");
  }
  const student = await resolveStudentInput(db, {athleteId: uid});
  const {studentId} = await addExtraCore(db, sessionId, {
    kind: "trial",
    creditId: null,
    student: {athleteId: uid, name: student.name},
  }, todayKey);
  return {sessionId, studentId};
}

export const getClassTrialOptions = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  const kind = str(data["kind"]);
  const id = str(data["id"]);
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "Local inválido.");
  const db = getFirestore();
  const now = new Date();
  const todayKey = dayKeyFromEventDate(now);
  if (kind === "arena") return loadArenaTrialOptionsCore(db, uid, id, todayKey, now);
  if (kind === "center") return loadCenterTrialOptionsCore(db, uid, id, todayKey, now);
  throw new HttpsError("invalid-argument", "Tipo inválido.");
});

export const bookArenaClassTrial = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  const now = new Date();
  return bookArenaTrialCore(getFirestore(), uid, str(data["sessionId"]), dayKeyFromEventDate(now), now);
});

export const bookCenterClassTrial = onCall({region: CLIENT_FACING_REGIONS, secrets: PUSH_SECRETS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  return bookCenterTrialCore(getFirestore(), defaultNotifyDeps, uid, str(data["centerId"]), str(data["sessionId"]),
    dayKeyFromEventDate(new Date()));
});

export const cancelCenterClassTrial = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  return cancelCenterTrialCore(getFirestore(), uid, str(data["centerId"]), str(data["bookingId"]), new Date());
});

export const getCenterTrialBookings = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  return loadCenterTrialBookingsCore(getFirestore(), uid, str(data["centerId"]), dayKeyFromEventDate(new Date()));
});

export const decideCenterTrialBooking = onCall({region: CLIENT_FACING_REGIONS, secrets: PUSH_SECRETS}, async (request) => {
  const uid = requireUid(request.auth);
  return decideCenterTrialCore(getFirestore(), defaultNotifyDeps, uid, (request.data ?? {}) as Data);
});
