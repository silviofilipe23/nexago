/**
 * Mensagens do professor (canvas D1–D3, D5–D7): conversa direta professor ↔ aluno e grupo da turma.
 *
 * - `conversations/{id}`: `kind` direct|class, `professorUid`, `memberIds`, resumo (`lastMessage`,
 *   `lastAt`), `unread.{uid}`. Só os membros leem (rules); só functions escrevem.
 *   Ids determinísticos: `d_{professorUid}_{athleteUid}` e `c_{classId}`.
 * - `conversations/{id}/messages/{msgId}`: o MEMBRO grava a própria mensagem direto (rules validam
 *   remetente, campos e tamanho); o trigger `onConversationMessageCreated` atualiza o resumo, soma as
 *   não lidas, manda o push e cuida do horário de atendimento (silêncio + resposta automática).
 *
 * Quem fala com quem: a mesma régua de quem o professor VÊ (`loadProfessorStudentsCore`: turmas
 * com vínculo `ACTIVE` + "Gerenciar as próprias aulas") e a carteira ATIVA. A arena não lê nada.
 * Canal com a gestão da arena (D4) e cartões de remarcação ficam para depois.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate, EVENT_TIME_ZONE} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {loadProfessorStudentsCore} from "./professor-students";
import {PROFESSORS, PROFESSOR_STUDENTS} from "./professor-wallet-model";

export const CONVERSATIONS = "conversations";
export const CONVERSATION_MESSAGES = "messages";
export const MESSAGING_PREFS = "messagingPrefs";
export const MESSAGE_PUSH_TYPE = "conversation_message";
const AUTO_REPLY_COOLDOWN_MS = 12 * 3600_000;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const directConversationId = (professorUid: string, athleteUid: string) => `d_${professorUid}_${athleteUid}`;
export const classConversationId = (classId: string) => `c_${classId}`;

async function userCard(db: Firestore, uid: string): Promise<{name: string; photoUrl: string | null}> {
  const u = (await db.collection("users").doc(uid).get()).data();
  return {
    name: str(u?.["nickname"]) || str(u?.["fullName"]) || str(u?.["displayName"]) || "Atleta",
    photoUrl: str(u?.["photoUrl"]) || str(u?.["avatarUrl"]) || null,
  };
}

/** O atleta é aluno do professor agora (turma liberada ou carteira ativa)? */
export async function isStudentOfProfessor(db: Firestore, professorUid: string, athleteUid: string, now: Date): Promise<boolean> {
  if (!athleteUid || athleteUid === professorUid) return false;
  const wallet = await db.collection(PROFESSORS).doc(professorUid).collection(PROFESSOR_STUDENTS).doc(athleteUid).get();
  if (wallet.exists && wallet.data()?.["status"] === "active") return true;
  const {students} = await loadProfessorStudentsCore(db, professorUid, dayKeyFromEventDate(now));
  return students.some((s) => s.athleteId === athleteUid);
}

async function upsertDirect(db: Firestore, professorUid: string, athleteUid: string): Promise<string> {
  const id = directConversationId(professorUid, athleteUid);
  const ref = db.collection(CONVERSATIONS).doc(id);
  const [prof, athlete, snap] = await Promise.all([userCard(db, professorUid), userCard(db, athleteUid), ref.get()]);
  await ref.set({
    kind: "direct",
    professorUid,
    athleteUid,
    memberIds: [professorUid, athleteUid],
    memberNames: {[professorUid]: prof.name, [athleteUid]: athlete.name},
    memberPhotos: {[professorUid]: prof.photoUrl, [athleteUid]: athlete.photoUrl},
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : {createdAt: FieldValue.serverTimestamp(), lastAt: null, lastMessage: null, unread: {}}),
  }, {merge: true});
  return id;
}

/** Professor abre a conversa com um aluno dele. */
export async function openProfessorConversationCore(db: Firestore, uid: string, athleteUid: string, now: Date): Promise<{conversationId: string}> {
  if (!athleteUid || athleteUid.includes("/")) throw new HttpsError("invalid-argument", "Aluno inválido.");
  if (!(await isStudentOfProfessor(db, uid, athleteUid, now))) {
    throw new HttpsError("permission-denied", "Você só conversa com alunos das suas turmas ou da sua carteira.");
  }
  return {conversationId: await upsertDirect(db, uid, athleteUid)};
}

/** Aluno abre a conversa com um professor dele. */
export async function openStudentConversationCore(db: Firestore, uid: string, professorUid: string, now: Date): Promise<{conversationId: string}> {
  if (!professorUid || professorUid.includes("/")) throw new HttpsError("invalid-argument", "Professor inválido.");
  if (!(await isStudentOfProfessor(db, professorUid, uid, now))) {
    throw new HttpsError("permission-denied", "Você só conversa com professores das suas aulas.");
  }
  return {conversationId: await upsertDirect(db, professorUid, uid)};
}

/** Grupo da turma: professor + alunos com conta (a lista é refeita a cada abertura). */
export async function openClassConversationCore(db: Firestore, uid: string, classId: string, now: Date): Promise<{conversationId: string; memberCount: number}> {
  if (!classId || classId.includes("/")) throw new HttpsError("invalid-argument", "Turma inválida.");
  const {classes, students} = await loadProfessorStudentsCore(db, uid, dayKeyFromEventDate(now));
  const cls = classes.find((c) => c.classId === classId);
  if (!cls) throw new HttpsError("permission-denied", "Turma não encontrada entre as suas.");
  const athleteIds = [...new Set(students
    .filter((s) => s.athleteId && s.status === "active" && s.classes.some((c) => c.classId === classId))
    .map((s) => s.athleteId as string))];
  const memberIds = [uid, ...athleteIds];
  const cards = await Promise.all(memberIds.map((m) => userCard(db, m)));
  const ref = db.collection(CONVERSATIONS).doc(classConversationId(classId));
  const snap = await ref.get();
  await ref.set({
    kind: "class",
    professorUid: uid,
    classId,
    arenaId: cls.arenaId,
    arenaName: cls.arenaName,
    title: cls.name,
    memberIds,
    memberNames: Object.fromEntries(memberIds.map((m, i) => [m, cards[i].name])),
    memberPhotos: Object.fromEntries(memberIds.map((m, i) => [m, cards[i].photoUrl])),
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : {createdAt: FieldValue.serverTimestamp(), lastAt: null, lastMessage: null, unread: {}}),
  }, {merge: true});
  return {conversationId: ref.id, memberCount: athleteIds.length};
}

export async function markConversationReadCore(db: Firestore, uid: string, conversationId: string): Promise<void> {
  if (!conversationId || conversationId.includes("/")) throw new HttpsError("invalid-argument", "Conversa inválida.");
  const ref = db.collection(CONVERSATIONS).doc(conversationId);
  const c = (await ref.get()).data();
  if (!c || !(c["memberIds"] as string[] | undefined)?.includes(uid)) throw new HttpsError("not-found", "Conversa não encontrada.");
  await ref.update({[`unread.${uid}`]: 0});
}

/** Professores com quem o atleta pode conversar (turmas liberadas + carteira ativa). */
export async function loadMyProfessorsCore(db: Firestore, uid: string, now: Date): Promise<Array<{professorUid: string; name: string; photoUrl: string | null}>> {
  const [memberships, wallets] = await Promise.all([
    // Só igualdade em `athleteId` (índice de grupo que já existe para a agenda); status filtrado aqui.
    db.collectionGroup("classStudents").where("athleteId", "==", uid).get(),
    db.collectionGroup(PROFESSOR_STUDENTS).where("athleteId", "==", uid).get(),
  ]);
  const candidates = new Set<string>();
  const classIds = [...new Set(memberships.docs
    .filter((d) => d.data()["status"] === "active")
    .map((d) => d.ref.parent.parent?.id ?? "").filter(Boolean))].slice(0, 30);
  const classes = classIds.length ? await db.getAll(...classIds.map((id) => db.collection("arenaClasses").doc(id))) : [];
  for (const c of classes) {
    const t = str(c.data()?.["teacherUserId"]);
    if (t && t !== uid) candidates.add(t);
  }
  for (const w of wallets.docs) {
    if (w.data()["status"] !== "active") continue;
    const segs = w.ref.path.split("/");
    if (segs.length === 4 && segs[0] === PROFESSORS && segs[1] !== uid) candidates.add(segs[1]);
  }
  const out: Array<{professorUid: string; name: string; photoUrl: string | null}> = [];
  for (const professorUid of [...candidates].slice(0, 20)) {
    if (!(await isStudentOfProfessor(db, professorUid, uid, now))) continue;
    out.push({professorUid, ...(await userCard(db, professorUid))});
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Horário de atendimento
// ---------------------------------------------------------------------------

export interface MessagingPrefs {
  quietEnabled: boolean;
  from: string;
  to: string;
  /** ISO 1–7 (seg–dom) em que ATENDE. */
  days: number[];
  autoReplyEnabled: boolean;
  autoReplyText: string;
}

export function parseMessagingPrefs(raw: Record<string, unknown> | undefined): MessagingPrefs | null {
  if (!raw) return null;
  const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);
  return {
    quietEnabled: raw["quietEnabled"] === true,
    from: hhmm(raw["from"], "06:00"),
    to: hhmm(raw["to"], "22:00"),
    days: Array.isArray(raw["days"]) ? (raw["days"] as unknown[]).map(Number).filter((n) => n >= 1 && n <= 7) : [1, 2, 3, 4, 5, 6],
    autoReplyEnabled: raw["autoReplyEnabled"] === true,
    autoReplyText: str(raw["autoReplyText"]).slice(0, 500),
  };
}

/** Dentro do horário de atendimento (fuso de São Paulo)? Janela que vira a noite também vale. */
export function withinServiceHours(prefs: MessagingPrefs, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EVENT_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const hm = `${get("hour").replace("24", "00")}:${get("minute")}`;
  if (!prefs.days.includes(weekday)) return false;
  return prefs.from <= prefs.to ? hm >= prefs.from && hm < prefs.to : hm >= prefs.from || hm < prefs.to;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export interface MessageDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: MessageDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export async function handleConversationMessageCore(
  db: Firestore,
  conversationId: string,
  messageId: string,
  message: Record<string, unknown>,
  deps: MessageDeps = defaultDeps,
): Promise<void> {
  const ref = db.collection(CONVERSATIONS).doc(conversationId);
  const conversation = (await ref.get()).data();
  if (!conversation) return;
  const senderUid = str(message["senderUid"]);
  const members = (conversation["memberIds"] as string[] | undefined) ?? [];
  if (!members.includes(senderUid)) return;
  const text = str(message["text"]);
  const senderName = str(message["senderName"]) || (conversation["memberNames"] as Record<string, string> | undefined)?.[senderUid] || "";
  const others = members.filter((m) => m !== senderUid);
  await ref.update({
    lastMessage: {text: text.slice(0, 140), senderUid, senderName, messageId},
    lastAt: message["createdAt"] instanceof Timestamp ? message["createdAt"] : FieldValue.serverTimestamp(),
    ...Object.fromEntries(others.map((m) => [`unread.${m}`, FieldValue.increment(1)])),
  });

  const professorUid = str(conversation["professorUid"]);
  const prefs = parseMessagingPrefs((await db.collection("users").doc(professorUid).collection(MESSAGING_PREFS).doc("settings").get()).data());
  const now = deps.now();
  const professorOff = prefs != null && !withinServiceHours(prefs, now);
  const title = conversation["kind"] === "class" ? `${str(conversation["title"])} · ${senderName}` : senderName;
  for (const userId of others) {
    if (userId === professorUid && professorOff && prefs!.quietEnabled) continue;
    try {
      await deps.notify({
        userId, title, body: text.slice(0, 140), type: MESSAGE_PUSH_TYPE,
        data: {conversationId, url: userId === professorUid ? `/professor/mensagens/${conversationId}` : `/mensagens/${conversationId}`},
      });
    } catch (e) {
      logger.warn(`conversation ${conversationId}: push para ${userId} falhou`, e);
    }
  }

  // Resposta automática: só na conversa direta, quando o ALUNO escreve fora do horário.
  if (message["auto"] === true || conversation["kind"] !== "direct" || senderUid === professorUid) return;
  if (!prefs?.autoReplyEnabled || !prefs.autoReplyText || !professorOff) return;
  const last = conversation["autoReplyAt"] instanceof Timestamp ? conversation["autoReplyAt"].toMillis() : 0;
  if (now.getTime() - last < AUTO_REPLY_COOLDOWN_MS) return;
  await ref.update({autoReplyAt: Timestamp.fromDate(now)});
  await ref.collection(CONVERSATION_MESSAGES).add({
    senderUid: professorUid,
    senderName: (conversation["memberNames"] as Record<string, string> | undefined)?.[professorUid] ?? "Professor",
    text: prefs.autoReplyText,
    auto: true,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const onConversationMessageCreated = onDocumentCreated({
  document: `${CONVERSATIONS}/{conversationId}/${CONVERSATION_MESSAGES}/{messageId}`,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;
  await handleConversationMessageCore(getFirestore(), event.params.conversationId, event.params.messageId, data);
});

// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}
const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;
const OPTS = {region: CLIENT_FACING_REGIONS, timeoutSeconds: 60};

export const openProfessorConversation = onCall(OPTS, async (r) =>
  openProfessorConversationCore(getFirestore(), requireUid(r), str(dataOf(r)["athleteId"]), new Date()));

export const openStudentConversation = onCall(OPTS, async (r) =>
  openStudentConversationCore(getFirestore(), requireUid(r), str(dataOf(r)["professorUid"]), new Date()));

export const openClassConversation = onCall(OPTS, async (r) =>
  openClassConversationCore(getFirestore(), requireUid(r), str(dataOf(r)["classId"]), new Date()));

export const markConversationRead = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  await markConversationReadCore(getFirestore(), requireUid(r), str(dataOf(r)["conversationId"]));
  return {ok: true};
});

export const getMyProfessors = onCall(OPTS, async (r) =>
  ({items: await loadMyProfessorsCore(getFirestore(), requireUid(r), new Date())}));
