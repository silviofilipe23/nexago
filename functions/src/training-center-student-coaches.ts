/**
 * Dados do aluno por turma: o professor só lê os alunos dele. O servidor mantém
 * `students/{id}.coachUids` (as rules leem esse campo):
 *   - professor titular das turmas em que o aluno ocupa vaga (`classes.rosterStudentIds`);
 *   - quem dá/deu aula para ele numa janela recente (substituto na data, `sessions.coachUid`);
 *   - quem o recebeu como reposição (`sessions.makeupStudentIds`).
 * Recalcula nos gatilhos de turma/aula e numa revisão diária (a janela anda); a callable de
 * reposição devolve só nome e créditos para o professor escolher alunos de outras turmas.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {addDays} from "./training-center-subscription-model";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

/** Janela das aulas que dão acesso (substituto, reposição). */
export const PAST_DAYS = 30;
export const FUTURE_DAYS = 60;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

const centerRef = (db: Firestore, c: string) => db.collection(TRAINING_CENTERS).doc(c);

/** Professores que podem ver o aluno (ordenado, sem repetição). */
export async function coachesOfStudent(db: Firestore, center: DocumentReference, studentId: string, today: string): Promise<string[]> {
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, FUTURE_DAYS);
  const uids = new Set<string>();
  const classes = await center.collection("classes").where("rosterStudentIds", "array-contains", studentId).get();
  const classIds: string[] = [];
  for (const c of classes.docs) {
    if (!["active", "draft"].includes(str(c.data()["status"]))) continue;
    if (str(c.data()["coachUid"])) uids.add(str(c.data()["coachUid"]));
    classIds.push(c.id);
  }
  // Quem dá aula nas turmas dele na janela (inclui substituto na data).
  for (let i = 0; i < classIds.length; i += 30) {
    const snap = await center.collection("sessions")
      .where("classId", "in", classIds.slice(i, i + 30)).where("date", ">=", from).where("date", "<=", to).get();
    for (const s of snap.docs) if (s.data()["status"] !== "cancelled" && str(s.data()["coachUid"])) uids.add(str(s.data()["coachUid"]));
  }
  // Reposição em outra turma.
  const makeups = await center.collection("sessions").where("makeupStudentIds", "array-contains", studentId).where("date", ">=", from).get();
  for (const s of makeups.docs) {
    if (str(s.data()["date"]) <= to && str(s.data()["coachUid"])) uids.add(str(s.data()["coachUid"]));
  }
  return [...uids].sort();
}

/** Recalcula e grava só quem mudou. */
export async function refreshStudentCoaches(db: Firestore, centerId: string, studentIds: Iterable<string>, now: Date): Promise<number> {
  const center = centerRef(db, centerId);
  const tz = str((await center.get()).data()?.["timezone"]);
  const today = dayKeyIn(now, tz);
  let changed = 0;
  for (const id of new Set(studentIds)) {
    if (!id || id.includes("/")) continue;
    const ref = center.collection("students").doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const next = await coachesOfStudent(db, center, id, today);
    const cur = list(snap.data()?.["coachUids"]).sort();
    if (JSON.stringify(cur) === JSON.stringify(next)) continue;
    await ref.update({coachUids: next});
    changed++;
  }
  return changed;
}

/** Alunos afetados por uma mudança de turma (vaga ou professor). */
export function studentsTouchedByClass(before: Data | undefined, after: Data | undefined): string[] {
  const b = list(before?.["rosterStudentIds"]);
  const a = list(after?.["rosterStudentIds"]);
  const coachChanged = str(before?.["coachUid"]) !== str(after?.["coachUid"]) || str(before?.["status"]) !== str(after?.["status"]);
  if (coachChanged) return [...new Set([...b, ...a])];
  const bs = new Set(b);
  const as = new Set(a);
  return [...a.filter((x) => !bs.has(x)), ...b.filter((x) => !as.has(x))];
}

/** Alunos afetados por uma mudança de aula (professor da data, reposições, cancelamento). */
export function studentsTouchedBySession(before: Data | undefined, after: Data | undefined): {makeups: string[]; classRoster: boolean} {
  const b = list(before?.["makeupStudentIds"]);
  const a = list(after?.["makeupStudentIds"]);
  const coachChanged = str(before?.["coachUid"]) !== str(after?.["coachUid"]) || (before?.["status"] === "cancelled") !== (after?.["status"] === "cancelled");
  const bs = new Set(b);
  const as = new Set(a);
  const makeups = coachChanged ? [...new Set([...a, ...b])] : [...a.filter((x) => !bs.has(x)), ...b.filter((x) => !as.has(x))];
  return {makeups, classRoster: coachChanged && (!!before || !!after)};
}

export const onTrainingCenterClassStudentCoaches = onDocumentWritten(`${TRAINING_CENTERS}/{centerId}/classes/{classId}`, async (event) => {
  const ids = studentsTouchedByClass(event.data?.before?.data(), event.data?.after?.data());
  if (ids.length) await refreshStudentCoaches(getFirestore(), event.params.centerId, ids, new Date());
});

export const onTrainingCenterSessionStudentCoaches = onDocumentWritten(`${TRAINING_CENTERS}/{centerId}/sessions/{sessionId}`, async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const touched = studentsTouchedBySession(before, after);
  const ids = [...touched.makeups];
  if (touched.classRoster) {
    const classId = str(after?.["classId"]) || str(before?.["classId"]);
    const cls = classId ? (await centerRef(getFirestore(), event.params.centerId).collection("classes").doc(classId).get()).data() : undefined;
    // Aula gerada/apagada com o próprio titular não muda quem vê a turma (a geração cria dezenas).
    const only = after ?? before;
    const sameAsTitular = (!before || !after) && str(only?.["coachUid"]) === str(cls?.["coachUid"]);
    if (!sameAsTitular) ids.push(...list(cls?.["rosterStudentIds"]));
  }
  if (ids.length) await refreshStudentCoaches(getFirestore(), event.params.centerId, ids, new Date());
});

/** Revisão completa (a janela anda: substituto/reposição antigos saem). Também é o backfill. */
export async function refreshAllStudentCoachesCore(db: Firestore, now: Date, centerId?: string): Promise<number> {
  const centers = centerId ? [await centerRef(db, centerId).get()] : (await db.collection(TRAINING_CENTERS).get()).docs;
  let changed = 0;
  for (const c of centers) {
    if (!c.exists) continue;
    try {
      const students = await c.ref.collection("students").get();
      changed += await refreshStudentCoaches(db, c.id, students.docs.map((d) => d.id), now);
    } catch (e) {
      logger.error(`refreshTrainingCenterStudentCoaches ${c.id}`, e);
    }
  }
  return changed;
}

export const refreshTrainingCenterStudentCoaches = onSchedule({schedule: "0 3 * * *", timeZone: "America/Sao_Paulo", timeoutSeconds: 540},
  async () => {
    await refreshAllStudentCoachesCore(getFirestore(), new Date());
  });

/**
 * Reposição: o professor da aula escolhe alunos de outras turmas com crédito. Devolve só o mínimo
 * (id, nome, créditos) — os dados completos do aluno continuam fora do alcance dele.
 */
export async function listMakeupCandidatesCore(db: Firestore, uid: string | undefined, raw: unknown): Promise<{candidates: {id: string; name: string; makeupCredits: number}[]}> {
  if (!uid) throw new HttpsError("unauthenticated", "Entre de novo.");
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const sessionId = str(d["sessionId"]);
  if (!centerId || !sessionId || centerId.includes("/") || sessionId.includes("/")) throw new HttpsError("invalid-argument", "Aula inválida.");
  const center = centerRef(db, centerId);
  const member = (await center.collection("centerMembers").doc(uid).get()).data();
  if (!member || member["status"] !== "active") throw new HttpsError("permission-denied", "Você não tem acesso a este centro.");
  const manager = ["center_owner", "center_admin"].includes(str(member["role"]));
  const session = (await center.collection("sessions").doc(sessionId).get()).data();
  if (!session) throw new HttpsError("not-found", "Aula não encontrada.");
  const perms = new Set([...(member["role"] === "coach" ? ["attendance"] : []), ...list(member["extraPerms"])]);
  if (!manager && !(perms.has("attendance") && str(session["coachUid"]) === uid)) {
    throw new HttpsError("permission-denied", "Só o professor da aula escolhe reposições.");
  }
  const snap = await center.collection("students").where("makeupCredits", ">", 0).get();
  const candidates = snap.docs
    .filter((s) => s.data()["status"] === "active")
    .map((s) => ({id: s.id, name: str(s.data()["name"]) || "Aluno", makeupCredits: Number(s.data()["makeupCredits"] ?? 0)}))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 300);
  return {candidates};
}

export const listTrainingCenterMakeupCandidates = onCall({region: CLIENT_FACING_REGIONS},
  async (request: CallableRequest) => listMakeupCandidatesCore(getFirestore(), request.auth?.uid, request.data));
