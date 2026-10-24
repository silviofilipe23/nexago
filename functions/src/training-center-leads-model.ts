/**
 * Captação do CT (canvas C1–C10): interessados em `trainingCenters/{c}/leads/{leadId}` — pessoa
 * que ainda pode não ter conta NexaGO. A equipe (gestor, recepção, quem matricula) cria e mexe no
 * funil direto pelas rules; o servidor grava só o que envolve a aula experimental (`trial`,
 * `coachFeedback`, `trialsCount`).
 *
 * Arquivo à parte (sem importar `class-trial-booking.ts`) porque o pedido do app também
 * sincroniza o interessado, e os dois módulos se importariam.
 */
import {FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";

type Data = Record<string, unknown>;

export const CENTER_LEADS = "leads";
export const LEAD_SETTINGS_DOC = "leads";

export type LeadStage = "new" | "contacted" | "scheduled" | "attended" | "won" | "lost";
export type LeadSource = "instagram" | "referral" | "page" | "desk" | "whatsapp" | "google" | "app" | "other";
export type LeadHistoryKind = "created" | "contact" | "note" | "stage" | "trial" | "feedback" | "won" | "lost";
export type TrialAttendance = "attended" | "no_show";
export type TrialLevel = "beginner" | "intermediate" | "advanced";

export const LEVEL_LABELS: Record<TrialLevel, string> = {
  beginner: "iniciante",
  intermediate: "intermediário",
  advanced: "avançado",
};

export interface LeadSettings {
  /** 0 = sem limite. */
  maxTrialsPerPerson: number;
  maxTrialsPerSession: number;
  onlyWithSpots: boolean;
  coachReview: "required" | "optional";
  /** Validade da proposta depois da experimental (0 = sem proposta). */
  offerDays: number;
  publicPage: boolean;
  assignMode: "staff" | "rotation";
  alertHours: number;
}

export const DEFAULT_LEAD_SETTINGS: LeadSettings = {
  maxTrialsPerPerson: 1,
  maxTrialsPerSession: 2,
  onlyWithSpots: true,
  coachReview: "required",
  offerDays: 7,
  publicPage: false,
  assignMode: "staff",
  alertHours: 2,
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}

export function parseLeadSettings(raw: unknown): LeadSettings {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const D = DEFAULT_LEAD_SETTINGS;
  return {
    maxTrialsPerPerson: int(d["maxTrialsPerPerson"], D.maxTrialsPerPerson, 0, 10),
    maxTrialsPerSession: int(d["maxTrialsPerSession"], D.maxTrialsPerSession, 1, 10),
    onlyWithSpots: typeof d["onlyWithSpots"] === "boolean" ? d["onlyWithSpots"] : D.onlyWithSpots,
    coachReview: d["coachReview"] === "optional" ? "optional" : "required",
    offerDays: int(d["offerDays"], D.offerDays, 0, 60),
    publicPage: d["publicPage"] === true,
    assignMode: d["assignMode"] === "rotation" ? "rotation" : "staff",
    alertHours: int(d["alertHours"], D.alertHours, 1, 168),
  };
}

export function leadSettingsRef(db: Firestore, centerId: string): DocumentReference {
  return db.doc(`${TRAINING_CENTERS}/${centerId}/settings/${LEAD_SETTINGS_DOC}`);
}

/** Config da captação; sem o doc, `exists=false` (o pedido do app segue as regras antigas). */
export async function loadLeadSettings(db: Firestore, centerId: string): Promise<{exists: boolean; settings: LeadSettings}> {
  const snap = await leadSettingsRef(db, centerId).get();
  return {exists: snap.exists, settings: parseLeadSettings(snap.data())};
}

export function leadsRef(db: Firestore, centerId: string) {
  return db.collection(`${TRAINING_CENTERS}/${centerId}/${CENTER_LEADS}`);
}

/** Só dígitos, sem o DDI 55 — mesma chave para "(21) 98812-3307" e "+55 21 98812 3307". */
export function phoneDigits(phone: unknown): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

export function isValidBrPhone(digits: string): boolean {
  return /^[1-9][0-9]9?[0-9]{8}$/.test(digits);
}

export function historyEntry(byName: string, kind: LeadHistoryKind, text: string, now: Date): Data {
  return {at: Timestamp.fromDate(now), byName: byName || "Sistema", kind, text: text.slice(0, 300)};
}

/** Histórico com a entrada nova no fim (o servidor sempre leu o doc na transação). */
export function appendHistory(lead: Data, entry: Data): Data[] {
  const list = Array.isArray(lead["history"]) ? (lead["history"] as Data[]) : [];
  return [...list, entry].slice(-200);
}

/** Chave do interessado no espelho da aula (`sessions/{id}.trials`). */
export function leadTrialKey(leadId: string): string {
  return `l_${leadId}`;
}

/** Resumo da experimental no doc do interessado (`lead.trial`). */
export function leadTrialSnapshot(bookingId: string, b: Data, status: string, attendance: TrialAttendance | null = null): Data {
  return {
    bookingId,
    sessionId: str(b["sessionId"]),
    classId: str(b["classId"]),
    className: str(b["className"]) || "Turma",
    date: str(b["date"]),
    startTime: str(b["startTime"]),
    endTime: str(b["endTime"]),
    coachName: str(b["coachName"]),
    locationName: str(b["locationName"]),
    status,
    attendance,
  };
}

export function dateBr(dateKey: string): string {
  return dateKey.length === 10 ? `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}` : dateKey;
}

/**
 * Interessado de quem tem conta e pediu a experimental pelo app: o já ligado à conta, senão o que
 * bate pelo telefone (cadastrado no balcão), senão um novo `u_{uid}`. Só leituras — chamar antes
 * das escritas da transação.
 */
export async function findLeadForAthlete(
  tx: Transaction, db: Firestore, centerId: string, uid: string, phone: string | null,
): Promise<{ref: DocumentReference; data: Data | null}> {
  const col = leadsRef(db, centerId);
  const own = await tx.get(col.doc(`u_${uid}`));
  if (own.exists) return {ref: own.ref, data: own.data() as Data};
  const byAccount = await tx.get(col.where("athleteId", "==", uid).limit(1));
  if (!byAccount.empty) return {ref: byAccount.docs[0]!.ref, data: byAccount.docs[0]!.data() as Data};
  const digits = phoneDigits(phone);
  if (digits.length >= 10) {
    const byPhone = await tx.get(col.where("phoneDigits", "==", digits).limit(1));
    if (!byPhone.empty) return {ref: byPhone.docs[0]!.ref, data: byPhone.docs[0]!.data() as Data};
  }
  return {ref: col.doc(`u_${uid}`), data: null};
}

/** Pedido do app → interessado "Experimental agendada" (cria se for novo). */
export function writeLeadForAppBooking(
  tx: Transaction, lead: {ref: DocumentReference; data: Data | null}, bookingId: string, booking: Data, now: Date,
): void {
  const trial = leadTrialSnapshot(bookingId, booking, "pending");
  const text = `Pediu experimental pelo app · ${str(booking["className"])} · ${dateBr(str(booking["date"]))} ${str(booking["startTime"])}`;
  const name = str(booking["name"]) || "Atleta";
  if (!lead.data) {
    const phone = str(booking["phone"]);
    tx.set(lead.ref, {
      name, phone, phoneDigits: phoneDigits(phone), email: "", age: null,
      source: "app", referredBy: "",
      interest: {programId: "", programName: "", experience: "", period: "", goal: ""},
      stage: "scheduled", lostReason: null, ownerUid: null, ownerName: "",
      athleteId: str(booking["athleteId"]) || null, studentId: null, enrollmentId: null, proposalUntil: null,
      trial, coachFeedback: null, trialsCount: 1,
      history: [historyEntry(name, "created", "Entrou pelo app NexaGO", now), historyEntry(name, "trial", text, now)],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), firstContactAt: null,
      createdByUid: null, createdByName: "App NexaGO",
    });
    return;
  }
  const stage = str(lead.data["stage"]);
  tx.update(lead.ref, {
    // Matriculado continua matriculado (aluno pedindo experimental de outra modalidade).
    ...(stage === "won" ? {} : {stage: "scheduled", lostReason: null}),
    athleteId: str(booking["athleteId"]) || lead.data["athleteId"] || null,
    trial,
    trialsCount: Number(lead.data["trialsCount"] ?? 0) + 1,
    history: appendHistory(lead.data, historyEntry(name, "trial", text, now)),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * A experimental do interessado mudou (confirmada, recusada, desmarcada). Recusa e desmarque
 * devolvem o interessado para "Em contato" e liberam a conta do limite por pessoa.
 */
export async function syncLeadTrialStatus(
  tx: Transaction, db: Firestore, centerId: string, booking: Data, bookingId: string, status: string,
  byName: string, text: string, now: Date,
): Promise<() => void> {
  const leadId = str(booking["leadId"]);
  if (!leadId) return () => undefined;
  const ref = leadsRef(db, centerId).doc(leadId);
  const snap = await tx.get(ref);
  return () => {
    if (!snap.exists) return;
    const lead = snap.data() as Data;
    const current = (lead["trial"] ?? {}) as Data;
    // Outra experimental já tomou o lugar desta no interessado: não mexe.
    if (str(current["bookingId"]) && str(current["bookingId"]) !== bookingId) return;
    const released = status === "declined" || status === "canceled";
    const stage = str(lead["stage"]);
    tx.update(ref, {
      trial: leadTrialSnapshot(bookingId, booking, status),
      ...(released && stage === "scheduled" ? {stage: "contacted"} : {}),
      ...(released ? {trialsCount: Math.max(0, Number(lead["trialsCount"] ?? 0) - 1)} : {}),
      history: appendHistory(lead, historyEntry(byName, "trial", text, now)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  };
}
