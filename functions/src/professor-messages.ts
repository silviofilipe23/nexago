/**
 * Mensagens do professor (canvas D1–D3, D5–D7): conversa direta professor ↔ aluno e grupo da turma.
 *
 * - `conversations/{id}`: `kind` direct|class, `professorUid`, `memberIds`, resumo (`lastMessage`,
 *   `lastAt`), `unread.{uid}`, `closed`. Só os membros leem (rules); só functions escrevem.
 *   Ids determinísticos: `d_{professorUid}_{athleteUid}` e `c_{classId}`.
 * - `conversations/{id}/messages/{msgId}`: só functions gravam. O envio é a callable
 *   `sendConversationMessage`, que revalida o vínculo (no máx. a cada 6 h por membro), põe o nome do
 *   remetente (nunca o do cliente), limita a frequência e manda o push (sem poluir o histórico de
 *   notificações). Horário de atendimento: fora dele o professor não recebe push e o aluno recebe uma
 *   resposta automática (no máx. 1 a cada 12 h por conversa).
 *
 * Quem fala com quem: a mesma régua de quem o professor VÊ (`loadProfessorStudentsCore`: turmas
 * com vínculo `ACTIVE` + "Gerenciar as próprias aulas") e a carteira ATIVA. Acabou o vínculo, a
 * conversa fecha (`closed`) e o aluno sai de `memberIds` (deixa de ler). A arena não lê nada.
 * O canal com a gestão da arena (D4, `kind: "arena"`) abre em `arena-professor-channel.ts` e usa
 * este mesmo envio. Cartões de remarcação ficam para depois.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate, EVENT_TIME_ZONE} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {activeArenaLink, arenaChannelMembership} from "./arena-professor-channel";
import {centerChatAllowed, closeCenterConversation} from "./training-center-chat-model";
import {loadProfessorStudentsCore} from "./professor-students";
import {PROFESSORS, PROFESSOR_STUDENTS} from "./professor-wallet-model";

export const CONVERSATIONS = "conversations";
export const CONVERSATION_MESSAGES = "messages";
export const MESSAGING_PREFS = "messagingPrefs";
export const MESSAGE_PUSH_TYPE = "conversation_message";
const AUTO_REPLY_COOLDOWN_MS = 12 * 3600_000;
const VERIFY_EVERY_MS = 6 * 3600_000;
const MIN_GAP_MS = 1000;
const MAX_PER_MINUTE = 30;
const MAX_TEXT = 2000;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export const directConversationId = (professorUid: string, athleteUid: string) => `d_${professorUid}_${athleteUid}`;
export const classConversationId = (classId: string) => `c_${classId}`;

export async function userCard(db: Firestore, uid: string): Promise<{name: string; photoUrl: string | null}> {
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

/** Grava a conversa substituindo os mapas de nomes/fotos (sem `merge` neles: ex-membro não fica). */
export async function writeConversation(ref: DocumentReference, data: Record<string, unknown>): Promise<void> {
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({...data, updatedAt: FieldValue.serverTimestamp()});
  } else {
    await ref.set({
      ...data, closed: false, lastAt: null, lastMessage: null, unread: {}, verifiedAt: {},
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export async function upsertDirect(db: Firestore, professorUid: string, athleteUid: string): Promise<string> {
  const id = directConversationId(professorUid, athleteUid);
  const [prof, athlete] = await Promise.all([userCard(db, professorUid), userCard(db, athleteUid)]);
  await writeConversation(db.collection(CONVERSATIONS).doc(id), {
    kind: "direct",
    professorUid,
    athleteUid,
    memberIds: [professorUid, athleteUid],
    memberNames: {[professorUid]: prof.name, [athleteUid]: athlete.name},
    memberPhotos: {[professorUid]: prof.photoUrl, [athleteUid]: athlete.photoUrl},
    closed: false,
  });
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

/** Alunos com conta ATIVOS NESTA turma (status da própria turma, não o agregado). */
async function classMemberIds(db: Firestore, classId: string): Promise<string[]> {
  const snap = await db.collection("arenaClasses").doc(classId).collection("classStudents").where("status", "==", "active").get();
  return [...new Set(snap.docs.map((d) => str(d.data()["athleteId"])).filter(Boolean))];
}

/** Grupo da turma: professor + alunos com conta (a lista é refeita a cada abertura). */
export async function openClassConversationCore(db: Firestore, uid: string, classId: string, now: Date): Promise<{conversationId: string; memberCount: number}> {
  if (!classId || classId.includes("/")) throw new HttpsError("invalid-argument", "Turma inválida.");
  const {classes} = await loadProfessorStudentsCore(db, uid, dayKeyFromEventDate(now));
  const cls = classes.find((c) => c.classId === classId);
  if (!cls) throw new HttpsError("permission-denied", "Turma não encontrada entre as suas.");
  const athleteIds = (await classMemberIds(db, classId)).filter((a) => a !== uid);
  const memberIds = [uid, ...athleteIds];
  const cards = await Promise.all(memberIds.map((m) => userCard(db, m)));
  const ref = db.collection(CONVERSATIONS).doc(classConversationId(classId));
  await writeConversation(ref, {
    kind: "class",
    professorUid: uid,
    classId,
    arenaId: cls.arenaId,
    arenaName: cls.arenaName,
    title: cls.name,
    memberIds,
    memberNames: Object.fromEntries(memberIds.map((m, i) => [m, cards[i].name])),
    memberPhotos: Object.fromEntries(memberIds.map((m, i) => [m, cards[i].photoUrl])),
    closed: false,
  });
  return {conversationId: ref.id, memberCount: athleteIds.length};
}

/** Fecha a conversa direta (vínculo acabou): só o professor continua vendo o histórico. */
export async function closeDirectConversation(db: Firestore, professorUid: string, athleteUid: string): Promise<void> {
  const ref = db.collection(CONVERSATIONS).doc(directConversationId(professorUid, athleteUid));
  if (!(await ref.get()).exists) return;
  await ref.update({closed: true, memberIds: [professorUid], closedAt: FieldValue.serverTimestamp()});
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
    // Só igualdade em `athleteId` (índice de grupo); status filtrado aqui.
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
  const checked = await Promise.all([...candidates].slice(0, 20).map(async (professorUid) =>
    (await isStudentOfProfessor(db, professorUid, uid, now)) ? {professorUid, ...(await userCard(db, professorUid))} : null));
  return checked.filter((p): p is {professorUid: string; name: string; photoUrl: string | null} => p != null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
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
  const days = Array.isArray(raw["days"]) ? (raw["days"] as unknown[]).map(Number).filter((n) => n >= 1 && n <= 7) : [];
  return {
    quietEnabled: raw["quietEnabled"] === true,
    from: hhmm(raw["from"], "06:00"),
    to: hhmm(raw["to"], "22:00"),
    days: days.length ? days : [1, 2, 3, 4, 5, 6, 7],
    autoReplyEnabled: raw["autoReplyEnabled"] === true,
    autoReplyText: str(raw["autoReplyText"]).slice(0, 500),
  };
}

/** Dentro do horário (fuso de São Paulo)? "Das" == "Até" = dia inteiro; janela pode virar a noite. */
export function withinServiceHours(prefs: MessagingPrefs, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EVENT_TIME_ZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const hm = `${get("hour").replace("24", "00")}:${get("minute")}`;
  if (!prefs.days.includes(weekday)) return false;
  if (prefs.from === prefs.to) return true;
  return prefs.from < prefs.to ? hm >= prefs.from && hm < prefs.to : hm >= prefs.from || hm < prefs.to;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export interface MessageDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: MessageDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false, skipHistory: true});
  },
};

/** O remetente ainda pode falar nesta conversa? Fecha/poda quando o vínculo acabou. */
async function verifyMember(db: Firestore, ref: DocumentReference, c: Record<string, unknown>, uid: string, now: Date): Promise<void> {
  const verifiedAt = (c["verifiedAt"] as Record<string, Timestamp> | undefined)?.[uid];
  // Canal da arena: a equipe muda sem aviso — refaz a lista a cada envio (volume baixo).
  if (c["kind"] !== "arena" && verifiedAt instanceof Timestamp && now.getTime() - verifiedAt.toMillis() < VERIFY_EVERY_MS) return;
  const professorUid = str(c["professorUid"]);
  if (c["kind"] === "arena") {
    const arenaId = str(c["arenaId"]);
    if (!(await activeArenaLink(db, arenaId, professorUid))) {
      await ref.update({closed: true, closedAt: FieldValue.serverTimestamp()});
      throw new HttpsError("failed-precondition", "Este canal foi encerrado: o vínculo com a arena acabou.");
    }
    const m = await arenaChannelMembership(db, arenaId, professorUid, now.getTime());
    await ref.update({memberIds: m.memberIds, memberNames: m.memberNames, memberPhotos: m.memberPhotos});
    c["memberIds"] = m.memberIds;
    if (!m.memberIds.includes(uid)) throw new HttpsError("permission-denied", "Você não faz mais parte da gestão desta arena.");
  } else if (c["kind"] === "center") {
    // Equipe do CT ↔ aluno: o vínculo da equipe e o aluno (ativo, com a mesma conta) seguem valendo?
    if (!(await centerChatAllowed(db, str(c["centerId"]), professorUid, str(c["studentId"]), str(c["athleteUid"])))) {
      await closeCenterConversation(ref, professorUid);
      throw new HttpsError("failed-precondition", "Esta conversa foi encerrada: o vínculo com o centro acabou.");
    }
  } else if (c["kind"] === "direct") {
    const athleteUid = str(c["athleteUid"]);
    if (!(await isStudentOfProfessor(db, professorUid, athleteUid, now))) {
      await closeDirectConversation(db, professorUid, athleteUid);
      throw new HttpsError("failed-precondition", "Esta conversa foi encerrada: o vínculo de aula acabou.");
    }
  } else {
    const classId = str(c["classId"]);
    const {classes} = await loadProfessorStudentsCore(db, professorUid, dayKeyFromEventDate(now));
    if (!classes.some((x) => x.classId === classId)) {
      await ref.update({closed: true, memberIds: [professorUid], closedAt: FieldValue.serverTimestamp()});
      throw new HttpsError("failed-precondition", "Este grupo foi encerrado: a turma não está mais com você.");
    }
    const current = await classMemberIds(db, classId);
    const memberIds = [professorUid, ...current.filter((a) => a !== professorUid)];
    const before = (c["memberIds"] as string[] | undefined) ?? [];
    if (before.length !== memberIds.length || before.some((m) => !memberIds.includes(m))) {
      await ref.update({memberIds});
      c["memberIds"] = memberIds;
    }
    if (!memberIds.includes(uid)) throw new HttpsError("permission-denied", "Você não faz mais parte desta turma.");
  }
  await ref.update({[`verifiedAt.${uid}`]: Timestamp.fromDate(now)});
}

export async function sendConversationMessageCore(
  db: Firestore,
  uid: string,
  conversationId: string,
  rawText: unknown,
  deps: MessageDeps = defaultDeps,
): Promise<{messageId: string}> {
  if (!conversationId || conversationId.includes("/")) throw new HttpsError("invalid-argument", "Conversa inválida.");
  const text = str(rawText);
  if (!text || text.length > MAX_TEXT) throw new HttpsError("invalid-argument", `Mensagem de 1 a ${MAX_TEXT} caracteres.`);
  const now = deps.now();
  const ref = db.collection(CONVERSATIONS).doc(conversationId);
  const first = (await ref.get()).data();
  if (!first || !(first["memberIds"] as string[] | undefined)?.includes(uid)) throw new HttpsError("not-found", "Conversa não encontrada.");
  if (first["closed"] === true) throw new HttpsError("failed-precondition", "Esta conversa foi encerrada.");
  await verifyMember(db, ref, first, uid, now);

  const msgRef = ref.collection(CONVERSATION_MESSAGES).doc();
  const sent = await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data() ?? {};
    const members = (c["memberIds"] as string[] | undefined) ?? [];
    if (!members.includes(uid) || c["closed"] === true) throw new HttpsError("failed-precondition", "Esta conversa foi encerrada.");
    const rate = ((c["rate"] as Record<string, {windowStart?: number; count?: number; lastAt?: number}> | undefined) ?? {})[uid] ?? {};
    const t = now.getTime();
    if (rate.lastAt && t - rate.lastAt < MIN_GAP_MS) throw new HttpsError("resource-exhausted", "Você está enviando rápido demais.");
    const inWindow = rate.windowStart && t - rate.windowStart < 60_000;
    const count = inWindow ? (rate.count ?? 0) + 1 : 1;
    if (count > MAX_PER_MINUTE) throw new HttpsError("resource-exhausted", "Você está enviando rápido demais.");
    const senderName = (c["memberNames"] as Record<string, string> | undefined)?.[uid] || "Atleta";
    tx.create(msgRef, {senderUid: uid, senderName, text, createdAt: Timestamp.fromDate(now)});
    tx.update(ref, {
      lastMessage: {text: text.slice(0, 140), senderUid: uid, senderName, messageId: msgRef.id},
      lastAt: Timestamp.fromDate(now),
      [`rate.${uid}`]: {windowStart: inWindow ? rate.windowStart : t, count, lastAt: t},
      ...Object.fromEntries(members.filter((m) => m !== uid).map((m) => [`unread.${m}`, FieldValue.increment(1)])),
    });
    return {conversation: c, senderName, members};
  });

  const {conversation, senderName, members} = sent;
  const professorUid = str(conversation["professorUid"]);
  const prefs = parseMessagingPrefs((await db.collection("users").doc(professorUid).collection(MESSAGING_PREFS).doc("settings").get()).data());
  const professorOff = prefs != null && !withinServiceHours(prefs, now);
  const isArena = conversation["kind"] === "arena";
  const isCenter = conversation["kind"] === "center";
  const title = conversation["kind"] === "class" || isArena || isCenter ? `${str(conversation["title"])} · ${senderName}` : senderName;
  const urlFor = (userId: string): Record<string, string> => {
    // Equipe do CT: a conversa abre dentro do centro (qualquer papel no app).
    if (isCenter && userId === professorUid) {
      return {url: `/athlete/professor/centros/${str(conversation["centerId"])}/mensagens/${conversationId}`};
    }
    if (userId === professorUid) return {url: `/professor/mensagens/${conversationId}`};
    if (isArena) {
      const linkId = str(conversation["linkId"]);
      return {url: `/arena/professionals/${linkId}/conversa`, webUrl: `/painel/profissionais/${linkId}?aba=mensagens`};
    }
    return {url: `/mensagens/${conversationId}`};
  };
  await Promise.all(members.filter((m) => m !== uid).map(async (userId) => {
    if (userId === professorUid && professorOff && prefs!.quietEnabled) return;
    try {
      await deps.notify({
        userId, title, body: text.slice(0, 140), type: MESSAGE_PUSH_TYPE,
        data: {conversationId, ...urlFor(userId)},
      });
    } catch (e) {
      logger.warn(`conversation ${conversationId}: push para ${userId} falhou`, e);
    }
  }));

  // Resposta automática: só na conversa direta, quando o ALUNO escreve fora do horário.
  if (conversation["kind"] === "direct" && uid !== professorUid && prefs?.autoReplyEnabled && prefs.autoReplyText && professorOff) {
    await db.runTransaction(async (tx) => {
      const c = (await tx.get(ref)).data() ?? {};
      const last = c["autoReplyAt"] instanceof Timestamp ? c["autoReplyAt"].toMillis() : 0;
      if (now.getTime() - last < AUTO_REPLY_COOLDOWN_MS) return;
      const autoRef = ref.collection(CONVERSATION_MESSAGES).doc();
      const name = (c["memberNames"] as Record<string, string> | undefined)?.[professorUid] ?? "Professor";
      tx.create(autoRef, {senderUid: professorUid, senderName: name, text: prefs.autoReplyText, auto: true, createdAt: Timestamp.fromDate(new Date(now.getTime() + 1))});
      tx.update(ref, {
        autoReplyAt: Timestamp.fromDate(now),
        lastMessage: {text: prefs.autoReplyText.slice(0, 140), senderUid: professorUid, senderName: name, messageId: autoRef.id},
        [`unread.${uid}`]: FieldValue.increment(1),
      });
    });
  }
  return {messageId: msgRef.id};
}

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

export const sendConversationMessage = onCall({
  ...OPTS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (r) => sendConversationMessageCore(getFirestore(), requireUid(r), str(dataOf(r)["conversationId"]), dataOf(r)["text"]));

export const markConversationRead = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  await markConversationReadCore(getFirestore(), requireUid(r), str(dataOf(r)["conversationId"]));
  return {ok: true};
});

export const getMyProfessors = onCall(OPTS, async (r) =>
  ({items: await loadMyProfessorsCore(getFirestore(), requireUid(r), new Date())}));
