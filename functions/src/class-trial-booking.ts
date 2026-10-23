/**
 * Hub › Aulas · "Agendar experimental": o atleta escolhe a aula no calendário do local.
 *
 * - Arena: o próprio atleta se encaixa como experimental (`extras.{uid}.kind = "trial"`), pela
 *   mesma `addExtraCore` da equipe e do professor — conta na vaga do dia, aparece na chamada, na
 *   agenda do professor e na agenda do atleta (`getMyClassAgenda`). Desmarcar = "Não vou".
 * - CT: o modelo do centro não tem encaixe de experimental. A callable só devolve as aulas com vaga
 *   para o calendário; a confirmação segue pelo WhatsApp do centro, já com a aula escolhida.
 *
 * As aulas são da equipe (rules) — aqui sai só o que a vitrine mostra: horário, turma, professor
 * (nome), local e vagas. Nunca quem são os alunos.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
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

export interface TrialOptions {
  /** `arena` agenda pelo app; `center` confirma pelo WhatsApp. */
  booking: "app" | "contact";
  options: TrialOption[];
  /** Experimental que o atleta já marcou neste local (só arena), ainda por acontecer. */
  booked: TrialOption | null;
}

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
  return {booking: "app", options: sortOptions(options).slice(0, MAX_TRIAL_OPTIONS), booked};
}

/** Aulas do CT com vaga nos próximos dias (a confirmação é pelo WhatsApp). */
export async function loadCenterTrialOptionsCore(
  db: Firestore, centerId: string, todayKey: string, now: Date,
): Promise<TrialOptions> {
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const snap = await ref.get();
  const center = snap.data() as Data | undefined;
  if (!snap.exists || !center || str(center["status"]) !== "active") {
    throw new HttpsError("not-found", "Centro de treinamento não encontrado.");
  }
  if (!parseShowcase(center["showcase"]).trial.enabled) {
    throw new HttpsError("failed-precondition", "Este centro não está agendando aula experimental.");
  }
  const toKey = addDaysToDateKey(todayKey, TRIAL_WINDOW_DAYS);
  const [classSnap, sessionSnap] = await Promise.all([
    ref.collection("classes").where("status", "==", "active").get(),
    ref.collection("sessions").where("date", ">=", todayKey).where("date", "<=", toKey).get(),
  ]);
  const classes = new Map(classSnap.docs
    .filter((d) => isListedCenterClass(d.data() as Data, todayKey))
    .map((d) => [d.id, d.data() as Data] as const));

  const options: TrialOption[] = [];
  for (const doc of sessionSnap.docs) {
    const s = doc.data() as Data;
    const cls = classes.get(str(s["classId"]));
    if (!cls || str(s["status"]) !== "scheduled") continue;
    const date = str(s["date"]);
    const startTime = str(s["startTime"]) || str(cls["startTime"]);
    if (classSessionStartAt(date, startTime).getTime() <= now.getTime()) continue;
    const roster = Array.isArray(cls["rosterStudentIds"]) ? cls["rosterStudentIds"].length : num(cls["seatsTaken"]);
    const makeups = Array.isArray(s["makeupStudentIds"]) ? s["makeupStudentIds"].length : 0;
    const spotsLeft = Math.max(0, num(cls["capacity"]) - roster - makeups);
    if (spotsLeft === 0) continue;
    const duration = num(s["durationMin"]) || num(cls["durationMin"]) || 60;
    options.push({
      sessionId: doc.id,
      classId: str(s["classId"]),
      className: str(s["className"]) || str(cls["name"]) || "Turma",
      level: str(cls["level"]),
      teacherName: str(s["coachName"]) || str(cls["coachName"]),
      place: str(s["locationName"]) || str(cls["locationName"]),
      date,
      startTime,
      endTime: addMinutes(startTime, duration),
      spotsLeft,
    });
  }
  return {booking: "contact", options: sortOptions(options).slice(0, MAX_TRIAL_OPTIONS), booked: null};
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
  if (kind === "center") return loadCenterTrialOptionsCore(db, id, todayKey, now);
  throw new HttpsError("invalid-argument", "Tipo inválido.");
});

export const bookArenaClassTrial = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  const now = new Date();
  return bookArenaTrialCore(getFirestore(), uid, str(data["sessionId"]), dayKeyFromEventDate(now), now);
});
