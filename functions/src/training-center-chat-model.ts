/**
 * Régua do chat do Centro de treinamento (equipe ↔ aluno), sem depender do motor de mensagens:
 * usada ao abrir a conversa (`training-center-messages.ts`) e a cada envio (`professor-messages.ts`).
 */
import {FieldValue, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {TRAINING_CENTERS} from "./training-center-billing-model";

export type Data = Record<string, unknown>;

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export const centerConversationId = (centerId: string, staffUid: string, athleteUid: string) =>
  `t_${centerId}_${staffUid}_${athleteUid}`;

/** O membro da equipe vê o aluno? Espelha `seesAllStudents` do app + `coachUids` do professor. */
export function staffSeesStudent(member: Data | undefined, staffUid: string, student: Data | undefined): boolean {
  if (!member || member["status"] !== "active" || !student) return false;
  const role = str(member["role"]);
  const perms = list(member["extraPerms"]);
  if (["center_owner", "center_admin", "receptionist"].includes(role)) return true;
  if (perms.includes("enroll_students") || perms.includes("view_finance")) return true;
  return list(student["coachUids"]).includes(staffUid);
}

/** Pode haver chat: equipe ativa que vê o aluno, aluno ativo, maior, com a mesma conta [athleteUid]. */
export async function centerChatAllowed(db: Firestore, centerId: string, staffUid: string, studentId: string, athleteUid: string): Promise<boolean> {
  if (!centerId || !staffUid || !studentId || !athleteUid) return false;
  const center = db.collection(TRAINING_CENTERS).doc(centerId);
  const [m, s] = await Promise.all([
    center.collection("centerMembers").doc(staffUid).get(),
    center.collection("students").doc(studentId).get(),
  ]);
  const student = s.data();
  return staffSeesStudent(m.data(), staffUid, student) &&
    student?.["status"] === "active" &&
    student?.["isMinor"] !== true &&
    str(student?.["uid"]) === athleteUid;
}

/** Fecha: só a equipe continua vendo o histórico. */
export async function closeCenterConversation(ref: DocumentReference, staffUid: string): Promise<void> {
  await ref.update({closed: true, memberIds: [staffUid], closedAt: FieldValue.serverTimestamp()});
}

// ---------------------------------------------------------------------------
// Canal do aluno com o centro (recepção e gestão)
// ---------------------------------------------------------------------------

export const centerDeskConversationId = (centerId: string, athleteUid: string) => `cd_${centerId}_${athleteUid}`;

/** Quem atende o canal do aluno com o centro: quem vê todos os alunos (gestão, recepção, matrícula, financeiro). */
export function isDeskMember(member: Data | undefined): boolean {
  if (!member || member["status"] !== "active") return false;
  const role = str(member["role"]);
  const perms = list(member["extraPerms"]);
  return ["center_owner", "center_admin", "receptionist"].includes(role) ||
    perms.includes("enroll_students") || perms.includes("view_finance");
}

/** O aluno do centro que é a conta [athleteUid] e pode conversar (ativo, maior). */
export async function chatStudentOfAccount(db: Firestore, centerId: string, athleteUid: string): Promise<{id: string; data: Data} | null> {
  const snap = await db.collection(TRAINING_CENTERS).doc(centerId).collection("students").where("uid", "==", athleteUid).get();
  for (const d of snap.docs) {
    const s = d.data();
    if (s["status"] === "active" && s["isMinor"] !== true) return {id: d.id, data: s};
  }
  return null;
}

/** Equipe que atende o canal agora: uid → nome do vínculo. */
export async function centerDeskStaff(db: Firestore, centerId: string): Promise<Record<string, string>> {
  const snap = await db.collection(TRAINING_CENTERS).doc(centerId).collection("centerMembers").where("status", "==", "active").get();
  const out: Record<string, string> = {};
  for (const d of snap.docs) {
    if (isDeskMember(d.data())) out[d.id] = str(d.data()["displayName"]) || "Equipe do centro";
  }
  return out;
}
