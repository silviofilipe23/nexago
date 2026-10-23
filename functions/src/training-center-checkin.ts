/**
 * Check-in do aluno no Centro de Treinamento (canvas G2/G7/G8).
 *
 * O aluno mostra a carteirinha no app (QR `nexago-ct:{centerId}:{checkinCode}`); a recepção (ou a
 * gestão, ou o professor da aula) lê o QR ou busca o aluno pelo nome. O servidor acha a aula dele
 * hoje — a do horário, ou a próxima — e marca presente na chamada. Mensalidade em atraso
 * (`students.billingHold`) devolve a pendência sem gravar: a recepção decide ("registrar mesmo
 * assim").
 *
 * `checkinCode` fica no cadastro do aluno e só o servidor grava (nasce no `getMyTrainingCenters`).
 */
import {randomInt} from "node:crypto";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {dayKeyIn} from "./training-center-waitlist-model";
import {sessionStartAt} from "./training-center-athlete-actions";
import {str} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";

type Data = Record<string, unknown>;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 10;
/** A janela do check-in abre 60 min antes da aula. */
const OPEN_BEFORE_MS = 60 * 60_000;
export const CHECKIN_QR_PREFIX = "nexago-ct:";

export function randomCheckinCode(rand: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[rand(ALPHABET.length)];
  return out;
}

/** Código da carteirinha do aluno; cria na primeira vez. */
export async function ensureCheckinCode(ref: DocumentReference, student: Data): Promise<string> {
  const cur = str(student["checkinCode"]);
  if (cur) return cur;
  const code = randomCheckinCode();
  await ref.set({checkinCode: code}, {merge: true});
  return code;
}

/** `nexago-ct:{centerId}:{code}` → partes; `null` se não for uma carteirinha. */
export function parseCheckinQr(raw: string): {centerId: string; code: string} | null {
  const v = raw.trim();
  if (!v.startsWith(CHECKIN_QR_PREFIX)) return null;
  const [centerId, code] = v.slice(CHECKIN_QR_PREFIX.length).split(":");
  if (!centerId || !code || centerId.includes("/")) return null;
  return {centerId, code: code.toUpperCase()};
}

export type CheckinState = "checked_in" | "already" | "hold" | "no_session" | "wrong_center";

export interface CheckinResult {
  state: CheckinState;
  studentId: string;
  studentName: string;
  sessionId: string | null;
  className: string;
  startTime: string;
  coachName: string;
  /** Mensalidade em atraso (a recepção resolve). */
  billingHold: boolean;
  /** Encaixado como reposição nesta aula. */
  makeup: boolean;
}

/**
 * A aula do aluno para o check-in agora: entre as de hoje em que ele está (turma ou reposição),
 * a que está na janela (abre 60 min antes, fecha no fim); senão, a próxima de hoje.
 */
export function pickCheckinSession(
  sessions: Array<{id: string; data: Data; inRoster: boolean}>,
  now: Date,
): {id: string; data: Data} | null {
  const mine = sessions
    .filter((s) => s.data["status"] === "scheduled" && s.inRoster)
    .map((s) => {
      const start = sessionStartAt(s.data);
      const dur = Number(s.data["durationMin"] ?? 60);
      return {...s, start, end: start ? new Date(start.getTime() + dur * 60_000) : null};
    })
    .filter((s) => s.start && s.end)
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());
  const t = now.getTime();
  const open = mine.find((s) => t >= s.start!.getTime() - OPEN_BEFORE_MS && t <= s.end!.getTime());
  if (open) return {id: open.id, data: open.data};
  const next = mine.find((s) => s.start!.getTime() > t);
  return next ? {id: next.id, data: next.data} : null;
}

export async function checkInStudentCore(
  db: Firestore,
  auth: {uid: string},
  raw: unknown,
  now: Date,
): Promise<CheckinResult> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  let centerId = str(d["centerId"]);
  let code = str(d["code"]).toUpperCase();
  const qr = str(d["qr"]);
  if (qr) {
    const parsed = parseCheckinQr(qr);
    if (!parsed) throw new HttpsError("invalid-argument", "Este QR não é uma carteirinha do NexaGO.");
    if (centerId && parsed.centerId !== centerId) {
      return {
        state: "wrong_center", studentId: "", studentName: "", sessionId: null, className: "", startTime: "",
        coachName: "", billingHold: false, makeup: false,
      };
    }
    centerId = parsed.centerId;
    code = parsed.code;
  }
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  const centerRef = db.collection(TRAINING_CENTERS).doc(centerId);
  const member = (await centerRef.collection("centerMembers").doc(auth.uid).get()).data();
  if (!member || member["status"] !== "active") {
    throw new HttpsError("permission-denied", "Você não faz parte da equipe deste centro.");
  }
  const role = str(member["role"]);
  const isFrontDesk = role === "center_owner" || role === "center_admin" || role === "receptionist";
  if (!isFrontDesk && role !== "coach") throw new HttpsError("permission-denied", "Seu papel não faz check-in.");
  const center = (await centerRef.get()).data() ?? {};
  if (center["status"] === "suspended") throw new HttpsError("failed-precondition", "Centro suspenso: o check-in está parado.");

  let studentRef: DocumentReference;
  let student: Data;
  const studentId = str(d["studentId"]);
  if (studentId) {
    if (studentId.includes("/")) throw new HttpsError("invalid-argument", "Aluno inválido.");
    studentRef = centerRef.collection("students").doc(studentId);
    const snap = await studentRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Aluno não encontrado.");
    student = snap.data() as Data;
  } else {
    if (!code) throw new HttpsError("invalid-argument", "Leia a carteirinha ou escolha o aluno.");
    const q = await centerRef.collection("students").where("checkinCode", "==", code).limit(1).get();
    if (q.empty) throw new HttpsError("not-found", "Carteirinha não encontrada neste centro.");
    studentRef = q.docs[0]!.ref;
    student = q.docs[0]!.data() as Data;
  }
  if (student["status"] === "blocked") throw new HttpsError("failed-precondition", "Aluno bloqueado pelo centro.");
  const sid = studentRef.id;
  const base = {
    studentId: sid,
    studentName: str(student["name"]) || "Aluno",
    billingHold: student["billingHold"] === true,
  };

  const today = dayKeyIn(now, str(center["timezone"]) || "America/Sao_Paulo");
  const requested = str(d["sessionId"]);
  const todaySessions = await centerRef.collection("sessions").where("date", "==", today).get();
  const classIds = [...new Set(todaySessions.docs.map((x) => str(x.data()["classId"])).filter(Boolean))];
  const classes = classIds.length ?
    new Map((await db.getAll(...classIds.map((id) => centerRef.collection("classes").doc(id))))
      .map((c) => [c.id, (c.data() ?? {}) as Data])) :
    new Map<string, Data>();
  const candidates = todaySessions.docs
    .filter((x) => !requested || x.id === requested)
    .filter((x) => isFrontDesk || str(x.data()["coachUid"]) === auth.uid)
    .map((x) => {
      const s = x.data() as Data;
      const roster = (classes.get(str(s["classId"]))?.["rosterStudentIds"] ?? []) as unknown[];
      const makeups = (s["makeupStudentIds"] ?? []) as unknown[];
      return {id: x.id, data: s, inRoster: roster.includes(sid) || makeups.includes(sid)};
    });
  const picked = pickCheckinSession(candidates, now);
  if (!picked) {
    return {...base, state: "no_session", sessionId: null, className: "", startTime: "", coachName: "", makeup: false};
  }
  const info = {
    sessionId: picked.id,
    className: str(picked.data["className"]) || "Aula",
    startTime: str(picked.data["startTime"]),
    coachName: str(picked.data["coachName"]),
    makeup: ((picked.data["makeupStudentIds"] ?? []) as unknown[]).includes(sid),
  };
  if (base.billingHold && d["force"] !== true) return {...base, ...info, state: "hold"};

  const ref = centerRef.collection("sessions").doc(picked.id);
  const at = Timestamp.fromDate(now);
  const byName = str(member["displayName"]) || "Recepção";
  const already = await db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data();
    if (!s || s["status"] !== "scheduled") throw new HttpsError("failed-precondition", "A chamada desta aula já foi fechada.");
    const attendance = {...((s["attendance"] ?? {}) as Data)};
    if (attendance[sid] === "present") return true;
    attendance[sid] = "present";
    const byStudent = {...((s["attendanceByStudent"] ?? {}) as Data)};
    delete byStudent[sid];
    tx.update(ref, {
      attendance,
      attendanceByStudent: byStudent,
      checkins: {...((s["checkins"] ?? {}) as Data), [sid]: {at, byUid: auth.uid, byName}},
      attendanceUpdatedAt: at,
    });
    tx.set(centerRef.collection("auditLogs").doc(), {
      at, actorUid: auth.uid, actorName: byName, action: "session.checkin", entity: "session", entityId: picked.id,
      detail: `${base.studentName} · check-in em ${info.className} ${info.startTime}${base.billingHold ? " · com pendência" : ""}`,
      reason: "",
    });
    return false;
  });
  return {...base, ...info, state: already ? "already" : "checked_in"};
}

export const checkInTrainingCenterStudent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return checkInStudentCore(getFirestore(), {uid: request.auth.uid}, request.data, new Date());
});
