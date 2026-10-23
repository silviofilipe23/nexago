/**
 * Chat do Centro de treinamento: alguém da equipe (professor, recepção, gestão) ↔ aluno com conta
 * NexaGO, no lugar do WhatsApp. Usa o motor de `professor-messages.ts` (`conversations`, envio por
 * `sendConversationMessage`, push, não lidas); aqui só nasce a conversa e a régua de quem fala.
 *
 * - `kind: "center"`, id `t_{centerId}_{staffUid}_{athleteUid}`; `professorUid` = o lado da equipe,
 *   `athleteUid` = a conta do aluno, `centerId`/`studentId` e `title` = nome do centro.
 * - Quem fala com o aluno: a mesma régua de quem VÊ o aluno no app — gestão, recepção e quem tem
 *   matrícula ou financeiro veem todos; o professor, só os alunos das turmas dele (`coachUids`).
 * - Aluno menor fica de fora: o contato é o responsável (ligação), que não tem conta no centro.
 * - Acabou o vínculo da equipe, o aluno saiu ou trocou de conta: a conversa fecha no próximo envio.
 */
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {CONVERSATIONS, userCard, writeConversation} from "./professor-messages";
import {centerConversationId, staffSeesStudent, str, type Data} from "./training-center-chat-model";

/** Equipe abre (ou reabre) a conversa com um aluno do centro. */
export async function openCenterConversationCore(db: Firestore, uid: string, raw: unknown): Promise<{conversationId: string}> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const centerId = str(d["centerId"]);
  const studentId = str(d["studentId"]);
  if (!centerId || !studentId || centerId.includes("/") || studentId.includes("/")) {
    throw new HttpsError("invalid-argument", "Aluno inválido.");
  }
  const center = db.collection(TRAINING_CENTERS).doc(centerId);
  const [c, m, s] = await Promise.all([
    center.get(),
    center.collection("centerMembers").doc(uid).get(),
    center.collection("students").doc(studentId).get(),
  ]);
  const member = m.data();
  const student = s.data();
  if (!member || member["status"] !== "active") throw new HttpsError("permission-denied", "Você não tem acesso a este centro.");
  if (!student) throw new HttpsError("not-found", "Aluno não encontrado.");
  if (!staffSeesStudent(member, uid, student)) {
    throw new HttpsError("permission-denied", "Você só conversa com alunos das suas turmas.");
  }
  if (student["status"] !== "active") throw new HttpsError("failed-precondition", "Este aluno não está ativo no centro.");
  if (student["isMinor"] === true) {
    throw new HttpsError("failed-precondition", "Aluno menor: fale com o responsável pelo telefone.");
  }
  const athleteUid = str(student["uid"]);
  if (!athleteUid) throw new HttpsError("failed-precondition", "Este aluno ainda não tem conta NexaGO.");
  if (athleteUid === uid) throw new HttpsError("invalid-argument", "Você não pode conversar com você mesmo.");

  const id = centerConversationId(centerId, uid, athleteUid);
  const centerName = str(c.data()?.["name"]) || "Centro de treinamento";
  const [staff, athlete] = await Promise.all([userCard(db, uid), userCard(db, athleteUid)]);
  await writeConversation(db.collection(CONVERSATIONS).doc(id), {
    kind: "center",
    professorUid: uid,
    athleteUid,
    centerId,
    studentId,
    title: centerName,
    memberIds: [uid, athleteUid],
    memberNames: {[uid]: str(member["displayName"]) || staff.name, [athleteUid]: str(student["name"]) || athlete.name},
    memberPhotos: {[uid]: staff.photoUrl, [athleteUid]: athlete.photoUrl},
    closed: false,
  });
  return {conversationId: id};
}

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export const openTrainingCenterConversation = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) =>
  openCenterConversationCore(getFirestore(), requireUid(r), r.data));
