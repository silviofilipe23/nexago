/**
 * Disponibilidade do professor para aulas particulares (canvas A10 / web "Disponibilidade").
 *
 * - `professorAvailability/{uid}`: grade semanal de horas abertas (`weekly["1".."7"]` = horas de
 *   início, 6–21, dia ISO), regras (duração, antecedência mínima, cancelamento sem custo) e chaves
 *   (aluno agenda direto, aceitar duplas, mostrar no perfil). Só a callable grava.
 * - `professorPrivateLessons/{id}`: pedido/agendamento de particular. O ALUNO do professor (mesma
 *   régua do chat: turma liberada ou carteira ativa) escolhe um horário livre; com "agenda direto"
 *   já entra confirmada, senão fica pendente até o professor aceitar. Só functions gravam.
 *
 * Horário livre = hora aberta na grade, depois da antecedência mínima, sem bater em turma do
 * professor, bloqueio da agenda, aula com reserva de quadra (`professorLessons`) ou outra
 * particular pendente/confirmada. O servidor calcula — o aluno não lê a agenda do professor.
 * Sem cobrança aqui: o professor cobra pelo plano/pacote/carteira que já usa.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {dayKeyFromEventDate, eventDateFromDayKeyAndTime, eventTimeLabel} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {PROFESSOR_BLOCKS} from "./professor-calendar";
import {PROFESSOR_LESSONS} from "./professor-lessons";
import {PROFESSOR_OWN_CLASSES} from "./professor-own-classes";
import {PROFESSORS} from "./professor-wallet-model";
import {isStudentOfProfessor} from "./professor-messages";

export const PROFESSOR_AVAILABILITY = "professorAvailability";
export const PROFESSOR_PRIVATE_LESSONS = "professorPrivateLessons";
export const PRIVATE_LESSON_PUSH_TYPE = "professor_private_lesson";
export const AVAILABILITY_FIRST_HOUR = 6;
export const AVAILABILITY_LAST_HOUR = 21;
export const AVAILABILITY_DURATIONS = [30, 60, 90, 120] as const;
const MAX_WINDOW_DAYS = 28;
const ACTIVE_STATUSES = ["pending", "confirmed"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (v == null || v === "") return fallback;
  if (!Number.isInteger(n) || n < min || n > max) invalid("Valor fora do permitido.");
  return n;
}

export interface Availability {
  weekly: Record<string, number[]>;
  durationMin: number;
  minNoticeHours: number;
  freeCancelHours: number;
  autoConfirm: boolean;
  acceptPairs: boolean;
  showOnProfile: boolean;
  published: boolean;
}

export function parseAvailability(raw: Record<string, unknown>): Availability {
  const weeklyRaw = (raw["weekly"] ?? {}) as Record<string, unknown>;
  const weekly: Record<string, number[]> = {};
  for (let d = 1; d <= 7; d++) {
    const list = weeklyRaw[String(d)];
    const hours = Array.isArray(list) ? list.map(Number) : [];
    if (hours.some((h) => !Number.isInteger(h) || h < AVAILABILITY_FIRST_HOUR || h > AVAILABILITY_LAST_HOUR)) {
      invalid(`Horas de ${AVAILABILITY_FIRST_HOUR}h a ${AVAILABILITY_LAST_HOUR}h.`);
    }
    weekly[String(d)] = [...new Set(hours)].sort((a, b) => a - b);
  }
  const durationMin = intIn(raw["durationMin"], 30, 120, 60);
  if (!(AVAILABILITY_DURATIONS as readonly number[]).includes(durationMin)) invalid("Duração de 30, 60, 90 ou 120 minutos.");
  return {
    weekly,
    durationMin,
    minNoticeHours: intIn(raw["minNoticeHours"], 0, 72, 4),
    freeCancelHours: intIn(raw["freeCancelHours"], 0, 72, 12),
    autoConfirm: raw["autoConfirm"] !== false,
    acceptPairs: raw["acceptPairs"] === true,
    showOnProfile: raw["showOnProfile"] !== false,
    published: raw["published"] !== false,
  };
}

/** Lê a disponibilidade gravada (sem validar de novo; doc só nasce pela callable). */
function storedAvailability(data: Record<string, unknown> | undefined): Availability | null {
  if (!data) return null;
  try {
    return parseAvailability(data);
  } catch {
    return null;
  }
}

export interface Interval {
  start: number;
  end: number;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Dias (`YYYY-MM-DD`, SP) da janela a partir de `from`. */
export function windowDays(from: Date, days: number): string[] {
  const out: string[] = [];
  const first = dayKeyFromEventDate(from);
  for (let i = 0; i < days; i++) {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const hhmm = (t: string): [number, number] => {
  const [h, m] = t.split(":").map(Number);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
};

/**
 * Horários livres (início/fim em ms) — pura: recebe as ocupações já carregadas.
 * Começa sempre na hora cheia; uma aula de 90 min às 9h exige 9h e 10h abertas.
 */
export function computeOpenSlots(
  availability: Availability,
  days: string[],
  busy: Interval[],
  nowMs: number,
): Interval[] {
  const out: Interval[] = [];
  const span = Math.ceil(availability.durationMin / 60);
  const earliest = nowMs + availability.minNoticeHours * 3600_000;
  for (const day of days) {
    const open = new Set(availability.weekly[String(isoWeekdayOfDateKey(day))] ?? []);
    for (const h of [...open].sort((a, b) => a - b)) {
      let ok = true;
      for (let k = 1; k < span; k++) if (!open.has(h + k)) ok = false;
      if (!ok) continue;
      const start = eventDateFromDayKeyAndTime(day, h, 0).getTime();
      const slot = {start, end: start + availability.durationMin * 60_000};
      if (start < earliest) continue;
      if (busy.some((b) => overlaps(slot, b))) continue;
      out.push(slot);
    }
  }
  return out;
}

/** Ocupações do professor na janela: turmas, bloqueios, aulas com quadra e particulares ativas. */
async function loadBusy(db: Firestore, uid: string, days: string[], tx?: Transaction): Promise<Interval[]> {
  if (!days.length) return [];
  const first = eventDateFromDayKeyAndTime(days[0], 0, 0);
  const last = eventDateFromDayKeyAndTime(days[days.length - 1], 23, 59);
  const lessonsQuery = db.collection(PROFESSOR_PRIVATE_LESSONS).where("professorUid", "==", uid)
    .where("startAt", ">=", Timestamp.fromDate(new Date(first.getTime() - 4 * 3600_000)))
    .where("startAt", "<=", Timestamp.fromDate(last));
  const [classes, ownClasses, blocks, courtLessons, privates] = await Promise.all([
    db.collection("arenaClasses").where("teacherUserId", "==", uid).get(),
    db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_OWN_CLASSES).where("status", "==", "active").get(),
    db.collection("users").doc(uid).collection(PROFESSOR_BLOCKS).where("endAt", ">", Timestamp.fromDate(first)).get(),
    db.collection(PROFESSOR_LESSONS).where("professorUid", "==", uid).get(),
    tx ? tx.get(lessonsQuery) : lessonsQuery.get(),
  ]);
  const busy: Interval[] = [];
  const daySet = new Set(days);
  // Turmas da arena e turmas próprias (B10) ocupam o horário do mesmo jeito.
  for (const c of [...classes.docs, ...ownClasses.docs]) {
    const cls = c.data();
    if (str(cls["status"]) === "archived") continue;
    const weekdays = Array.isArray(cls["weekdays"]) ? (cls["weekdays"] as unknown[]).map(Number) : [];
    const [sh, sm] = hhmm(str(cls["startTime"]));
    const [eh, em] = hhmm(str(cls["endTime"]) || str(cls["startTime"]));
    for (const day of days) {
      if (!weekdays.includes(isoWeekdayOfDateKey(day))) continue;
      const start = eventDateFromDayKeyAndTime(day, sh, sm).getTime();
      const end = Math.max(eventDateFromDayKeyAndTime(day, eh, em).getTime(), start + 3600_000);
      busy.push({start, end});
    }
  }
  for (const b of blocks.docs) {
    const s = b.data()["startAt"];
    const e = b.data()["endAt"];
    if (s instanceof Timestamp && e instanceof Timestamp) busy.push({start: s.toMillis(), end: e.toMillis()});
  }
  const courtInWindow = courtLessons.docs.filter((d) => daySet.has(str(d.data()["date"])));
  const bookings = await Promise.all(courtInWindow.map((d) => db.collection("arenaBookings").doc(d.id).get()));
  courtInWindow.forEach((d, i) => {
    const status = str(bookings[i].data()?.["status"]);
    if (!bookings[i].exists || status.startsWith("cancel")) return;
    const l = d.data();
    const [sh, sm] = hhmm(str(l["startTime"]));
    const [eh, em] = hhmm(str(l["endTime"]) || str(l["startTime"]));
    const start = eventDateFromDayKeyAndTime(str(l["date"]), sh, sm).getTime();
    busy.push({start, end: Math.max(eventDateFromDayKeyAndTime(str(l["date"]), eh, em).getTime(), start + 1800_000)});
  });
  for (const p of privates.docs) {
    const l = p.data();
    if (!ACTIVE_STATUSES.includes(str(l["status"]))) continue;
    const s = l["startAt"];
    const e = l["endAt"];
    if (s instanceof Timestamp && e instanceof Timestamp) busy.push({start: s.toMillis(), end: e.toMillis()});
  }
  return busy;
}

async function userName(db: Firestore, uid: string, fallback: string): Promise<string> {
  const u = (await db.collection("users").doc(uid).get()).data();
  return str(u?.["fullName"]) || str(u?.["nickname"]) || fallback;
}

function cleanUid(v: unknown, message: string): string {
  const id = str(v);
  if (!id || id.includes("/")) invalid(message);
  return id;
}

export interface AvailabilityDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: AvailabilityDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

async function safeNotify(deps: AvailabilityDeps, input: Parameters<AvailabilityDeps["notify"]>[0]): Promise<void> {
  try {
    await deps.notify(input);
  } catch (e) {
    logger.warn(`particular: push para ${input.userId} falhou`, e);
  }
}

const whenLabel = (d: Date) => {
  const day = dayKeyFromEventDate(d);
  return `${day.slice(8, 10)}/${day.slice(5, 7)} às ${eventTimeLabel(d)}`;
};

// ---------------------------------------------------------------------------

export async function saveProfessorAvailabilityCore(db: Firestore, uid: string, raw: Record<string, unknown>): Promise<Availability> {
  const availability = parseAvailability(raw);
  const professor = (await db.collection("users").doc(uid).get()).data();
  const roles = Array.isArray(professor?.["roles"]) ? (professor!["roles"] as unknown[]).map(String) : [];
  if (!roles.includes("professor") && str(professor?.["role"]) !== "professor") {
    throw new HttpsError("permission-denied", "Só professores publicam horários.");
  }
  await db.collection(PROFESSOR_AVAILABILITY).doc(uid).set({...availability, professorUid: uid, updatedAt: FieldValue.serverTimestamp()});
  return availability;
}

/** Horários livres de um professor, para o aluno dele (ou o próprio professor). */
export async function getProfessorOpenSlotsCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, now: Date,
): Promise<{durationMin: number; acceptPairs: boolean; autoConfirm: boolean; freeCancelHours: number; slots: Array<{startAt: string; endAt: string}>}> {
  const professorUid = cleanUid(raw["professorUid"], "Professor inválido.");
  if (uid !== professorUid && !(await isStudentOfProfessor(db, professorUid, uid, now))) {
    throw new HttpsError("permission-denied", "Só alunos deste professor veem os horários.");
  }
  const availability = storedAvailability((await db.collection(PROFESSOR_AVAILABILITY).doc(professorUid).get()).data());
  if (!availability || !availability.published) {
    return {durationMin: 60, acceptPairs: false, autoConfirm: false, freeCancelHours: 0, slots: []};
  }
  const days = windowDays(now, intIn(raw["days"], 1, MAX_WINDOW_DAYS, 14));
  const busy = await loadBusy(db, professorUid, days);
  const slots = computeOpenSlots(availability, days, busy, now.getTime());
  return {
    durationMin: availability.durationMin,
    acceptPairs: availability.acceptPairs,
    autoConfirm: availability.autoConfirm,
    freeCancelHours: availability.freeCancelHours,
    slots: slots.map((s) => ({startAt: new Date(s.start).toISOString(), endAt: new Date(s.end).toISOString()})),
  };
}

export async function requestPrivateLessonCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: AvailabilityDeps = defaultDeps,
): Promise<{lessonId: string; status: "pending" | "confirmed"}> {
  const now = deps.now();
  const professorUid = cleanUid(raw["professorUid"], "Professor inválido.");
  if (professorUid === uid) invalid("Você não pode agendar com você mesmo.");
  const startAt = new Date(str(raw["startAt"]));
  if (Number.isNaN(startAt.getTime())) invalid("Horário inválido.");
  const note = str(raw["note"]).slice(0, 300);
  if (!(await isStudentOfProfessor(db, professorUid, uid, now))) {
    throw new HttpsError("permission-denied", "Só alunos deste professor agendam particular.");
  }
  const availability = storedAvailability((await db.collection(PROFESSOR_AVAILABILITY).doc(professorUid).get()).data());
  if (!availability || !availability.published) throw new HttpsError("failed-precondition", "Este professor não abriu horários para particular.");
  const pair = raw["pair"] === true;
  if (pair && !availability.acceptPairs) invalid("Este professor não aceita particular em dupla.");
  const day = dayKeyFromEventDate(startAt);
  const [professorName, athleteName] = await Promise.all([userName(db, professorUid, "Professor"), userName(db, uid, "Aluno")]);
  const ref = db.collection(PROFESSOR_PRIVATE_LESSONS).doc();
  const status: "pending" | "confirmed" = availability.autoConfirm ? "confirmed" : "pending";
  await db.runTransaction(async (tx) => {
    // A checagem de choque roda dentro da transação: dois pedidos no mesmo horário não passam juntos.
    const busy = await loadBusy(db, professorUid, [day], tx);
    const open = computeOpenSlots(availability, [day], busy, now.getTime());
    const slot = open.find((s) => s.start === startAt.getTime());
    if (!slot) throw new HttpsError("failed-precondition", "Este horário não está mais livre. Escolha outro.");
    tx.create(ref, {
      professorUid, professorName, athleteId: uid, athleteName,
      startAt: Timestamp.fromDate(new Date(slot.start)),
      endAt: Timestamp.fromDate(new Date(slot.end)),
      date: day,
      durationMin: availability.durationMin,
      pair, note, status,
      createdAt: FieldValue.serverTimestamp(),
      ...(status === "confirmed" ? {respondedAt: Timestamp.fromDate(now)} : {}),
    });
  });
  await safeNotify(deps, {
    userId: professorUid,
    title: status === "confirmed" ? `Particular agendada · ${athleteName}` : `Pedido de particular · ${athleteName}`,
    body: `${whenLabel(startAt)}${pair ? " · em dupla" : ""}${status === "pending" ? ". Toque para responder." : ""}`,
    type: PRIVATE_LESSON_PUSH_TYPE,
    data: {lessonId: ref.id, url: "/professor/mais/disponibilidade"},
  });
  return {lessonId: ref.id, status};
}

/** Professor aceita ou recusa um pedido pendente. */
export async function respondPrivateLessonCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: AvailabilityDeps = defaultDeps,
): Promise<{status: "confirmed" | "declined"}> {
  const lessonId = cleanUid(raw["lessonId"], "Aula inválida.");
  const accept = raw["accept"] === true;
  const now = deps.now();
  const ref = db.collection(PROFESSOR_PRIVATE_LESSONS).doc(lessonId);
  const lesson = await db.runTransaction(async (tx) => {
    const l = (await tx.get(ref)).data();
    if (!l || l["professorUid"] !== uid) throw new HttpsError("not-found", "Pedido não encontrado.");
    if (l["status"] !== "pending") throw new HttpsError("failed-precondition", "Este pedido já foi respondido.");
    if (accept && (l["startAt"] as Timestamp).toMillis() <= now.getTime()) throw new HttpsError("failed-precondition", "O horário já passou.");
    tx.update(ref, {status: accept ? "confirmed" : "declined", respondedAt: Timestamp.fromDate(now)});
    return l;
  });
  const when = whenLabel((lesson["startAt"] as Timestamp).toDate());
  await safeNotify(deps, {
    userId: str(lesson["athleteId"]),
    title: accept ? "Particular confirmada" : "Particular recusada",
    body: `${str(lesson["professorName"])} · ${when}`,
    type: PRIVATE_LESSON_PUSH_TYPE,
    data: {lessonId, url: "/particulares"},
  });
  return {status: accept ? "confirmed" : "declined"};
}

/** Qualquer lado cancela antes do início. Aluno dentro do prazo sem custo → `lateCancel`. */
export async function cancelPrivateLessonCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: AvailabilityDeps = defaultDeps,
): Promise<{lateCancel: boolean}> {
  const lessonId = cleanUid(raw["lessonId"], "Aula inválida.");
  const reason = str(raw["reason"]).slice(0, 200);
  const now = deps.now();
  const ref = db.collection(PROFESSOR_PRIVATE_LESSONS).doc(lessonId);
  const result = await db.runTransaction(async (tx) => {
    const l = (await tx.get(ref)).data();
    if (!l || (l["professorUid"] !== uid && l["athleteId"] !== uid)) throw new HttpsError("not-found", "Aula não encontrada.");
    if (!ACTIVE_STATUSES.includes(str(l["status"]))) throw new HttpsError("failed-precondition", "Esta aula não está ativa.");
    const start = (l["startAt"] as Timestamp).toMillis();
    if (start <= now.getTime()) throw new HttpsError("failed-precondition", "A aula já começou.");
    const byAthlete = l["athleteId"] === uid;
    let lateCancel = false;
    if (byAthlete && l["status"] === "confirmed") {
      const avail = storedAvailability((await tx.get(db.collection(PROFESSOR_AVAILABILITY).doc(str(l["professorUid"])))).data());
      lateCancel = start - now.getTime() < (avail?.freeCancelHours ?? 0) * 3600_000;
    }
    tx.update(ref, {
      status: "canceled", canceledBy: byAthlete ? "athlete" : "professor", cancelReason: reason, lateCancel,
      canceledAt: Timestamp.fromDate(now),
    });
    return {l, byAthlete, lateCancel};
  });
  const {l, byAthlete, lateCancel} = result;
  const when = whenLabel((l["startAt"] as Timestamp).toDate());
  await safeNotify(deps, {
    userId: byAthlete ? str(l["professorUid"]) : str(l["athleteId"]),
    title: "Particular cancelada",
    body: byAthlete ?
      `${str(l["athleteName"])} cancelou ${when}${lateCancel ? " (fora do prazo sem custo)" : ""}.` :
      `${str(l["professorName"])} cancelou ${when}${reason ? `: ${reason}` : "."}`,
    type: PRIVATE_LESSON_PUSH_TYPE,
    data: {lessonId, url: byAthlete ? "/professor/mais/disponibilidade" : "/particulares"},
  });
  return {lateCancel};
}

// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;
const PUSH_OPTS = {region: CLIENT_FACING_REGIONS, timeoutSeconds: 60, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]};

export const saveProfessorAvailability = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  saveProfessorAvailabilityCore(getFirestore(), requireUid(r), dataOf(r)));

export const getProfessorOpenSlots = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) =>
  getProfessorOpenSlotsCore(getFirestore(), requireUid(r), dataOf(r), new Date()));

export const requestPrivateLesson = onCall(PUSH_OPTS, async (r) =>
  requestPrivateLessonCore(getFirestore(), requireUid(r), dataOf(r)));

export const respondPrivateLesson = onCall(PUSH_OPTS, async (r) =>
  respondPrivateLessonCore(getFirestore(), requireUid(r), dataOf(r)));

export const cancelPrivateLesson = onCall(PUSH_OPTS, async (r) =>
  cancelPrivateLessonCore(getFirestore(), requireUid(r), dataOf(r)));
