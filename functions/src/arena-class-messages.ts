/**
 * Chat das Aulas da arena: alguém da gestão (dono, recepção, financeiro) ↔ aluno com conta
 * NexaGO, no lugar do WhatsApp — o botão "Mensagem" e o "Cobrar" das mensalidades. Usa o motor de
 * `professor-messages.ts` (`conversations`, envio por `sendConversationMessage`, push, não lidas);
 * aqui só nasce a conversa e a régua de quem fala.
 *
 * - `kind: "arena_student"`, id `s_{arenaId}_{staffUid}_{athleteUid}`; `professorUid` = o lado da
 *   gestão (como no CT), `athleteUid` = a conta do aluno, `arenaId`/`arenaName` e `title` = nome da
 *   arena. Uma conversa por pessoa da gestão: quem cobra é quem recebe a resposta e o push.
 * - Quem fala com o aluno: quem VÊ o aluno nas Aulas (dono ou equipe que lê agenda ou financeiro).
 * - O aluno: turma ativa, plano ativo/pausado ou mensalidade em aberto nesta arena.
 * - Acabou o acesso da pessoa ou o aluno saiu de tudo: a conversa fecha no próximo envio.
 * - Aluno sem conta não tem chat (o app segue no WhatsApp/telefone).
 */
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {CONVERSATIONS, userCard, writeConversation} from "./professor-messages";
import {arenaStudentConversationId, isArenaClassStudent, staffSeesArenaStudents, str, type Data} from "./arena-class-chat-model";

/** Gestão abre (ou reabre) a conversa com um aluno das Aulas da arena. */
export async function openArenaStudentConversationCore(
  db: Firestore, uid: string, raw: unknown, now: Date,
): Promise<{conversationId: string}> {
  const d = (raw && typeof raw === "object" ? raw : {}) as Data;
  const arenaId = str(d["arenaId"]);
  const athleteUid = str(d["athleteId"]);
  if (!arenaId || arenaId.includes("/")) throw new HttpsError("invalid-argument", "Arena inválida.");
  if (!athleteUid || athleteUid.includes("/")) {
    throw new HttpsError("failed-precondition", "Este aluno ainda não tem conta NexaGO.");
  }
  if (athleteUid === uid) throw new HttpsError("invalid-argument", "Você não pode conversar com você mesmo.");
  const arenaRef = db.collection("arenas").doc(arenaId);
  const [arena, staff] = await Promise.all([arenaRef.get(), arenaRef.collection("staff").doc(uid).get()]);
  if (!arena.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  if (!staffSeesArenaStudents(arena.data(), uid, staff.data(), now.getTime())) {
    throw new HttpsError("permission-denied", "Você não tem acesso às aulas desta arena.");
  }
  if (!(await isArenaClassStudent(db, arenaId, athleteUid))) {
    throw new HttpsError("failed-precondition", "Este atleta não é mais aluno das aulas da arena.");
  }

  const id = arenaStudentConversationId(arenaId, uid, athleteUid);
  const arenaName = str(arena.data()?.["name"]) || "Arena";
  const [me, athlete] = await Promise.all([userCard(db, uid), userCard(db, athleteUid)]);
  await writeConversation(db.collection(CONVERSATIONS).doc(id), {
    kind: "arena_student",
    professorUid: uid,
    athleteUid,
    arenaId,
    arenaName,
    title: arenaName,
    memberIds: [uid, athleteUid],
    memberNames: {[uid]: me.name, [athleteUid]: athlete.name},
    memberPhotos: {[uid]: me.photoUrl, [athleteUid]: athlete.photoUrl},
    closed: false,
  });
  return {conversationId: id};
}

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export const openArenaStudentConversation = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) =>
  openArenaStudentConversationCore(getFirestore(), requireUid(r), r.data, new Date()));
