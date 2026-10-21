/**
 * Story do treino pelo professor (App do Professor · G1–G3): ao postar o story de uma aula
 * encerrada, o professor marca os alunos presentes que liberaram aparecer em story
 * (`privacyPreferences.showOthers.storyTags`), e cada um recebe push + inbox com o card para
 * repostar.
 *
 * Privacidade: cada aluno marcado ganha o SEU documento em `classStoryTags/{sessionId}_{uid}`
 * (rule: só o próprio `uid` lê; ninguém escreve pelo cliente). O documento leva o que a arte
 * mostra — nome e foto de quem também liberou a marcação, nunca uid, telefone ou marca de quem
 * faltou. Quem não liberou não aparece nem é avisado; o servidor confere de novo na hora.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {str} from "./arena-class";
import {loadTeacherClassSessionContext} from "./arena-class-teacher";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export const CLASS_STORY_TAGS = "classStoryTags";
export const CLASS_STORY_TAG_NOTIFICATION_TYPE = "class_story_tag";

export const CLASS_STORY_PLAN_MAX_BLOCKS = 5;
export const CLASS_STORY_PLAN_LABEL_MAX = 40;
/** Avatares que cabem na arte. */
export const CLASS_STORY_PEOPLE_MAX = 6;

export interface ClassStoryPlanBlock {
  minutes: number;
  label: string;
}

export interface ClassStoryShow {
  plan: boolean;
  numbers: boolean;
  place: boolean;
}

export interface ClassStoryPerson {
  firstName: string;
  initials: string;
  photoUrl: string | null;
}

export function classStoryTagId(sessionId: string, uid: string): string {
  return `${sessionId}_${uid}`;
}

/** Blocos do plano: minutos 1–240, texto aparado até 40 caracteres, no máximo 5 (o que cabe na arte); o resto cai. */
export function sanitizeClassStoryPlan(raw: unknown): ClassStoryPlanBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ClassStoryPlanBlock[] = [];
  for (const item of raw) {
    if (out.length >= CLASS_STORY_PLAN_MAX_BLOCKS) break;
    if (!item || typeof item !== "object") continue;
    const minutes = Math.round(Number((item as Record<string, unknown>)["minutes"]));
    const label = str((item as Record<string, unknown>)["label"]).slice(0, CLASS_STORY_PLAN_LABEL_MAX).trim();
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240 || !label) continue;
    out.push({minutes, label});
  }
  return out;
}

export function sanitizeClassStoryShow(raw: unknown): ClassStoryShow {
  const map = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {plan: map["plan"] !== false, numbers: map["numbers"] !== false, place: map["place"] !== false};
}

export function classStoryPerson(name: string, photoUrl: string | null): ClassStoryPerson {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  return {
    firstName: first,
    initials: `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?",
    photoUrl,
  };
}

export function classStoryTagPushBody(teacherName: string, className: string): string {
  const first = teacherName.trim().split(/\s+/)[0] || "Seu professor";
  return `${first} postou o treino de ${className} e marcou você. Reposte no seu story.`;
}

export interface ShareClassStoryInput {
  sessionId: string;
  /** Linhas da chamada (`studentId` do roster) que o professor quer marcar. */
  studentIds: string[];
  plan: ClassStoryPlanBlock[];
  show: ClassStoryShow;
}

export interface ShareClassStoryDeps {
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) =>
    Promise<void>;
}

const defaultDeps: ShareClassStoryDeps = {
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

/**
 * Grava um `classStoryTags` por aluno marcado e avisa só quem é marcado pela primeira vez nesta
 * aula (repostar não reavisa). Marcados de antes que saíram da seleção perdem o documento.
 */
export async function shareClassStoryCore(
  db: Firestore,
  input: ShareClassStoryInput,
  uid: string,
  todayKey: string,
  deps: ShareClassStoryDeps = defaultDeps,
): Promise<{tagged: number; notified: number}> {
  const {data, session, students, athleteIds} = await loadTeacherClassSessionContext(db, input.sessionId, uid);
  if (session.status === "canceled") {
    throw new HttpsError("failed-precondition", "Esta aula foi cancelada.");
  }
  if (session.date > todayKey) {
    throw new HttpsError("failed-precondition", "A aula ainda não aconteceu.");
  }

  const wanted = new Set(input.studentIds);
  const tagged = students.filter((s) =>
    wanted.has(s.studentId) && s.mark === "present" && s.storyTaggable && athleteIds.has(s.studentId),
  );
  const presentCount = students.filter((s) => s.mark === "present").length;

  const teacherSnap = await db.collection("users").doc(uid).get();
  const nickname = str(teacherSnap.data()?.["nickname"]);
  const teacherName = str(data["teacherName"]) || str(teacherSnap.data()?.["fullName"]) || "Professor";

  const story = {
    sessionId: input.sessionId,
    arenaId: session.arenaId,
    arenaName: str(data["arenaName"]) || "Arena",
    courtName: str(data["courtName"]),
    classId: session.classId,
    className: session.className,
    classType: str(data["type"]) || "turma",
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    teacherName,
    teacherHandle: nickname ? `@${nickname}` : "",
    presentCount,
    plan: input.plan,
    show: input.show,
    people: tagged.slice(0, CLASS_STORY_PEOPLE_MAX).map((s) => classStoryPerson(s.name, s.photoUrl)),
    taggedCount: tagged.length,
  };

  const col = db.collection(CLASS_STORY_TAGS);
  const previous = await col.where("sessionId", "==", input.sessionId).get();
  const before = new Map(previous.docs.map((d) => [d.id, d]));
  const keep = new Set<string>();
  const fresh: string[] = [];

  for (const s of tagged) {
    const athleteId = athleteIds.get(s.studentId)!;
    const id = classStoryTagId(input.sessionId, athleteId);
    keep.add(id);
    const existed = before.has(id);
    await col.doc(id).set({
      ...story,
      uid: athleteId,
      teacherUserId: uid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existed ? {} : {createdAt: FieldValue.serverTimestamp()}),
    }, {merge: true});
    if (!existed) fresh.push(athleteId);
  }
  for (const [id, doc] of before) {
    if (!keep.has(id)) await doc.ref.delete();
  }

  let notified = 0;
  for (const athleteId of fresh) {
    const tagId = classStoryTagId(input.sessionId, athleteId);
    try {
      await deps.notify({
        userId: athleteId,
        title: "Você está no story do treino",
        body: classStoryTagPushBody(teacherName, session.className),
        type: CLASS_STORY_TAG_NOTIFICATION_TYPE,
        data: {tagId, url: `/story-do-treino/${tagId}`},
      });
      notified += 1;
    } catch (e) {
      logger.warn("shareClassStory: notificação falhou", {sessionId: input.sessionId, athleteId, error: e});
    }
  }
  logger.info("shareClassStory", {sessionId: input.sessionId, tagged: tagged.length, notified});
  return {tagged: tagged.length, notified};
}

export const shareClassStory = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const raw = (request.data ?? {}) as Record<string, unknown>;
  const studentIds = Array.isArray(raw["studentIds"]) ?
    (raw["studentIds"] as unknown[]).map(str).filter(Boolean).slice(0, 60) :
    [];
  return shareClassStoryCore(getFirestore(), {
    sessionId: str(raw["sessionId"]),
    studentIds,
    plan: sanitizeClassStoryPlan(raw["plan"]),
    show: sanitizeClassStoryShow(raw["show"]),
  }, uid, dayKeyFromEventDate(new Date()));
});
