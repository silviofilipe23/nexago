/**
 * Aulas pelo lado do ALUNO (canvas "NexaGO Atleta — Treinos"): "Vou"/"Não vou", crédito de
 * reposição por aviso antecipado, escolher reposição (ou entrar na fila) e check-in na arena.
 *
 * As coleções de aula seguem fechadas à equipe (rules) — tudo passa por estas callables, que
 * conferem no servidor que o atleta está naquela aula (aluno ativo da turma naquele dia da semana,
 * ou encaixe com a conta dele) e nunca devolvem dado de outro aluno.
 *
 * Gravações na aula (`arenaClassSessions/{id}`):
 * - `rsvps.{studentId}` = {response, reason, message, athleteId, markedExcused, creditId, at};
 * - "Não vou" com a antecedência da arena (`makeupNoticeHours`, padrão 4h) marca `excused` na
 *   chamada e cria o crédito com o MESMO id que a chamada fechada criaria (`makeupCreditId`) — o
 *   fechamento não duplica;
 * - check-in (GPS no raio da arena ou QR da quadra — `arena-court-checkin-qr.ts`) grava `present`
 *   na chamada e `checkIns.{studentId}` com o método.
 * O professor vê tudo isso em `getMyClassSessionRoster`.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore, type Transaction} from "firebase-admin/firestore";
import {addDaysToDateKey, isoWeekdayOfDateKey} from "./arena-recurring-booking";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CREDITS,
  ARENA_CLASS_ENROLLMENTS,
  ARENA_CLASS_SESSIONS,
  CLASS_HORIZON_DAYS,
  CLASS_STUDENTS,
  CLASS_WAITLIST,
  makeupCreditId,
} from "./arena-class-constants";
import {classRulesRef, monthKeyOf, parseClassRules, studentAttendsWeekday} from "./arena-class-ledger";
import {classSessionStartAt, parseClassSession, requireUid, resolveStudentInput, str} from "./arena-class";
import {addExtraCore, removeExtraCore} from "./arena-class-makeup";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {parseCourtQrPayload, resolveCourtCheckinToken} from "./arena-court-checkin-qr";

export const RSVP_REASONS = ["work", "health", "travel", "other"] as const;
export type RsvpReason = typeof RSVP_REASONS[number];
export type RsvpResponse = "going" | "not_going";

/** Raio do check-in por localização (metros), contado do ponto da arena. */
export const CHECKIN_RADIUS_METERS = 100;
/** Imprecisão do GPS que ainda aceitamos a favor do aluno (metros). */
export const CHECKIN_MAX_ACCURACY_SLACK_METERS = 50;
/** O check-in abre esta quantidade de minutos antes da aula e vai até o fim dela. */
export const CHECKIN_OPENS_MINUTES_BEFORE = 60;
const MAX_MAKEUP_CLASSES = 20;
const MAX_MAKEUP_OPTIONS = 40;
const MESSAGE_MAX = 280;

// ---------------------------------------------------------------------------
// Lugar do atleta na aula
// ---------------------------------------------------------------------------

export interface ClassSeat {
  studentId: string;
  kind: "regular" | "extra";
  name: string;
  enrollmentId: string | null;
  /** Encaixe: reposição devolve o crédito ao sair. */
  extraKind: string | null;
}

type QueryReader = (q: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>;

/** Onde o atleta está nesta aula — aluno ativo da turma naquele dia da semana ou encaixe. */
export async function findClassSeat(
  db: Firestore,
  read: QueryReader,
  raw: Record<string, unknown>,
  uid: string,
): Promise<ClassSeat | null> {
  const session = parseClassSession(raw);
  for (const [studentId, extra] of Object.entries(session.extras)) {
    if (extra.athleteId === uid) {
      return {studentId, kind: "extra", name: extra.name, enrollmentId: null, extraKind: extra.kind};
    }
  }
  const weekday = isoWeekdayOfDateKey(session.date);
  const snap = await read(db.collection(ARENA_CLASSES).doc(session.classId)
    .collection(CLASS_STUDENTS).where("athleteId", "==", uid));
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data["status"] !== "active" || !studentAttendsWeekday(data, weekday)) continue;
    return {
      studentId: doc.id,
      kind: "regular",
      name: str(data["name"]) || "Aluno",
      enrollmentId: str(data["enrollmentId"]) || null,
      extraKind: null,
    };
  }
  return null;
}

function recordAt(raw: unknown, key: string): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>)[key];
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

export function sessionStartAt(raw: Record<string, unknown>): Date {
  const startAt = raw["startAt"];
  if (startAt instanceof Timestamp) return startAt.toDate();
  return classSessionStartAt(str(raw["date"]), str(raw["startTime"]));
}

export function sessionEndAt(raw: Record<string, unknown>): Date {
  const start = sessionStartAt(raw);
  const end = classSessionStartAt(str(raw["date"]), str(raw["endTime"]));
  return Number.isNaN(end.getTime()) || end <= start ? new Date(start.getTime() + 60 * 60 * 1000) : end;
}

// ---------------------------------------------------------------------------
// Vou / Não vou
// ---------------------------------------------------------------------------

export interface RespondInput {
  sessionId: string;
  uid: string;
  response: RsvpResponse;
  reason: RsvpReason | null;
  message: string | null;
  now: Date;
}

export type CreditOutcome =
  /** Crédito criado (ou já existia desta falta). */
  "granted" |
  /** Aviso em cima da hora: falta registrada para o professor, sem crédito. */
  "late" |
  /** Plano mensal já usou as reposições do mês. */
  "limit" |
  /** A arena não dá crédito por falta avisada. */
  "disabled" |
  /** Encaixe de reposição desfeito: o crédito voltou. */
  "returned" |
  null;

export interface RespondResult {
  response: RsvpResponse;
  credit: CreditOutcome;
  creditId: string | null;
  expiresOn: string | null;
  noticeHours: number;
}

/**
 * "Vou"/"Não vou" até a aula começar. Encaixe que diz "não vou" sai da aula (a reposição devolve o
 * crédito). Aluno da turma: "não vou" com antecedência vira falta avisada + crédito; voltar para
 * "vou" desfaz os dois, se o crédito ainda não foi usado.
 */
export async function respondClassSessionCore(db: Firestore, input: RespondInput): Promise<RespondResult> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(input.sessionId);
  const pre = await sessionRef.get();
  if (!pre.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const preRaw = pre.data() as Record<string, unknown>;
  const preSeat = await findClassSeat(db, (q) => q.get(), preRaw, input.uid);
  if (!preSeat) throw new HttpsError("permission-denied", "Você não está nesta aula.");
  const rules = parseClassRules((await classRulesRef(db, str(preRaw["arenaId"])).get()).data());

  if (preSeat.kind === "extra" && input.response === "not_going") {
    assertBeforeStart(preRaw, input.now);
    await removeExtraCore(db, input.sessionId, preSeat.studentId);
    return {
      response: "not_going",
      credit: preSeat.extraKind === "makeup" ? "returned" : null,
      creditId: null,
      expiresOn: null,
      noticeHours: rules.makeupNoticeHours,
    };
  }

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
    const raw = snap.data() as Record<string, unknown>;
    const session = parseClassSession(raw);
    if (session.status === "canceled") throw new HttpsError("failed-precondition", "Esta aula foi cancelada.");
    if (session.status === "completed") throw new HttpsError("failed-precondition", "A chamada desta aula já foi fechada.");
    assertBeforeStart(raw, input.now);
    const seat = await findClassSeat(db, (q) => tx.get(q), raw, input.uid);
    if (!seat) throw new HttpsError("permission-denied", "Você não está nesta aula.");

    const previous = recordAt(raw["rsvps"], seat.studentId);
    const base = {
      athleteId: input.uid,
      at: FieldValue.serverTimestamp(),
    };
    const result: RespondResult = {
      response: input.response, credit: null, creditId: null, expiresOn: null, noticeHours: rules.makeupNoticeHours,
    };

    if (input.response === "going") {
      const undo = await readUndoNotGoing(tx, db, input.sessionId, seat, previous);
      undo.apply(tx);
      tx.set(sessionRef, {
        rsvps: {[seat.studentId]: {...base, response: "going", reason: null, message: null, markedExcused: false, creditId: null}},
        ...(undo.clearExcused ? {attendance: {[seat.studentId]: FieldValue.delete()}} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return result;
    }

    // Não vou (aluno da turma).
    const hoursBefore = (sessionStartAt(raw).getTime() - input.now.getTime()) / 3_600_000;
    const onTime = hoursBefore >= rules.makeupNoticeHours;
    let markedExcused = previous?.["markedExcused"] === true;
    let creditId = str(previous?.["creditId"]) || null;
    if (!rules.excusedGeneratesCredit) {
      result.credit = "disabled";
    } else if (!onTime && !markedExcused) {
      result.credit = "late";
    } else {
      const grant = await readNoticeCredit(tx, db, {
        arenaId: session.arenaId, classId: session.classId, sessionId: input.sessionId, date: session.date,
        seat, athleteId: input.uid, validityDays: rules.makeupValidityDays,
      });
      result.credit = grant.outcome;
      if (grant.outcome === "granted") {
        creditId = grant.creditId;
        result.creditId = grant.creditId;
        result.expiresOn = grant.expiresOn;
      }
      grant.apply(tx);
    }
    // Avisou a tempo: falta avisada já na chamada (o professor vê; o fechamento não duplica o crédito).
    const writeExcused = onTime || markedExcused;
    markedExcused = writeExcused;
    tx.set(sessionRef, {
      rsvps: {[seat.studentId]: {
        ...base, response: "not_going", reason: input.reason, message: input.message, markedExcused, creditId,
      }},
      ...(writeExcused ? {attendance: {[seat.studentId]: {mark: "excused", name: seat.name}}} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return result;
  });
}

function assertBeforeStart(raw: Record<string, unknown>, now: Date): void {
  if (sessionStartAt(raw).getTime() <= now.getTime()) {
    throw new HttpsError("failed-precondition", "A aula já começou — fale com o professor.");
  }
}

/** Voltar atrás no "não vou": apaga o crédito (se não foi usado) e a falta avisada que ele gerou. */
async function readUndoNotGoing(
  tx: Transaction,
  db: Firestore,
  sessionId: string,
  seat: ClassSeat,
  previous: Record<string, unknown> | null,
): Promise<{clearExcused: boolean; apply: (tx: Transaction) => void}> {
  if (previous?.["response"] !== "not_going") return {clearExcused: false, apply: () => undefined};
  const creditRef = db.collection(ARENA_CLASS_CREDITS).doc(makeupCreditId(sessionId, seat.studentId));
  const credit = await tx.get(creditRef);
  const fromNotice = credit.exists && credit.data()?.["reason"] === "notice";
  if (fromNotice && credit.data()?.["status"] !== "available") {
    throw new HttpsError(
      "failed-precondition",
      "Você já usou o crédito de reposição desta aula. Desmarque a reposição antes de confirmar.",
    );
  }
  return {
    clearExcused: previous["markedExcused"] === true,
    apply: (t) => {
      if (fromNotice) t.delete(creditRef);
    },
  };
}

interface NoticeCreditContext {
  arenaId: string;
  classId: string;
  sessionId: string;
  date: string;
  seat: ClassSeat;
  athleteId: string;
  validityDays: number;
}

/** Crédito por aviso antecipado — mesmo id e mesmo limite mensal da falta justificada na chamada. */
async function readNoticeCredit(
  tx: Transaction,
  db: Firestore,
  ctx: NoticeCreditContext,
): Promise<{outcome: "granted" | "limit"; creditId: string; expiresOn: string; apply: (tx: Transaction) => void}> {
  const creditId = makeupCreditId(ctx.sessionId, ctx.seat.studentId);
  const creditRef = db.collection(ARENA_CLASS_CREDITS).doc(creditId);
  const existing = await tx.get(creditRef);
  if (existing.exists) {
    return {outcome: "granted", creditId, expiresOn: str(existing.data()?.["expiresOn"]), apply: () => undefined};
  }
  const month = monthKeyOf(ctx.date);
  const expiresOn = addDaysToDateKey(ctx.date, ctx.validityDays);
  if (ctx.seat.enrollmentId) {
    const enrollment = await tx.get(db.collection(ARENA_CLASS_ENROLLMENTS).doc(ctx.seat.enrollmentId));
    const plan = (enrollment.data()?.["plan"] ?? {}) as Record<string, unknown>;
    if (plan["kind"] === "monthly") {
      const limit = Number(plan["makeupsPerMonth"] ?? 0);
      const used = await tx.get(db.collection(ARENA_CLASS_CREDITS)
        .where("enrollmentId", "==", ctx.seat.enrollmentId)
        .where("month", "==", month));
      if (used.size >= limit) return {outcome: "limit", creditId, expiresOn, apply: () => undefined};
    }
  }
  return {
    outcome: "granted",
    creditId,
    expiresOn,
    apply: (t) => t.set(creditRef, {
      arenaId: ctx.arenaId,
      studentId: ctx.seat.studentId,
      athleteId: ctx.athleteId,
      name: ctx.seat.name,
      enrollmentId: ctx.seat.enrollmentId,
      classId: ctx.classId,
      reason: "notice",
      sourceSessionId: ctx.sessionId,
      sourceDate: ctx.date,
      month,
      status: "available",
      expiresOn,
      usedSessionId: null,
      createdAt: FieldValue.serverTimestamp(),
    }),
  };
}

export function parseRespondInput(data: Record<string, unknown>): Pick<RespondInput, "sessionId" | "response" | "reason" | "message"> {
  const sessionId = str(data["sessionId"]);
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const response = str(data["response"]);
  if (response !== "going" && response !== "not_going") throw new HttpsError("invalid-argument", "Resposta inválida.");
  const rawReason = str(data["reason"]);
  const reason = (RSVP_REASONS as readonly string[]).includes(rawReason) ? rawReason as RsvpReason : null;
  if (response === "not_going" && !reason) throw new HttpsError("invalid-argument", "Escolha o motivo.");
  const message = str(data["message"]).slice(0, MESSAGE_MAX) || null;
  return {sessionId, response, reason: response === "going" ? null : reason, message: response === "going" ? null : message};
}

export const respondArenaClassSession = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const parsed = parseRespondInput((request.data ?? {}) as Record<string, unknown>);
  return respondClassSessionCore(getFirestore(), {...parsed, uid, now: new Date()});
});

// ---------------------------------------------------------------------------
// Check-in por localização
// ---------------------------------------------------------------------------

/** Distância em metros entre dois pontos (haversine). */
export function distanceMeters(a: {lat: number; lng: number}, b: {lat: number; lng: number}): number {
  const R = 6_371_000;
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ponto da arena: `latitude`/`longitude` ou o GeoPoint `location` (perfil da arena). */
export function arenaPoint(arena: Record<string, unknown> | undefined): {lat: number; lng: number} | null {
  const lat = arena?.["latitude"];
  const lng = arena?.["longitude"];
  if (typeof lat === "number" && typeof lng === "number") return {lat, lng};
  const loc = arena?.["location"] as {latitude?: unknown; longitude?: unknown} | undefined;
  if (loc && typeof loc.latitude === "number" && typeof loc.longitude === "number") {
    return {lat: loc.latitude, lng: loc.longitude};
  }
  return null;
}

export interface CheckInInput {
  sessionId: string;
  uid: string;
  /** Localização (método `location`) — ignorada quando vem `qrToken`. */
  lat?: number;
  lng?: number;
  accuracy?: number | null;
  /** Token do QR da quadra (método `qr`), já sem o prefixo do payload. */
  qrToken?: string | null;
  now: Date;
}

export interface CheckInResult {
  mark: "present" | "absent" | "excused";
  method: "location" | "qr";
  /** Só no método `location`. */
  distanceMeters: number | null;
  /** Já tinha marca do professor: o check-in fica registrado, a marca não muda. */
  alreadyMarked: boolean;
}

/** Prova de que o aluno está na arena: QR de uma quadra da arena da aula, ou o GPS no raio. */
async function verifyCheckInProof(
  db: Firestore,
  arenaId: string,
  input: CheckInInput,
): Promise<{method: "location" | "qr"; record: Record<string, unknown>; distance: number | null}> {
  if (input.qrToken) {
    const court = await resolveCourtCheckinToken(db, input.qrToken);
    if (!court) {
      throw new HttpsError(
        "failed-precondition",
        "Este QR não vale mais. Peça à recepção o QR atual da quadra.",
        {reason: "qr_invalid"},
      );
    }
    if (court.arenaId !== arenaId) {
      throw new HttpsError("failed-precondition", "Este QR é de outra arena.", {reason: "qr_other_arena"});
    }
    return {method: "qr", record: {courtId: court.courtId, courtName: court.courtName}, distance: null};
  }
  const arena = await db.collection("arenas").doc(arenaId).get();
  const point = arenaPoint(arena.data());
  if (!point) {
    throw new HttpsError(
      "failed-precondition",
      "A arena ainda não tem a localização cadastrada. Peça ao professor para marcar sua presença.",
    );
  }
  const distance = Math.round(distanceMeters(point, {lat: input.lat ?? NaN, lng: input.lng ?? NaN}));
  const slack = Math.min(Math.max(input.accuracy ?? 0, 0), CHECKIN_MAX_ACCURACY_SLACK_METERS);
  if (!(distance - slack <= CHECKIN_RADIUS_METERS)) {
    throw new HttpsError(
      "failed-precondition",
      `Você está a ${formatDistance(distance)} da arena. O check-in abre a até ${CHECKIN_RADIUS_METERS} m.`,
      {reason: "too_far", distanceMeters: distance},
    );
  }
  return {method: "location", record: {distanceMeters: distance}, distance};
}

export async function checkInClassSessionCore(db: Firestore, input: CheckInInput): Promise<CheckInResult> {
  const sessionRef = db.collection(ARENA_CLASS_SESSIONS).doc(input.sessionId);
  const pre = await sessionRef.get();
  if (!pre.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const proof = await verifyCheckInProof(db, str(pre.data()?.["arenaId"]), input);

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
    const raw = snap.data() as Record<string, unknown>;
    const session = parseClassSession(raw);
    if (session.status === "canceled") throw new HttpsError("failed-precondition", "Esta aula foi cancelada.");
    if (session.status === "completed") throw new HttpsError("failed-precondition", "A chamada desta aula já foi fechada.");
    const opensAt = sessionStartAt(raw).getTime() - CHECKIN_OPENS_MINUTES_BEFORE * 60_000;
    if (input.now.getTime() < opensAt) {
      throw new HttpsError("failed-precondition", `O check-in abre ${CHECKIN_OPENS_MINUTES_BEFORE} min antes da aula.`);
    }
    if (input.now.getTime() > sessionEndAt(raw).getTime()) {
      throw new HttpsError("failed-precondition", "A aula já terminou.");
    }
    const seat = await findClassSeat(db, (q) => tx.get(q), raw, input.uid);
    if (!seat) throw new HttpsError("permission-denied", "Você não está nesta aula.");

    const previous = recordAt(raw["rsvps"], seat.studentId);
    const current = session.attendance[seat.studentId]?.mark ?? null;
    // Falta avisada pelo próprio aluno não segura o check-in: ele veio (o crédito sai, se não foi usado).
    const ownExcused = current === "excused" && previous?.["markedExcused"] === true;
    const undo = ownExcused ? await readUndoNotGoing(tx, db, input.sessionId, seat, previous) : null;
    const alreadyMarked = current != null && !ownExcused;
    undo?.apply(tx);
    tx.set(sessionRef, {
      checkIns: {[seat.studentId]: {
        at: FieldValue.serverTimestamp(), method: proof.method, ...proof.record, athleteId: input.uid,
      }},
      ...(alreadyMarked ? {} : {attendance: {[seat.studentId]: {mark: "present", name: seat.name}}}),
      rsvps: {[seat.studentId]: {
        response: "going", reason: null, message: null, markedExcused: false, creditId: null,
        athleteId: input.uid, at: FieldValue.serverTimestamp(),
      }},
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    const mark = (alreadyMarked ? current : "present") as CheckInResult["mark"];
    return {mark, method: proof.method, distanceMeters: proof.distance, alreadyMarked};
  });
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace(".", ",")} km` : `${meters} m`;
}

export const checkInArenaClassSession = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const input = parseCheckInInput((request.data ?? {}) as Record<string, unknown>);
  return checkInClassSessionCore(getFirestore(), {...input, uid, now: new Date()});
});

/** `method: "qr"` + `qr` (o texto lido) ou, por padrão, `lat`/`lng`/`accuracy`. */
export function parseCheckInInput(data: Record<string, unknown>): Omit<CheckInInput, "uid" | "now"> {
  const sessionId = str(data["sessionId"]);
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  if (data["method"] === "qr") {
    const qrToken = parseCourtQrPayload(str(data["qr"]));
    if (!qrToken) {
      throw new HttpsError("invalid-argument", "Este QR não é de check-in do nexaGO.", {reason: "qr_unknown"});
    }
    return {sessionId, qrToken};
  }
  const lat = data["lat"];
  const lng = data["lng"];
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError("invalid-argument", "Localização inválida.");
  }
  const accuracy = typeof data["accuracy"] === "number" ? data["accuracy"] : null;
  return {sessionId, lat, lng, accuracy};
}

// ---------------------------------------------------------------------------
// Créditos e reposição
// ---------------------------------------------------------------------------

export interface MyClassCredit {
  creditId: string;
  arenaId: string;
  arenaName: string;
  classId: string;
  className: string;
  level: string;
  sourceDate: string;
  expiresOn: string;
  reason: string;
}

/** Créditos de reposição disponíveis e dentro da validade, do que vence primeiro. */
export async function loadMyClassCredits(db: Firestore, uid: string, todayKey: string): Promise<MyClassCredit[]> {
  const snap = await db.collection(ARENA_CLASS_CREDITS)
    .where("athleteId", "==", uid).where("status", "==", "available").get();
  const live = snap.docs.filter((d) => str(d.data()["expiresOn"]) >= todayKey);
  const classIds = [...new Set(live.map((d) => str(d.data()["classId"])).filter(Boolean))];
  const arenaIds = [...new Set(live.map((d) => str(d.data()["arenaId"])).filter(Boolean))];
  const [classSnaps, arenaSnaps] = await Promise.all([
    classIds.length ? db.getAll(...classIds.map((id) => db.collection(ARENA_CLASSES).doc(id))) : Promise.resolve([]),
    arenaIds.length ? db.getAll(...arenaIds.map((id) => db.collection("arenas").doc(id))) : Promise.resolve([]),
  ]);
  const classes = new Map(classSnaps.map((s) => [s.id, (s.data() ?? {}) as Record<string, unknown>]));
  const arenas = new Map(arenaSnaps.map((s) => [s.id, (s.data() ?? {}) as Record<string, unknown>]));
  return live.map((d) => {
    const c = d.data() as Record<string, unknown>;
    const cls = classes.get(str(c["classId"])) ?? {};
    return {
      creditId: d.id,
      arenaId: str(c["arenaId"]),
      arenaName: str(arenas.get(str(c["arenaId"]))?.["name"]) || str(cls["arenaName"]) || "Arena",
      classId: str(c["classId"]),
      className: str(cls["name"]) || "Turma",
      level: str(cls["level"]),
      sourceDate: str(c["sourceDate"]),
      expiresOn: str(c["expiresOn"]),
      reason: str(c["reason"]),
    };
  }).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.creditId.localeCompare(b.creditId));
}

export const getMyClassCredits = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  return {items: await loadMyClassCredits(getFirestore(), uid, dayKeyFromEventDate(new Date()))};
});

/**
 * Turma que serve de reposição: turma (não particular) ativa da mesma arena, do mesmo nível — ou
 * de nível "livre" — e do mesmo esporte quando os dois têm.
 */
export function isMakeupEligibleClass(source: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (str(target["arenaId"]) !== str(source["arenaId"])) return false;
  if (str(target["status"]) !== "active") return false;
  if ((str(target["type"]) || "turma") !== "turma") return false;
  const level = str(source["level"]);
  const targetLevel = str(target["level"]);
  if (targetLevel !== "livre" && level && targetLevel !== level) return false;
  const sport = str(source["sport"]);
  const targetSport = str(target["sport"]);
  return !sport || !targetSport || sport === targetSport;
}

export interface MakeupOption {
  sessionId: string;
  classId: string;
  className: string;
  teacherName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  spotsLeft: number;
  full: boolean;
  /** Mesmo professor da turma de origem do crédito. */
  sameTeacher: boolean;
}

interface CreditContext {
  ref: FirebaseFirestore.DocumentReference;
  credit: Record<string, unknown>;
  source: Record<string, unknown>;
}

async function loadOwnCredit(db: Firestore, uid: string, creditId: string, todayKey: string): Promise<CreditContext> {
  if (!creditId) throw new HttpsError("invalid-argument", "Crédito inválido.");
  const ref = db.collection(ARENA_CLASS_CREDITS).doc(creditId);
  const snap = await ref.get();
  const credit = snap.data() as Record<string, unknown> | undefined;
  if (!snap.exists || !credit || credit["athleteId"] !== uid) throw new HttpsError("not-found", "Crédito não encontrado.");
  if (credit["status"] !== "available") throw new HttpsError("failed-precondition", "Este crédito já foi usado.");
  if (str(credit["expiresOn"]) < todayKey) throw new HttpsError("failed-precondition", "Este crédito venceu.");
  const sourceSnap = await db.collection(ARENA_CLASSES).doc(str(credit["classId"])).get();
  const source = {...(sourceSnap.data() ?? {}), arenaId: str(credit["arenaId"])} as Record<string, unknown>;
  return {ref, credit, source};
}

/** Aulas com vaga (ou lotadas, para a fila) onde o crédito pode ser usado, da mais cedo. */
export async function loadMakeupOptionsCore(
  db: Firestore,
  uid: string,
  creditId: string,
  todayKey: string,
  now: Date,
): Promise<{credit: {creditId: string; expiresOn: string; level: string; arenaId: string}; options: MakeupOption[]}> {
  const {credit, source} = await loadOwnCredit(db, uid, creditId, todayKey);
  const arenaId = str(credit["arenaId"]);
  const expiresOn = str(credit["expiresOn"]);
  const horizon = addDaysToDateKey(todayKey, CLASS_HORIZON_DAYS);
  const toKey = expiresOn < horizon ? expiresOn : horizon;

  const classesSnap = await db.collection(ARENA_CLASSES).where("arenaId", "==", arenaId).where("status", "==", "active").get();
  const classes = classesSnap.docs
    .filter((d) => isMakeupEligibleClass(source, d.data() as Record<string, unknown>))
    .slice(0, MAX_MAKEUP_CLASSES);

  const sourceTeacher = str(source["teacherUserId"]) || str(source["teacherId"]);
  const options: MakeupOption[] = [];
  await Promise.all(classes.map(async (clsDoc) => {
    const cls = clsDoc.data() as Record<string, unknown>;
    const [sessions, roster] = await Promise.all([
      db.collection(ARENA_CLASS_SESSIONS).where("arenaId", "==", arenaId).where("classId", "==", clsDoc.id)
        .where("date", ">=", todayKey).where("date", "<=", toKey).get(),
      clsDoc.ref.collection(CLASS_STUDENTS).where("status", "==", "active").get(),
    ]);
    const rosterData = roster.docs.map((d) => d.data() as Record<string, unknown>);
    for (const doc of sessions.docs) {
      const raw = doc.data() as Record<string, unknown>;
      const session = parseClassSession(raw);
      if (session.status !== "scheduled") continue;
      const startAt = sessionStartAt(raw);
      if (startAt.getTime() <= now.getTime()) continue;
      const weekday = isoWeekdayOfDateKey(session.date);
      const regulars = rosterData.filter((d) => studentAttendsWeekday(d, weekday));
      // Já está nesta aula (aluno do dia ou encaixe): não é opção.
      if (regulars.some((d) => d["athleteId"] === uid)) continue;
      if (Object.values(session.extras).some((e) => e.athleteId === uid)) continue;
      const capacity = Number(raw["capacity"] ?? cls["capacity"] ?? 0);
      const spotsLeft = Math.max(0, capacity - regulars.length - Object.keys(session.extras).length);
      const teacher = str(raw["teacherUserId"]) || str(cls["teacherUserId"]) || str(cls["teacherId"]);
      options.push({
        sessionId: doc.id,
        classId: clsDoc.id,
        className: str(raw["className"]) || str(cls["name"]) || "Turma",
        teacherName: str(raw["teacherName"]) || str(cls["teacherName"]),
        courtName: str(raw["courtName"]) || str(cls["courtName"]),
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        startAt: startAt.toISOString(),
        spotsLeft,
        full: spotsLeft === 0,
        sameTeacher: sourceTeacher !== "" && teacher === sourceTeacher,
      });
    }
  }));
  options.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) ||
    a.className.localeCompare(b.className, "pt-BR"));
  return {
    credit: {creditId, expiresOn, level: str(source["level"]), arenaId},
    options: options.slice(0, MAX_MAKEUP_OPTIONS),
  };
}

export const getMyClassMakeupOptions = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const creditId = str((request.data as Record<string, unknown> | null)?.["creditId"]);
  return loadMakeupOptionsCore(getFirestore(), uid, creditId, dayKeyFromEventDate(new Date()), new Date());
});

/** Encaixa o próprio aluno com o crédito — a mesma `addExtraCore` da equipe e do professor. */
export async function bookMakeupCore(
  db: Firestore,
  uid: string,
  creditId: string,
  sessionId: string,
  todayKey: string,
  now: Date,
): Promise<{sessionId: string; studentId: string}> {
  const {credit, source} = await loadOwnCredit(db, uid, creditId, todayKey);
  if (!sessionId) throw new HttpsError("invalid-argument", "Aula inválida.");
  const sessionSnap = await db.collection(ARENA_CLASS_SESSIONS).doc(sessionId).get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Aula não encontrada.");
  const raw = sessionSnap.data() as Record<string, unknown>;
  const target = await db.collection(ARENA_CLASSES).doc(str(raw["classId"])).get();
  if (!target.exists || !isMakeupEligibleClass(source, target.data() as Record<string, unknown>)) {
    throw new HttpsError("failed-precondition", "Esta turma não aceita a sua reposição.");
  }
  if (sessionStartAt(raw).getTime() <= now.getTime()) throw new HttpsError("failed-precondition", "Esta aula já começou.");
  if (await findClassSeat(db, (q) => q.get(), raw, uid)) {
    throw new HttpsError("already-exists", "Você já está nesta aula.");
  }
  const {studentId} = await addExtraCore(db, sessionId, {
    kind: "makeup",
    creditId,
    student: {athleteId: uid, name: str(credit["name"]) || "Aluno"},
  }, todayKey);
  return {sessionId, studentId};
}

export const bookArenaClassMakeup = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return bookMakeupCore(getFirestore(), uid, str(data["creditId"]), str(data["sessionId"]),
    dayKeyFromEventDate(new Date()), new Date());
});

/**
 * Turma lotada: o aluno entra na lista de espera da turma (a mesma que a equipe gerencia), marcada
 * como reposição. A oferta da vaga segue manual, pela arena.
 */
export async function joinMakeupWaitlistCore(
  db: Firestore,
  uid: string,
  creditId: string,
  classId: string,
  todayKey: string,
): Promise<{entryId: string; alreadyWaiting: boolean}> {
  const {credit, source} = await loadOwnCredit(db, uid, creditId, todayKey);
  if (!classId) throw new HttpsError("invalid-argument", "Turma inválida.");
  const classRef = db.collection(ARENA_CLASSES).doc(classId);
  const cls = await classRef.get();
  if (!cls.exists || !isMakeupEligibleClass(source, cls.data() as Record<string, unknown>)) {
    throw new HttpsError("failed-precondition", "Esta turma não aceita a sua reposição.");
  }
  const col = classRef.collection(CLASS_WAITLIST);
  const dup = await col.where("athleteId", "==", uid).where("status", "==", "waiting").get();
  if (!dup.empty) return {entryId: dup.docs[0]!.id, alreadyWaiting: true};
  const student = await resolveStudentInput(db, {athleteId: uid});
  const ref = col.doc();
  const expires = str(credit["expiresOn"]);
  await ref.set({
    arenaId: str(credit["arenaId"]), classId, athleteId: uid, name: student.name, phone: student.phone,
    note: `Reposição · crédito até ${expires.slice(8, 10)}/${expires.slice(5, 7)}`,
    purpose: "makeup", creditId, status: "waiting", addedByUid: uid, source: "athlete",
    createdAt: FieldValue.serverTimestamp(),
  });
  return {entryId: ref.id, alreadyWaiting: false};
}

export const joinArenaClassMakeupWaitlist = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  const data = (request.data ?? {}) as Record<string, unknown>;
  return joinMakeupWaitlistCore(getFirestore(), uid, str(data["creditId"]), str(data["classId"]),
    dayKeyFromEventDate(new Date()));
});
