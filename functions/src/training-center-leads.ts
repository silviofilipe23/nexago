/**
 * Captação do CT (canvas C1–C10): a aula experimental de quem ainda não é aluno.
 *
 * - A recepção agenda a experimental do interessado (C2): o pedido nasce `confirmed` em
 *   `trialBookings/{sessionId}_l_{leadId}` com o mesmo formato do pedido do app, e o espelho vai
 *   para `sessions/{id}.trials.l_{leadId}` — o professor e a chamada já sabem mostrar.
 * - O professor avalia (C8): veio/não veio, nível, turma indicada e um recado para a recepção.
 *   Vai para o pedido e para o interessado, que passa a "Fez experimental" com a proposta.
 * - A página pública do CT (C9/C10) agenda SEM conta: o interessado é achado pelo telefone (ou
 *   criado), e o desmarque usa um token devolvido só a quem agendou.
 *
 * Os limites vêm de `settings/leads` (Configurações › Captação): experimentais por pessoa (pelo
 * telefone), por aula e só em turma com vaga.
 */
import {randomBytes, timingSafeEqual} from "node:crypto";
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, Timestamp, getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {addDaysToDateKey} from "./arena-recurring-booking";
import {classSessionStartAt, requireUid, str} from "./arena-class";
import {isListedCenterClass} from "./class-directory";
import {parseShowcase} from "./class-showcase";
import {
  canHandleCenterTrials,
  centerOption,
  centerSpotsLeft,
  centerTrialRef,
  isActiveTrial,
  loadActiveCenter,
  requireTrialStaff,
  sessionTrialMirror,
  trialStartAt,
  type TrialBookingStatus,
} from "./class-trial-booking";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {defaultNotifyDeps, type NotifyDeps} from "./training-center-notify";
import {
  LEVEL_LABELS,
  appendHistory,
  dateBr,
  historyEntry,
  isValidBrPhone,
  leadSettingsRef,
  leadTrialKey,
  leadTrialSnapshot,
  leadsRef,
  loadLeadSettings,
  parseLeadSettings,
  phoneDigits,
  syncLeadTrialStatus,
  type LeadSettings,
  type TrialAttendance,
  type TrialLevel,
} from "./training-center-leads-model";

type Data = Record<string, unknown>;

const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];
export const CENTER_LEAD_TYPE = "training_center_lead";
/** Janela da página pública (dias a partir de hoje). */
export const PUBLIC_TRIAL_WINDOW_DAYS = 14;
const MAX_PUBLIC_SLOTS = 80;
const NOTE_MAX = 500;
const EXPERIENCES = ["never", "plays", "competes"];
const LEVELS: TrialLevel[] = ["beginner", "intermediate", "advanced"];

function centerRef(db: Firestore, centerId: string) {
  return db.doc(`${TRAINING_CENTERS}/${centerId}`);
}

function validId(id: string, what: string): string {
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", `${what} inválido.`);
  return id;
}

/** Chave da pessoa no espelho da aula: a conta (pedido do app) ou o interessado. */
export function trialMirrorKey(b: Data): string {
  return str(b["athleteId"]) || leadTrialKey(str(b["leadId"]));
}

export function leadBookingId(sessionId: string, leadId: string): string {
  return `${sessionId}_l_${leadId}`;
}

/** Quem atende interessado: gestão, recepção e quem tem "Matricular alunos". */
export async function frontDeskUids(db: Firestore, centerId: string): Promise<string[]> {
  const snap = await centerRef(db, centerId).collection("centerMembers").where("status", "==", "active").get();
  return snap.docs.filter((d) => canHandleCenterTrials(d.data())).map((d) => str(d.data()["uid"]) || d.id);
}

/** Por que a aula não recebe mais experimental, ou null. */
export function trialSlotBlock(cls: Data, session: Data, taken: number, cfg: LeadSettings): string | null {
  if (taken >= cfg.maxTrialsPerSession) return "Esta aula já está com o máximo de experimentais.";
  if (cfg.onlyWithSpots && centerSpotsLeft(cls, session, taken) === 0) return "A turma está sem vaga nesta aula.";
  return null;
}

function experienceLabel(e: string): string {
  return e === "never" ? "Nunca jogou" : e === "plays" ? "Já joga" : e === "competes" ? "Compete" : "";
}

/** Espelho do interessado na aula: o professor vê nome, experiência declarada e objetivo. */
function leadMirror(bookingId: string, b: Data, status: TrialBookingStatus): Data {
  return {
    ...sessionTrialMirror(bookingId, b, status),
    leadId: str(b["leadId"]) || null,
    experience: experienceLabel(str(b["experience"])),
    goal: str(b["goal"]),
  };
}

async function notifyMany(deps: NotifyDeps, uids: string[], push: {title: string; body: string; type: string; data: Record<string, string>}) {
  await Promise.all([...new Set(uids)].filter(Boolean).map((userId) => deps.notify({userId, ...push})
    .catch((e) => logger.warn("aviso da captação falhou", {to: userId, e}))));
}

// ── C2 · a recepção agenda a experimental do interessado ─────────────────

export async function scheduleLeadTrialCore(
  db: Firestore, deps: NotifyDeps, uid: string, raw: Data,
): Promise<{bookingId: string}> {
  const centerId = validId(str(raw["centerId"]), "Centro");
  const leadId = validId(str(raw["leadId"]), "Interessado");
  const sessionId = validId(str(raw["sessionId"]), "Aula");
  const staff = await requireTrialStaff(db, uid, centerId);
  const center = await loadActiveCenter(db, centerId);
  const {settings: cfg} = await loadLeadSettings(db, centerId);
  const now = deps.now();
  const todayKey = dayKeyFromEventDate(now);
  const ref = centerRef(db, centerId);
  const leadRef = leadsRef(db, centerId).doc(leadId);
  const sessionRef = ref.collection("sessions").doc(sessionId);
  const bookingRef = centerTrialRef(db, centerId).doc(leadBookingId(sessionId, leadId));

  const booking = await db.runTransaction(async (tx) => {
    const [leadSnap, sSnap] = await Promise.all([tx.get(leadRef), tx.get(sessionRef)]);
    const lead = leadSnap.data() as Data | undefined;
    if (!leadSnap.exists || !lead) throw new HttpsError("not-found", "Interessado não encontrado.");
    const s = sSnap.data() as Data | undefined;
    if (!sSnap.exists || !s) throw new HttpsError("not-found", "Aula não encontrada.");
    if (str(s["status"]) !== "scheduled") throw new HttpsError("failed-precondition", "Esta aula não está mais na agenda.");
    const clsSnap = await tx.get(ref.collection("classes").doc(str(s["classId"])));
    const cls = clsSnap.data() as Data | undefined;
    if (!clsSnap.exists || !cls || str(cls["status"]) !== "active") {
      throw new HttpsError("failed-precondition", "Esta turma não está ativa.");
    }
    const option = centerOption(sessionId, s, cls, 0);
    if (classSessionStartAt(option.date, option.startTime).getTime() <= now.getTime()) {
      throw new HttpsError("failed-precondition", "Esta aula já começou.");
    }
    const trialSnap = await tx.get(centerTrialRef(db, centerId).where("date", ">=", todayKey));
    const active = trialSnap.docs.map((d) => ({id: d.id, data: d.data() as Data})).filter((t) => isActiveTrial(t.data));
    const mine = active.find((t) => str(t.data["leadId"]) === leadId && trialStartAt(t.data).getTime() > now.getTime());
    if (mine) {
      throw new HttpsError("already-exists",
        `Já tem experimental marcada para ${dateBr(str(mine.data["date"]))} ${str(mine.data["startTime"])}. Desmarque antes de agendar outra.`);
    }
    const block = trialSlotBlock(cls, s, active.filter((t) => str(t.data["sessionId"]) === sessionId).length, cfg);
    if (block) throw new HttpsError("failed-precondition", block);
    const count = Number(lead["trialsCount"] ?? 0);
    if (cfg.maxTrialsPerPerson > 0 && count >= cfg.maxTrialsPerPerson) {
      throw new HttpsError("failed-precondition",
        `Limite de ${cfg.maxTrialsPerPerson} experimental por pessoa atingido (Configurações › Captação).`);
    }
    const interest = (lead["interest"] ?? {}) as Data;
    const doc = {
      centerId, centerName: str(center["name"]) || "Centro de treinamento", sessionId, classId: option.classId,
      className: option.className, level: option.level, coachName: option.teacherName,
      coachUid: str(s["coachUid"]) || str(cls["coachUid"]) || null,
      locationName: option.place, date: option.date, startTime: option.startTime, endTime: option.endTime,
      athleteId: str(lead["athleteId"]), leadId, name: str(lead["name"]) || "Interessado", phone: str(lead["phone"]) || null,
      photoUrl: null, experience: str(interest["experience"]), goal: str(interest["goal"]),
      priceReais: parseShowcase(center["showcase"]).trial.priceReais,
      status: "confirmed" as TrialBookingStatus, source: "staff", note: null,
      decidedAt: FieldValue.serverTimestamp(), decidedByUid: uid, decidedByName: staff.name,
      attendance: null, coachFeedback: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(bookingRef, doc);
    tx.set(sessionRef, {trials: {[trialMirrorKey(doc)]: leadMirror(bookingRef.id, doc, "confirmed")}}, {merge: true});
    tx.update(leadRef, {
      ...(str(lead["stage"]) === "won" ? {} : {stage: "scheduled", lostReason: null}),
      trial: leadTrialSnapshot(bookingRef.id, doc, "confirmed"),
      trialsCount: count + 1,
      ...(lead["firstContactAt"] ? {} : {firstContactAt: Timestamp.fromDate(now)}),
      history: appendHistory(lead, historyEntry(staff.name, "trial",
        `Agendou experimental · ${option.className} · ${dateBr(option.date)} ${option.startTime}`, now)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return doc;
  });

  if (booking.coachUid) {
    await notifyMany(deps, [booking.coachUid], {
      title: "Aula experimental na sua turma",
      body: `${booking.name} · ${booking.className} · ${dateBr(booking.date)} ${booking.startTime}`,
      type: CENTER_LEAD_TYPE,
      data: {centerId, sessionId, url: `/athlete/professor/centros/${centerId}/aula/${sessionId}`},
    });
  }
  return {bookingId: bookingRef.id};
}

/** A equipe desmarca a experimental (antes da aula). */
export async function cancelLeadTrialCore(db: Firestore, uid: string, raw: Data, now: Date): Promise<{bookingId: string}> {
  const centerId = validId(str(raw["centerId"]), "Centro");
  const bookingId = validId(str(raw["bookingId"]), "Pedido");
  const staff = await requireTrialStaff(db, uid, centerId);
  await cancelBooking(db, centerId, bookingId, staff.name, "Desmarcou a experimental", now, () => undefined);
  return {bookingId};
}

async function cancelBooking(
  db: Firestore, centerId: string, bookingId: string, byName: string, text: string, now: Date,
  check: (b: Data) => void,
): Promise<Data> {
  const ref = centerTrialRef(db, centerId).doc(bookingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const b = snap.data() as Data | undefined;
    if (!snap.exists || !b) throw new HttpsError("not-found", "Experimental não encontrada.");
    check(b);
    if (!isActiveTrial(b)) throw new HttpsError("failed-precondition", "Esta experimental já foi encerrada.");
    if (trialStartAt(b).getTime() <= now.getTime()) throw new HttpsError("failed-precondition", "Esta aula já começou.");
    const sessionRef = centerRef(db, centerId).collection("sessions").doc(str(b["sessionId"]));
    const session = await tx.get(sessionRef);
    const syncLead = await syncLeadTrialStatus(tx, db, centerId, b, bookingId, "canceled", byName, text, now);
    tx.update(ref, {status: "canceled", canceledByName: byName, updatedAt: FieldValue.serverTimestamp()});
    if (session.exists) tx.set(sessionRef, {trials: {[trialMirrorKey(b)]: FieldValue.delete()}}, {merge: true});
    syncLead();
    return b;
  });
}

// ── C8 · o professor avalia a experimental ───────────────────────────────

export async function evaluateTrialCore(
  db: Firestore, deps: NotifyDeps, uid: string, raw: Data,
): Promise<{bookingId: string}> {
  const centerId = validId(str(raw["centerId"]), "Centro");
  const bookingId = validId(str(raw["bookingId"]), "Experimental");
  if (typeof raw["attended"] !== "boolean") throw new HttpsError("invalid-argument", "Diga se a pessoa veio.");
  const attended = raw["attended"] === true;
  const level = str(raw["level"]) as TrialLevel | "";
  if (level && !LEVELS.includes(level)) throw new HttpsError("invalid-argument", "Nível inválido.");
  const note = str(raw["note"]).slice(0, NOTE_MAX);
  const suggestedClassId = str(raw["classId"]);
  if (suggestedClassId.includes("/")) throw new HttpsError("invalid-argument", "Turma inválida.");
  const now = deps.now();
  const ref = centerRef(db, centerId);
  const member = (await ref.collection("centerMembers").doc(uid).get()).data();
  if (!member || member["status"] !== "active") throw new HttpsError("permission-denied", "Você não faz parte da equipe deste centro.");
  const byName = str(member["displayName"]) || "Professor";
  const {settings: cfg} = await loadLeadSettings(db, centerId);
  const bookingRef = centerTrialRef(db, centerId).doc(bookingId);

  const result = await db.runTransaction(async (tx) => {
    const bSnap = await tx.get(bookingRef);
    const b = bSnap.data() as Data | undefined;
    if (!bSnap.exists || !b) throw new HttpsError("not-found", "Experimental não encontrada.");
    const sessionRef = ref.collection("sessions").doc(str(b["sessionId"]));
    const sSnap = await tx.get(sessionRef);
    const s = (sSnap.data() ?? {}) as Data;
    const coachUid = str(s["coachUid"]) || str(b["coachUid"]);
    if (!canHandleCenterTrials(member) && coachUid !== uid) {
      throw new HttpsError("permission-denied", "Só o professor da aula ou a recepção avaliam esta experimental.");
    }
    const status = str(b["status"]);
    if (status !== "confirmed" && status !== "pending") throw new HttpsError("failed-precondition", "Esta experimental foi desmarcada.");
    if (trialStartAt(b).getTime() > now.getTime()) throw new HttpsError("failed-precondition", "A avaliação abre quando a aula começa.");
    let className = "";
    if (suggestedClassId) {
      const cSnap = await tx.get(ref.collection("classes").doc(suggestedClassId));
      if (!cSnap.exists) throw new HttpsError("not-found", "Turma indicada não encontrada.");
      className = str(cSnap.data()?.["name"]) || "Turma";
    }
    const leadId = str(b["leadId"]);
    const leadRef = leadId ? leadsRef(db, centerId).doc(leadId) : null;
    const leadSnap = leadRef ? await tx.get(leadRef) : null;

    const attendance: TrialAttendance = attended ? "attended" : "no_show";
    const feedback = attended ? {
      level, classId: suggestedClassId, className, note, byUid: uid, byName, at: Timestamp.fromDate(now),
    } : null;
    tx.update(bookingRef, {attendance, coachFeedback: feedback, evaluatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    const key = trialMirrorKey(b);
    const mirror = ((s["trials"] ?? {}) as Data)[key];
    if (sSnap.exists && mirror && typeof mirror === "object") {
      tx.set(sessionRef, {trials: {[key]: {attendance, evaluated: true}}}, {merge: true});
    }
    if (leadRef && leadSnap?.exists) {
      const lead = leadSnap.data() as Data;
      const won = str(lead["stage"]) === "won";
      const text = attended ?
        `Avaliou a experimental${level ? ` · ${LEVEL_LABELS[level]}` : ""}${className ? ` · indicou ${className}` : ""}` :
        "Não veio na experimental";
      const offer = attended && cfg.offerDays > 0 && !won ? addDaysToDateKey(dayKeyFromEventDate(now), cfg.offerDays) : null;
      tx.update(leadRef, {
        ...(won ? {} : {stage: attended ? "attended" : "contacted"}),
        trial: leadTrialSnapshot(bookingId, b, status, attendance),
        ...(feedback ? {coachFeedback: feedback} : {}),
        ...(offer ? {proposalUntil: offer} : {}),
        // Falta não gasta a experimental: a recepção pode remarcar.
        ...(attended ? {} : {trialsCount: Math.max(0, Number(lead["trialsCount"] ?? 0) - 1)}),
        history: appendHistory(lead, historyEntry(byName, attended ? "feedback" : "trial", text, now)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return {b, attended, level, leadId};
  });

  if (result.attended && result.leadId) {
    const desk = await frontDeskUids(db, centerId).catch(() => [] as string[]);
    await notifyMany(deps, desk.filter((u) => u !== uid), {
      title: "Experimental avaliada",
      body: `${str(result.b["name"])} · ${str(result.b["className"])}${result.level ? ` · ${LEVEL_LABELS[result.level]}` : ""}. Hora da proposta.`,
      type: CENTER_LEAD_TYPE,
      data: {centerId, leadId: result.leadId, url: `/athlete/professor/centros/${centerId}/captacao`, webUrl: `/centro/${centerId}/captacao/${result.leadId}`},
    });
  }
  return {bookingId};
}

// ── C9/C10 · página pública do CT (sem conta) ────────────────────────────

export interface PublicTrialSlot {
  sessionId: string;
  classId: string;
  className: string;
  programId: string;
  programName: string;
  level: string;
  teacherName: string;
  place: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
  spotsLeft: number;
}

export interface PublicTrialPage {
  center: {id: string; name: string; city: string; state: string; address: string; coverUrl: string | null; description: string};
  trial: {priceReais: number; note: string};
  programs: {id: string; name: string}[];
  slots: PublicTrialSlot[];
}

async function loadPublicCenter(db: Firestore, centerId: string): Promise<{center: Data; cfg: LeadSettings}> {
  validId(centerId, "Centro");
  const center = await loadActiveCenter(db, centerId);
  const cfg = parseLeadSettings((await leadSettingsRef(db, centerId).get()).data());
  if (!cfg.publicPage) throw new HttpsError("not-found", "Este centro não está agendando aula experimental pela página.");
  return {center, cfg};
}

export async function loadPublicTrialPageCore(db: Firestore, centerId: string, now: Date): Promise<PublicTrialPage> {
  const {center, cfg} = await loadPublicCenter(db, centerId);
  const todayKey = dayKeyFromEventDate(now);
  const ref = centerRef(db, centerId);
  const [classSnap, sessionSnap, trialSnap, programSnap] = await Promise.all([
    ref.collection("classes").where("status", "==", "active").get(),
    ref.collection("sessions").where("date", ">=", todayKey).where("date", "<=", addDaysToDateKey(todayKey, PUBLIC_TRIAL_WINDOW_DAYS)).get(),
    centerTrialRef(db, centerId).where("date", ">=", todayKey).get(),
    ref.collection("programs").get(),
  ]);
  const programs = new Map(programSnap.docs.map((d) => [d.id, str(d.data()["name"])] as const));
  const classes = new Map(classSnap.docs.filter((d) => isListedCenterClass(d.data() as Data, todayKey))
    .map((d) => [d.id, d.data() as Data] as const));
  const taken = new Map<string, number>();
  for (const d of trialSnap.docs) {
    if (!isActiveTrial(d.data() as Data)) continue;
    const sid = str(d.data()["sessionId"]);
    taken.set(sid, (taken.get(sid) ?? 0) + 1);
  }
  const slots: PublicTrialSlot[] = [];
  for (const d of sessionSnap.docs) {
    const s = d.data() as Data;
    const cls = classes.get(str(s["classId"]));
    if (!cls || str(s["status"]) !== "scheduled") continue;
    const opt = centerOption(d.id, s, cls, 0);
    if (classSessionStartAt(opt.date, opt.startTime).getTime() <= now.getTime()) continue;
    const n = taken.get(d.id) ?? 0;
    if (trialSlotBlock(cls, s, n, cfg)) continue;
    const programId = str(s["programId"]) || str(cls["programId"]);
    slots.push({
      ...opt, spotsLeft: centerSpotsLeft(cls, s, n), programId, programName: programs.get(programId) ?? "",
      address: str(s["locationAddress"]) || str(center["address"]),
    });
  }
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className));
  const list = slots.slice(0, MAX_PUBLIC_SLOTS);
  const usedPrograms = [...new Set(list.map((s) => s.programId).filter(Boolean))];
  const showcase = parseShowcase(center["showcase"]);
  return {
    center: {
      id: centerId, name: str(center["name"]) || "Centro de treinamento", city: str(center["city"]), state: str(center["state"]),
      address: str(center["address"]), coverUrl: showcase.coverUrl, description: showcase.description,
    },
    trial: {priceReais: showcase.trial.priceReais, note: showcase.trial.note},
    programs: usedPrograms.map((id) => ({id, name: programs.get(id) ?? "Modalidade"})).sort((a, b) => a.name.localeCompare(b.name)),
    slots: list,
  };
}

export interface PublicBookingResult {
  bookingId: string;
  token: string;
  className: string;
  teacherName: string;
  place: string;
  address: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Rodízio: o próximo da recepção depois do último que recebeu (`settings/leadsRotation`). */
export function nextInRotation(uids: string[], lastUid: string): string | null {
  if (!uids.length) return null;
  const sorted = [...uids].sort();
  const i = sorted.indexOf(lastUid);
  return sorted[(i + 1) % sorted.length] ?? null;
}

export async function bookPublicTrialCore(
  db: Firestore, deps: NotifyDeps, raw: Data, token = randomBytes(16).toString("hex"),
): Promise<PublicBookingResult> {
  const centerId = str(raw["centerId"]);
  const sessionId = validId(str(raw["sessionId"]), "Aula");
  const name = str(raw["name"]).replace(/\s+/g, " ");
  const phone = str(raw["phone"]);
  const digits = phoneDigits(phone);
  const experience = str(raw["experience"]);
  const programId = str(raw["programId"]);
  if (name.length < 2 || name.length > 80) throw new HttpsError("invalid-argument", "Informe seu nome.");
  if (!isValidBrPhone(digits)) throw new HttpsError("invalid-argument", "Informe um WhatsApp com DDD.");
  if (experience && !EXPERIENCES.includes(experience)) throw new HttpsError("invalid-argument", "Experiência inválida.");
  if (programId.includes("/")) throw new HttpsError("invalid-argument", "Modalidade inválida.");
  const {center, cfg} = await loadPublicCenter(db, centerId);
  const now = deps.now();
  const todayKey = dayKeyFromEventDate(now);
  const ref = centerRef(db, centerId);
  const sessionRef = ref.collection("sessions").doc(sessionId);
  const desk = cfg.assignMode === "rotation" ?
    (await ref.collection("centerMembers").where("status", "==", "active").get()).docs
      .filter((d) => str(d.data()["role"]) === "receptionist").map((d) => str(d.data()["uid"]) || d.id) :
    [];
  const rotationRef = ref.collection("settings").doc("leadsRotation");

  const out = await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(sessionRef);
    const s = sSnap.data() as Data | undefined;
    if (!sSnap.exists || !s || str(s["status"]) !== "scheduled") throw new HttpsError("failed-precondition", "Este horário não está mais disponível.");
    const clsSnap = await tx.get(ref.collection("classes").doc(str(s["classId"])));
    const cls = clsSnap.data() as Data | undefined;
    if (!clsSnap.exists || !cls || !isListedCenterClass(cls, todayKey)) throw new HttpsError("failed-precondition", "Este horário não está mais disponível.");
    const option = centerOption(sessionId, s, cls, 0);
    if (classSessionStartAt(option.date, option.startTime).getTime() <= now.getTime()) {
      throw new HttpsError("failed-precondition", "Este horário já começou. Escolha outro.");
    }
    const found = await tx.get(leadsRef(db, centerId).where("phoneDigits", "==", digits).limit(1));
    const leadDoc = found.empty ? null : found.docs[0]!;
    const lead = (leadDoc?.data() ?? null) as Data | null;
    const leadRef: DocumentReference = leadDoc?.ref ?? leadsRef(db, centerId).doc();
    const trialSnap = await tx.get(centerTrialRef(db, centerId).where("date", ">=", todayKey));
    const rotation = cfg.assignMode === "rotation" && !lead ? await tx.get(rotationRef) : null;
    const active = trialSnap.docs.map((d) => d.data() as Data).filter(isActiveTrial);
    const mine = active.find((t) => str(t["leadId"]) === leadRef.id && trialStartAt(t).getTime() > now.getTime());
    if (mine) {
      throw new HttpsError("already-exists", `Você já tem uma aula experimental marcada para ${dateBr(str(mine["date"]))} às ${str(mine["startTime"])}.`);
    }
    const count = Number(lead?.["trialsCount"] ?? 0);
    if (cfg.maxTrialsPerPerson > 0 && count >= cfg.maxTrialsPerPerson) {
      throw new HttpsError("failed-precondition", "Você já fez a aula experimental deste centro. Fale com a gente pelo WhatsApp.");
    }
    const block = trialSlotBlock(cls, s, active.filter((t) => str(t["sessionId"]) === sessionId).length, cfg);
    if (block) throw new HttpsError("failed-precondition", "Este horário acabou de lotar. Escolha outro.");

    const bookingRef = centerTrialRef(db, centerId).doc(leadBookingId(sessionId, leadRef.id));
    const interest = (lead?.["interest"] ?? {}) as Data;
    const programName = programId ? str((await tx.get(ref.collection("programs").doc(programId))).data()?.["name"]) : "";
    const doc = {
      centerId, centerName: str(center["name"]) || "Centro de treinamento", sessionId, classId: option.classId,
      className: option.className, level: option.level, coachName: option.teacherName,
      coachUid: str(s["coachUid"]) || str(cls["coachUid"]) || null,
      locationName: option.place, date: option.date, startTime: option.startTime, endTime: option.endTime,
      athleteId: str(lead?.["athleteId"]), leadId: leadRef.id, name: lead ? str(lead["name"]) || name : name, phone,
      photoUrl: null, experience: experience || str(interest["experience"]), goal: str(interest["goal"]),
      priceReais: parseShowcase(center["showcase"]).trial.priceReais,
      status: "confirmed" as TrialBookingStatus, source: "page", cancelToken: token, note: null,
      decidedAt: FieldValue.serverTimestamp(), decidedByUid: null, decidedByName: "Página do CT",
      attendance: null, coachFeedback: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    const trialText = `Agendou experimental pela página · ${option.className} · ${dateBr(option.date)} ${option.startTime}`;
    const lastUid = str(rotation?.data()?.["lastUid"]);
    const owner = cfg.assignMode === "rotation" && !lead ? nextInRotation(desk, lastUid) : null;
    tx.set(bookingRef, doc);
    tx.set(sessionRef, {trials: {[trialMirrorKey(doc)]: leadMirror(bookingRef.id, doc, "confirmed")}}, {merge: true});
    if (lead) {
      tx.update(leadRef, {
        ...(str(lead["stage"]) === "won" ? {} : {stage: "scheduled", lostReason: null}),
        ...(experience && !str(interest["experience"]) ? {"interest.experience": experience} : {}),
        ...(programId && !str(interest["programId"]) ? {"interest.programId": programId, "interest.programName": programName} : {}),
        trial: leadTrialSnapshot(bookingRef.id, doc, "confirmed"),
        trialsCount: count + 1,
        history: appendHistory(lead, historyEntry(name, "trial", trialText, now)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(leadRef, {
        name, phone, phoneDigits: digits, email: "", age: null, source: "page", referredBy: "",
        interest: {programId, programName, experience, period: "", goal: ""},
        stage: "scheduled", lostReason: null, ownerUid: owner, ownerName: "", athleteId: null,
        studentId: null, enrollmentId: null, proposalUntil: null,
        trial: leadTrialSnapshot(bookingRef.id, doc, "confirmed"), coachFeedback: null, trialsCount: 1,
        history: [historyEntry(name, "created", "Entrou pela página do CT", now), historyEntry(name, "trial", trialText, now)],
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), firstContactAt: null,
        createdByUid: null, createdByName: "Página do CT",
      });
      if (owner) tx.set(rotationRef, {lastUid: owner, at: FieldValue.serverTimestamp()});
    }
    return {doc, bookingId: bookingRef.id, leadId: leadRef.id, owner};
  });

  // Nome do responsável no rodízio (fora da transação: só exibição).
  if (out.owner) {
    const m = (await ref.collection("centerMembers").doc(out.owner).get()).data();
    await leadsRef(db, centerId).doc(out.leadId).update({ownerName: str(m?.["displayName"])}).catch(() => undefined);
  }
  const d = out.doc;
  const staff = out.owner ? [out.owner] : await frontDeskUids(db, centerId).catch(() => [] as string[]);
  await notifyMany(deps, [...staff, ...(d.coachUid ? [d.coachUid] : [])], {
    title: "Nova aula experimental pela página",
    body: `${d.name} · ${d.className} · ${dateBr(d.date)} ${d.startTime}`,
    type: CENTER_LEAD_TYPE,
    data: {centerId, leadId: out.leadId, url: `/athlete/professor/centros/${centerId}/captacao`, webUrl: `/centro/${centerId}/captacao/${out.leadId}`},
  });
  return {
    bookingId: out.bookingId, token, className: d.className, teacherName: d.coachName, place: d.locationName,
    address: str((await ref.collection("sessions").doc(sessionId).get()).data()?.["locationAddress"]) || str(center["address"]),
    date: d.date, startTime: d.startTime, endTime: d.endTime,
  };
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** "Não vou conseguir ir" da página: só com o token devolvido no agendamento. */
export async function cancelPublicTrialCore(db: Firestore, deps: NotifyDeps, raw: Data): Promise<{bookingId: string}> {
  const centerId = validId(str(raw["centerId"]), "Centro");
  const bookingId = validId(str(raw["bookingId"]), "Agendamento");
  const token = str(raw["token"]);
  const b = await cancelBooking(db, centerId, bookingId, "Página do CT", "Desmarcou pela página do CT", deps.now(), (data) => {
    if (str(data["source"]) !== "page" || !sameToken(str(data["cancelToken"]), token)) {
      throw new HttpsError("permission-denied", "Link de cancelamento inválido.");
    }
  });
  const staff = await frontDeskUids(db, centerId).catch(() => [] as string[]);
  await notifyMany(deps, [...staff, str(b["coachUid"])], {
    title: "Experimental desmarcada",
    body: `${str(b["name"])} não vai conseguir ir · ${str(b["className"])} · ${dateBr(str(b["date"]))} ${str(b["startTime"])}`,
    type: CENTER_LEAD_TYPE,
    data: {centerId, leadId: str(b["leadId"]), url: `/athlete/professor/centros/${centerId}/captacao`, webUrl: `/centro/${centerId}/captacao/${str(b["leadId"])}`},
  });
  return {bookingId};
}

// ── callables ────────────────────────────────────────────────────────────

export const scheduleTrainingCenterLeadTrial = onCall({region: CLIENT_FACING_REGIONS, secrets: PUSH_SECRETS}, async (request) =>
  scheduleLeadTrialCore(getFirestore(), defaultNotifyDeps, requireUid(request.auth), (request.data ?? {}) as Data));

export const cancelTrainingCenterLeadTrial = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  cancelLeadTrialCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Data, new Date()));

export const evaluateTrainingCenterTrial = onCall({region: CLIENT_FACING_REGIONS, secrets: PUSH_SECRETS}, async (request) =>
  evaluateTrialCore(getFirestore(), defaultNotifyDeps, requireUid(request.auth), (request.data ?? {}) as Data));

// Página pública: sem login. O abuso é contido pelo telefone (uma experimental ativa e o limite
// por pessoa) e pelo máximo por aula.
export const getTrainingCenterTrialPage = onCall({region: CLIENT_FACING_REGIONS, invoker: "public"}, async (request) =>
  loadPublicTrialPageCore(getFirestore(), str(((request.data ?? {}) as Data)["centerId"]), new Date()));

export const bookTrainingCenterTrialPublic = onCall({region: CLIENT_FACING_REGIONS, invoker: "public", secrets: PUSH_SECRETS}, async (request) =>
  bookPublicTrialCore(getFirestore(), defaultNotifyDeps, (request.data ?? {}) as Data));

export const cancelTrainingCenterTrialPublic = onCall({region: CLIENT_FACING_REGIONS, invoker: "public", secrets: PUSH_SECRETS}, async (request) =>
  cancelPublicTrialCore(getFirestore(), defaultNotifyDeps, (request.data ?? {}) as Data));
