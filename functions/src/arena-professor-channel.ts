/**
 * Canal com a arena (canvas D4) e comunicados da arena para os professores (F6).
 *
 * Canal: `conversations/a_{arenaId}_{professorUid}` (`kind: "arena"`) — o professor vinculado e a
 * gestão da arena (dono + equipe com escrita em `perfil`, a mesma régua da tela de profissionais).
 * Mesmo motor de envio do chat (`sendConversationMessage`); aqui só abrir e a lista de membros.
 * Só com vínculo `ACTIVE`: acabou o vínculo, o canal fecha (ninguém escreve; o histórico fica).
 * O nome da gestão vai como "Nome · gestão" — o professor sabe que fala com a arena.
 *
 * Comunicados: `arenaProfessorNotices/{id}` + `recipients/{professorUid}` (leitura). A arena manda
 * para os professores com vínculo ATIVO (ou um subconjunto); o professor lê e pode repassar aos
 * alunos DAQUELA arena pelo fluxo normal de comunicado (o app preenche o rascunho).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {decideArenaAreaAccess, assertArenaAreaAccess, type ArenaAreaAccessArenaData} from "./arena-area-access";
import {ARENA_PROFESSORS, arenaProfessorLinkId} from "./arena-professor-links";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

const CONVERSATIONS = "conversations";
export const ARENA_PROFESSOR_NOTICES = "arenaProfessorNotices";
export const ARENA_PROFESSOR_NOTICE_TYPE = "arena_professor_notice";
export const ARENA_NOTICE_KINDS = ["aviso", "agenda", "evento"] as const;
const MAX_STAFF_MEMBERS = 30;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function cleanId(v: unknown, message: string): string {
  const id = str(v);
  if (!id || id.includes("/")) invalid(message);
  return id;
}

export const arenaChannelConversationId = (arenaId: string, professorUid: string) => `a_${arenaId}_${professorUid}`;

async function displayName(db: Firestore, uid: string): Promise<{name: string; photoUrl: string | null}> {
  const u = (await db.collection("users").doc(uid).get()).data();
  return {
    name: str(u?.["fullName"]) || str(u?.["nickname"]) || str(u?.["displayName"]) || "Equipe",
    photoUrl: str(u?.["photoUrl"]) || str(u?.["avatarUrl"]) || null,
  };
}

/** O vínculo do professor com a arena está ATIVO? Devolve o doc do vínculo. */
export async function activeArenaLink(db: Firestore, arenaId: string, professorUid: string): Promise<Record<string, unknown> | null> {
  const link = (await db.collection(ARENA_PROFESSORS).doc(arenaProfessorLinkId(arenaId, professorUid)).get()).data();
  return link && link["status"] === "ACTIVE" ? link : null;
}

/** Gestão da arena no canal: dono + equipe ativa com escrita em `perfil` (exceto o próprio professor). */
export async function arenaChannelStaff(db: Firestore, arenaId: string, nowMs: number): Promise<{arena: Record<string, unknown>; uids: string[]}> {
  const arenaRef = db.collection("arenas").doc(arenaId);
  const [arenaSnap, staff] = await Promise.all([arenaRef.get(), arenaRef.collection("staff").where("status", "==", "active").get()]);
  const arena = arenaSnap.data();
  if (!arena) throw new HttpsError("not-found", "Arena não encontrada.");
  const uids = new Set<string>();
  const owner = str(arena["managerUserId"]);
  if (owner) uids.add(owner);
  for (const d of staff.docs) {
    if (decideArenaAreaAccess(arena as ArenaAreaAccessArenaData, d.id, d.data(), "perfil", "write", nowMs)) uids.add(d.id);
  }
  return {arena, uids: [...uids].slice(0, MAX_STAFF_MEMBERS)};
}

/** Lista de membros e nomes do canal, refeita do zero (ex-membro da equipe sai). */
export async function arenaChannelMembership(
  db: Firestore, arenaId: string, professorUid: string, nowMs: number,
): Promise<{memberIds: string[]; memberNames: Record<string, string>; memberPhotos: Record<string, string | null>; arenaName: string}> {
  const {arena, uids} = await arenaChannelStaff(db, arenaId, nowMs);
  const staffIds = uids.filter((u) => u !== professorUid);
  const memberIds = [professorUid, ...staffIds];
  const cards = await Promise.all(memberIds.map((m) => displayName(db, m)));
  return {
    memberIds,
    memberNames: Object.fromEntries(memberIds.map((m, i) => [m, i === 0 ? cards[i].name : `${cards[i].name} · gestão`])),
    memberPhotos: Object.fromEntries(memberIds.map((m, i) => [m, cards[i].photoUrl])),
    arenaName: str(arena["name"]) || "Arena",
  };
}

/**
 * Abre (ou atualiza) o canal. O professor abre o dele (`arenaId`); a gestão abre com
 * `professorUid`. Exige vínculo ATIVO nos dois casos.
 */
export async function openArenaChannelCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, now: Date,
): Promise<{conversationId: string; linkId: string}> {
  const arenaId = cleanId(raw["arenaId"], "Arena inválida.");
  const professorUid = raw["professorUid"] == null || str(raw["professorUid"]) === "" ? uid : cleanId(raw["professorUid"], "Professor inválido.");
  if (professorUid !== uid) await assertArenaAreaAccess(db, arenaId, uid, "perfil", "write");
  if (!(await activeArenaLink(db, arenaId, professorUid))) {
    throw new HttpsError("failed-precondition", "O canal com a arena só existe com o vínculo ativo.");
  }
  const membership = await arenaChannelMembership(db, arenaId, professorUid, now.getTime());
  if (!membership.memberIds.includes(uid)) throw new HttpsError("permission-denied", "Você não faz parte da gestão desta arena.");
  const ref = db.collection(CONVERSATIONS).doc(arenaChannelConversationId(arenaId, professorUid));
  const data = {
    kind: "arena",
    professorUid,
    arenaId,
    arenaName: membership.arenaName,
    linkId: arenaProfessorLinkId(arenaId, professorUid),
    title: `Gestão ${membership.arenaName}`,
    memberIds: membership.memberIds,
    memberNames: membership.memberNames,
    memberPhotos: membership.memberPhotos,
    closed: false,
  };
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({...data, updatedAt: FieldValue.serverTimestamp()});
  } else {
    await ref.set({
      ...data, lastAt: null, lastMessage: null, unread: {}, verifiedAt: {},
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return {conversationId: ref.id, linkId: data.linkId};
}

// ---------------------------------------------------------------------------
// Comunicados da arena para os professores (F6)

export interface ArenaNoticeDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultNoticeDeps: ArenaNoticeDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export function parseArenaNotice(raw: Record<string, unknown>): {arenaId: string; kind: string; title: string; body: string; professorUids: string[] | null} {
  const arenaId = cleanId(raw["arenaId"], "Arena inválida.");
  const kind = str(raw["kind"]) || "aviso";
  if (!(ARENA_NOTICE_KINDS as readonly string[]).includes(kind)) invalid("Tipo de comunicado inválido.");
  const title = str(raw["title"]);
  if (!title || title.length > 80) invalid("Dê um título (até 80 caracteres).");
  const body = str(raw["body"]);
  if (!body || body.length > 2000) invalid("Escreva a mensagem (até 2000 caracteres).");
  const professorUids = Array.isArray(raw["professorUids"]) ?
    [...new Set(raw["professorUids"].map(str).filter((u) => u && !u.includes("/")))] :
    null;
  if (professorUids && !professorUids.length) invalid("Escolha ao menos um professor.");
  return {arenaId, kind, title, body, professorUids};
}

export async function sendArenaProfessorNoticeCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: ArenaNoticeDeps = defaultNoticeDeps,
): Promise<{noticeId: string; recipientCount: number}> {
  const input = parseArenaNotice(raw);
  await assertArenaAreaAccess(db, input.arenaId, uid, "perfil", "write");
  const now = deps.now();
  const links = await db.collection(ARENA_PROFESSORS).where("arenaId", "==", input.arenaId).get();
  const active = links.docs.map((d) => d.data()).filter((l) => l["status"] === "ACTIVE");
  const wanted = input.professorUids ? new Set(input.professorUids) : null;
  const recipientIds = [...new Set(active.map((l) => str(l["professorUserId"])).filter((p) => p && p !== uid && (!wanted || wanted.has(p))))];
  if (!recipientIds.length) throw new HttpsError("failed-precondition", "Nenhum professor com vínculo ativo para receber.");
  const [arenaSnap, author] = await Promise.all([db.collection("arenas").doc(input.arenaId).get(), displayName(db, uid)]);
  const arenaName = str(arenaSnap.data()?.["name"]) || "Arena";
  const ref = db.collection(ARENA_PROFESSOR_NOTICES).doc();
  await ref.set({
    arenaId: input.arenaId,
    arenaName,
    authorUid: uid,
    authorName: author.name,
    kind: input.kind,
    title: input.title,
    body: input.body,
    recipientIds,
    recipientCount: recipientIds.length,
    readCount: 0,
    sentAt: Timestamp.fromDate(now),
    createdAt: FieldValue.serverTimestamp(),
  });
  await Promise.all(recipientIds.map(async (userId) => {
    try {
      await deps.notify({
        userId,
        title: `${arenaName} · ${input.title}`,
        body: input.body.slice(0, 140),
        type: ARENA_PROFESSOR_NOTICE_TYPE,
        data: {noticeId: ref.id, arenaId: input.arenaId, url: `/professor/mais/comunicados/arena/${ref.id}`},
      });
    } catch (e) {
      logger.warn(`arenaProfessorNotice ${ref.id}: push para ${userId} falhou`, e);
    }
  }));
  return {noticeId: ref.id, recipientCount: recipientIds.length};
}

/** O professor marca como lido (uma vez; conta para a arena). */
export async function markArenaProfessorNoticeReadCore(db: Firestore, uid: string, noticeId: string, now: Date): Promise<void> {
  const id = cleanId(noticeId, "Comunicado inválido.");
  const ref = db.collection(ARENA_PROFESSOR_NOTICES).doc(id);
  await db.runTransaction(async (tx) => {
    const notice = (await tx.get(ref)).data();
    if (!notice || !(notice["recipientIds"] as string[] | undefined)?.includes(uid)) throw new HttpsError("not-found", "Comunicado não encontrado.");
    const rRef = ref.collection("recipients").doc(uid);
    if ((await tx.get(rRef)).exists) return;
    tx.create(rRef, {professorUid: uid, readAt: Timestamp.fromDate(now)});
    tx.update(ref, {readCount: FieldValue.increment(1)});
  });
}

// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;

export const openArenaChannel = onCall({region: CLIENT_FACING_REGIONS, timeoutSeconds: 60}, async (r) =>
  openArenaChannelCore(getFirestore(), requireUid(r), dataOf(r), new Date()));

export const sendArenaProfessorNotice = onCall({
  region: CLIENT_FACING_REGIONS, timeoutSeconds: 120, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (r) => sendArenaProfessorNoticeCore(getFirestore(), requireUid(r), dataOf(r)));

export const markArenaProfessorNoticeRead = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  await markArenaProfessorNoticeReadCore(getFirestore(), requireUid(r), str(dataOf(r)["noticeId"]), new Date());
  return {ok: true};
});
