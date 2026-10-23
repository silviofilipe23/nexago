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
 * - O ALUNO também inicia: com um professor das turmas dele (a mesma conversa `center`) ou no canal
 *   com o centro (`kind: "center_desk"`, id `cd_{centerId}_{athleteUid}`): aluno + recepção e gestão,
 *   lista refeita a cada envio, qualquer um da equipe responde. Sem `professorUid` (vazio).
 */
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {CONVERSATIONS, userCard, writeConversation} from "./professor-messages";
import {
  centerConversationId,
  centerDeskConversationId,
  centerDeskStaff,
  chatStudentOfAccount,
  staffSeesStudent,
  str,
  type Data,
} from "./training-center-chat-model";

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

/** Nome do centro (título das conversas). */
async function centerName(db: Firestore, centerId: string): Promise<string> {
  return str((await db.collection(TRAINING_CENTERS).doc(centerId).get()).data()?.["name"]) || "Centro de treinamento";
}

function centerIdOf(d: Data): string {
  const centerId = str(d["centerId"]);
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  return centerId;
}

async function requireChatStudent(db: Firestore, centerId: string, uid: string): Promise<{id: string; data: Data}> {
  const student = await chatStudentOfAccount(db, centerId, uid);
  if (!student) {
    throw new HttpsError("permission-denied", "Só alunos ativos (maiores de idade) conversam com o centro pelo app.");
  }
  return student;
}

/** Professores do aluno (das turmas dele) e se o canal com o centro está disponível. */
export async function listCenterContactsCore(db: Firestore, uid: string, raw: unknown):
  Promise<{centerName: string; desk: boolean; professors: Array<{uid: string; name: string; photoUrl: string | null}>}> {
  const centerId = centerIdOf((raw && typeof raw === "object" ? raw : {}) as Data);
  const student = await requireChatStudent(db, centerId, uid);
  const center = db.collection(TRAINING_CENTERS).doc(centerId);
  const coachUids = [...new Set((Array.isArray(student.data["coachUids"]) ? student.data["coachUids"] : [])
    .filter((x): x is string => typeof x === "string" && x !== uid))].slice(0, 20);
  const members = coachUids.length ? await db.getAll(...coachUids.map((c) => center.collection("centerMembers").doc(c))) : [];
  const professors = await Promise.all(members
    .filter((m) => m.exists && m.data()?.["status"] === "active")
    .map(async (m) => {
      const card = await userCard(db, m.id);
      return {uid: m.id, name: str(m.data()?.["displayName"]) || card.name, photoUrl: card.photoUrl};
    }));
  const desk = Object.keys(await centerDeskStaff(db, centerId)).some((s) => s !== uid);
  return {
    centerName: await centerName(db, centerId),
    desk,
    professors: professors.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  };
}

/** Aluno abre a conversa com um professor das turmas dele (a mesma `t_…` que a equipe abre). */
async function openAsStudentWithStaff(db: Firestore, uid: string, centerId: string, staffUid: string): Promise<{conversationId: string}> {
  if (!staffUid || staffUid.includes("/") || staffUid === uid) throw new HttpsError("invalid-argument", "Professor inválido.");
  const student = await requireChatStudent(db, centerId, uid);
  const center = db.collection(TRAINING_CENTERS).doc(centerId);
  const m = (await center.collection("centerMembers").doc(staffUid).get()).data();
  if (!staffSeesStudent(m, staffUid, student.data)) {
    throw new HttpsError("permission-denied", "Você só conversa com professores das suas turmas.");
  }
  const id = centerConversationId(centerId, staffUid, uid);
  const [staff, athlete] = await Promise.all([userCard(db, staffUid), userCard(db, uid)]);
  await writeConversation(db.collection(CONVERSATIONS).doc(id), {
    kind: "center",
    professorUid: staffUid,
    athleteUid: uid,
    centerId,
    studentId: student.id,
    title: await centerName(db, centerId),
    memberIds: [staffUid, uid],
    memberNames: {[staffUid]: str(m?.["displayName"]) || staff.name, [uid]: str(student.data["name"]) || athlete.name},
    memberPhotos: {[staffUid]: staff.photoUrl, [uid]: athlete.photoUrl},
    closed: false,
  });
  return {conversationId: id};
}

/** Aluno abre (ou reabre) o canal com o centro: ele + recepção e gestão. */
export async function openCenterDeskCore(db: Firestore, uid: string, centerId: string): Promise<{conversationId: string}> {
  const student = await requireChatStudent(db, centerId, uid);
  const staff = await centerDeskStaff(db, centerId);
  delete staff[uid];
  const staffIds = Object.keys(staff);
  if (!staffIds.length) throw new HttpsError("failed-precondition", "O centro ainda não tem recepção ou gestão no app.");
  const athlete = await userCard(db, uid);
  const id = centerDeskConversationId(centerId, uid);
  await writeConversation(db.collection(CONVERSATIONS).doc(id), {
    kind: "center_desk",
    professorUid: "",
    athleteUid: uid,
    centerId,
    studentId: student.id,
    title: await centerName(db, centerId),
    memberIds: [uid, ...staffIds],
    memberNames: {...staff, [uid]: str(student.data["name"]) || athlete.name},
    memberPhotos: {[uid]: athlete.photoUrl},
    closed: false,
  });
  return {conversationId: id};
}

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

/**
 * Abre a conversa do centro. Equipe: `{centerId, studentId}`. Aluno: `{centerId, staffUid}` (um
 * professor dele) ou `{centerId, desk: true}` (o canal com a recepção e a gestão).
 */
export async function openTrainingCenterConversationCore(db: Firestore, uid: string, raw: unknown): Promise<{conversationId: string}> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  if (d["desk"] === true) return openCenterDeskCore(db, uid, centerIdOf(d));
  if (str(d["staffUid"])) return openAsStudentWithStaff(db, uid, centerIdOf(d), str(d["staffUid"]));
  return openCenterConversationCore(db, uid, d);
}

export const openTrainingCenterConversation = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) =>
  openTrainingCenterConversationCore(getFirestore(), requireUid(r), r.data));

export const listTrainingCenterChatContacts = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) =>
  listCenterContactsCore(getFirestore(), requireUid(r), r.data));
