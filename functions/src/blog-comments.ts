/**
 * Comentários e dúvidas dos posts do blog (app do atleta; moderação em backoffice › Blog › Comentários).
 *
 *   blogPosts/{postId}/blogComments/{commentId} — `{uid, author: {name, photoUrl}, text, kind, status,
 *       createdAt, moderatedAt, moderatedBy, reply}`. Moderação ANTES de aparecer: tudo nasce `pending`;
 *       o leitor só vê `approved` (e o próprio, em qualquer status). Escrita só por estas callables; o
 *       atleta pode apagar o próprio.
 *
 * `kind: "question"` é o "Ficou dúvida": vai para a mesma fila, e a resposta da equipe (`reply`) aprova a
 * pergunta e avisa o atleta por push. O nome e a foto são um retrato do perfil público no momento do
 * comentário — nunca vêm do cliente. Os comentários ficam só no app (o site não mostra nome de atleta).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp, type DocumentData, type Firestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser} from "./notification-delivery";
import {BLOG_POSTS} from "./blog";
import type {Actor} from "./home-banners";

const CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const BLOG_COMMENTS = "blogComments";
export const BLOG_COMMENT_KINDS = ["comment", "question"] as const;
export const BLOG_COMMENT_MIN = 2;
export const BLOG_COMMENT_MAX = 600;
export const BLOG_COMMENT_REPLY_MAX = 600;
/** Pendentes do mesmo atleta no mesmo post: segura enxurrada antes de a equipe moderar. */
export const BLOG_COMMENT_PENDING_MAX = 3;
export const BLOG_COMMENT_REPLY_TYPE = "blog_comment_reply";
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type BlogCommentKind = (typeof BLOG_COMMENT_KINDS)[number];
export type BlogCommentAction = "approve" | "reject" | "delete" | "reply";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Texto do comentário: sem espaço sobrando, no máximo uma linha em branco seguida. */
export function cleanCommentText(v: unknown): string {
  return str(v)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Como o atleta aparece no comentário: o apelido; senão "Ana S." do nome completo; senão "Atleta".
 * Nunca o nome completo (comentário é público para todo atleta do app).
 */
export function commentAuthorFrom(profile: DocumentData | undefined): {name: string; photoUrl: string | null} {
  const nickname = str(profile?.["nickname"]).replace(/^@+/, "");
  let name = nickname;
  if (!name) {
    const parts = (str(profile?.["fullName"]) || str(profile?.["name"])).split(/\s+/).filter(Boolean);
    name = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] ?? "";
  }
  const photo = [profile?.["profilePhotoUrl"], profile?.["avatarUrl"], profile?.["photoURL"]]
    .map(str)
    .find((u) => /^https:\/\//.test(u));
  return {name: name.slice(0, 40) || "Atleta", photoUrl: photo ?? null};
}

export interface PostBlogCommentInput {
  postId: string;
  text: string;
  kind: BlogCommentKind;
}

export async function postBlogCommentCore(
  db: Firestore,
  uid: string,
  input: PostBlogCommentInput,
  now: Date,
): Promise<{id: string}> {
  if (!input || !DOC_ID_RE.test(str(input.postId))) throw new HttpsError("invalid-argument", "Post inválido.");
  if (!BLOG_COMMENT_KINDS.includes(input.kind)) throw new HttpsError("invalid-argument", "Tipo de comentário inválido.");
  const text = cleanCommentText(input.text);
  if (text.length < BLOG_COMMENT_MIN) throw new HttpsError("invalid-argument", "Escreva um pouco mais antes de enviar.");
  if (text.length > BLOG_COMMENT_MAX) {
    throw new HttpsError("invalid-argument", `O comentário passa de ${BLOG_COMMENT_MAX} caracteres.`);
  }

  const postRef = db.collection(BLOG_POSTS).doc(input.postId);
  const [post, profile, pending] = await Promise.all([
    postRef.get(),
    db.collection("public_profiles").doc(uid).get(),
    postRef.collection(BLOG_COMMENTS).where("uid", "==", uid).where("status", "==", "pending").get(),
  ]);
  const p = post.data();
  if (!p || p["status"] !== "published" || (p["channels"] as {app?: unknown} | undefined)?.app !== true) {
    throw new HttpsError("failed-precondition", "Este post não está mais no ar.");
  }
  if (pending.size >= BLOG_COMMENT_PENDING_MAX) {
    throw new HttpsError(
      "resource-exhausted",
      "Você já tem comentários esperando aprovação neste post. Aguarde a equipe responder.",
    );
  }
  const ref = postRef.collection(BLOG_COMMENTS).doc();
  await ref.set({
    uid,
    author: commentAuthorFrom(profile.data()),
    text,
    kind: input.kind,
    status: "pending",
    createdAt: Timestamp.fromDate(now),
    moderatedAt: null,
    moderatedBy: null,
    reply: null,
  });
  return {id: ref.id};
}

export interface ModerateBlogCommentInput {
  postId: string;
  commentId: string;
  action: BlogCommentAction;
  /** Só com `action: "reply"`. */
  reply?: string;
}

/** O que muda no doc; `null` = apagar. Responder aprova (a pergunta respondida aparece). */
export function moderationUpdate(
  action: BlogCommentAction,
  reply: string,
  actor: Actor,
  now: Date,
): Record<string, unknown> | null {
  const stamp = Timestamp.fromDate(now);
  switch (action) {
  case "approve":
    return {status: "approved", moderatedAt: stamp, moderatedBy: actor};
  case "reject":
    return {status: "rejected", moderatedAt: stamp, moderatedBy: actor};
  case "reply":
    return {
      status: "approved",
      moderatedAt: stamp,
      moderatedBy: actor,
      reply: {text: reply, by: actor, at: stamp},
    };
  case "delete":
    return null;
  }
}

export async function moderateBlogCommentCore(
  db: Firestore,
  input: ModerateBlogCommentInput,
  actor: Actor,
  now: Date,
): Promise<{notify: {uid: string; postId: string; title: string} | null}> {
  if (!input || !DOC_ID_RE.test(str(input.postId)) || !DOC_ID_RE.test(str(input.commentId))) {
    throw new HttpsError("invalid-argument", "Comentário inválido.");
  }
  if (!["approve", "reject", "delete", "reply"].includes(input.action)) {
    throw new HttpsError("invalid-argument", "Ação inválida.");
  }
  const reply = cleanCommentText(input.reply);
  if (input.action === "reply" && reply.length < BLOG_COMMENT_MIN) {
    throw new HttpsError("invalid-argument", "Escreva a resposta.");
  }
  if (reply.length > BLOG_COMMENT_REPLY_MAX) {
    throw new HttpsError("invalid-argument", `A resposta passa de ${BLOG_COMMENT_REPLY_MAX} caracteres.`);
  }
  const postRef = db.collection(BLOG_POSTS).doc(input.postId);
  const ref = postRef.collection(BLOG_COMMENTS).doc(input.commentId);
  const [snap, post] = await Promise.all([ref.get(), postRef.get()]);
  const current = snap.data();
  if (!current) throw new HttpsError("not-found", "Este comentário não existe mais.");

  const update = moderationUpdate(input.action, reply, actor, now);
  if (update === null) await ref.delete();
  else await ref.update(update);

  // Avisa só a primeira resposta: editar a resposta não manda outro push.
  const firstReply = input.action === "reply" && !current["reply"];
  const title = str(post.data()?.["title"]) || "o post";
  return {notify: firstReply ? {uid: str(current["uid"]), postId: input.postId, title} : null};
}

async function assertModerator(uid: string): Promise<Actor> {
  const caller = await getAuth().getUser(uid).catch(() => null);
  if (!caller) throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem moderar comentários.");
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const postBlogComment = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para comentar.");
  return postBlogCommentCore(getFirestore(), uid, (request.data ?? {}) as PostBlogCommentInput, new Date());
});

export const moderateBlogComment = onCall(CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertModerator(uid);
  const result = await moderateBlogCommentCore(
    getFirestore(),
    (request.data ?? {}) as ModerateBlogCommentInput,
    actor,
    new Date(),
  );
  if (result.notify?.uid) {
    const {uid: to, postId, title} = result.notify;
    try {
      await deliverNotificationToUser({
        userId: to,
        title: "A equipe respondeu sua dúvida",
        body: `No post "${title}". Toque para ler.`,
        type: BLOG_COMMENT_REPLY_TYPE,
        data: {url: `/athlete/blog/${postId}`, postId},
        requireInteraction: false,
        skipWebPush: true,
      });
    } catch (error) {
      logger.warn("moderateBlogComment: push da resposta falhou", {postId, error});
    }
  }
  return {ok: true};
});

/** Variação de `commentCount` (só aprovados contam) entre o antes e o depois do comentário. */
export function approvedDelta(before: DocumentData | undefined, after: DocumentData | undefined): number {
  const was = before?.["status"] === "approved";
  const is = after?.["status"] === "approved";
  if (was === is) return 0;
  return is ? 1 : -1;
}

export const onBlogCommentWritten = onDocumentWritten(
  "blogPosts/{postId}/blogComments/{commentId}",
  async (event) => {
    const delta = approvedDelta(event.data?.before.data(), event.data?.after.data());
    if (delta === 0) return;
    try {
      await getFirestore().collection(BLOG_POSTS).doc(event.params.postId)
        .update({commentCount: FieldValue.increment(delta)});
    } catch (error) {
      logger.warn("onBlogCommentWritten: post sem doc", {postId: event.params.postId, error});
    }
  },
);
