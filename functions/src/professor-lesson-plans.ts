/**
 * Plano de aula do professor (canvas H1–H5, H8): objetivo, blocos (exercícios com tempo e
 * categoria), comentário por bloco (só eu / turma vê) e foco individual por aluno (privado / aluno vê).
 *
 * Privacidade é do SERVIDOR: o plano completo (`lessonPlans/{planId}`) só o professor lê. Publicado,
 * a callable gera uma visão POR ALUNO (`lessonPlanViews/{planId}_{athleteId}`) com objetivo, blocos,
 * só as notas marcadas como visíveis e só o foco DAQUELE aluno, se público. Nota privada e foco de
 * outro aluno nunca saem daqui.
 *
 * O plano se liga a uma aula que o professor dá de fato (o servidor confere):
 * - `session`: `arenaClassSessions/{id}` da turma dele (alunos = matriculados ativos com conta);
 * - `lesson`: `professorLessons/{bookingId}` (aula da carteira com quadra);
 * - `private`: `professorPrivateLessons/{id}` (particular pedida pelo aluno);
 * - `booking`: `arenaBookings/{id}` de turma própria (`professorClassId`; alunos da turma).
 * `planId` = `{uid}_{kind}_{refId}`.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASSES, ARENA_CLASS_SESSIONS} from "./arena-class-constants";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {PROFESSOR_PRIVATE_LESSONS} from "./professor-availability";
import {PROFESSOR_LESSONS} from "./professor-lessons";
import {PROFESSOR_OWN_CLASSES} from "./professor-own-classes";
import {PROFESSORS} from "./professor-wallet-model";

export const LESSON_PLANS = "lessonPlans";
export const LESSON_PLAN_VIEWS = "lessonPlanViews";
export const LESSON_PLAN_PUSH_TYPE = "lesson_plan_published";
export const LESSON_PLAN_KINDS = ["session", "lesson", "private", "booking"] as const;
export type LessonPlanKind = typeof LESSON_PLAN_KINDS[number];
export const LESSON_PLAN_CATEGORIES = ["fisico", "toque", "saque", "devolucao", "voleio", "smash", "jogo", "outro"] as const;
const MAX_BLOCKS = 20;
const MAX_FOCUS = 40;
const MAX_TOTAL_MIN = 240;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function cleanId(v: unknown, message: string): string {
  const id = str(v);
  if (!id || id.includes("/") || id.length > 200) invalid(message);
  return id;
}

export interface PlanBlock {
  id: string;
  exerciseId: string | null;
  name: string;
  detail: string;
  category: string;
  minutes: number;
  note: string;
  notePublic: boolean;
}

export interface PlanFocus {
  athleteId: string;
  text: string;
  public: boolean;
}

export interface LessonPlanInput {
  kind: LessonPlanKind;
  refId: string;
  objective: string;
  tags: string[];
  blocks: PlanBlock[];
  focus: PlanFocus[];
  published: boolean;
  status: "draft" | "ready";
}

export function parseLessonPlanInput(raw: Record<string, unknown>): LessonPlanInput {
  const kind = str(raw["kind"]) as LessonPlanKind;
  if (!(LESSON_PLAN_KINDS as readonly string[]).includes(kind)) invalid("Aula inválida.");
  const refId = cleanId(raw["refId"], "Aula inválida.");
  const objective = str(raw["objective"]).slice(0, 200);
  const cats = LESSON_PLAN_CATEGORIES as readonly string[];
  const tags = Array.isArray(raw["tags"]) ? [...new Set(raw["tags"].map(str).filter((t) => cats.includes(t)))].slice(0, 6) : [];
  const rawBlocks = Array.isArray(raw["blocks"]) ? raw["blocks"] : [];
  if (rawBlocks.length > MAX_BLOCKS) invalid(`Até ${MAX_BLOCKS} blocos por aula.`);
  const blocks: PlanBlock[] = rawBlocks.map((b, i) => {
    const r = (b ?? {}) as Record<string, unknown>;
    const name = str(r["name"]).slice(0, 80);
    if (!name) invalid(`Dê um nome ao bloco ${i + 1}.`);
    const minutes = Number(r["minutes"]);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) invalid(`Tempo do bloco ${i + 1}: de 1 a 120 minutos.`);
    const category = cats.includes(str(r["category"])) ? str(r["category"]) : "outro";
    const exerciseId = str(r["exerciseId"]);
    return {
      id: str(r["id"]).slice(0, 40) || `b${i + 1}`,
      exerciseId: exerciseId && !exerciseId.includes("/") ? exerciseId.slice(0, 120) : null,
      name,
      detail: str(r["detail"]).slice(0, 200),
      category,
      minutes,
      note: str(r["note"]).slice(0, 500),
      notePublic: r["notePublic"] === true,
    };
  });
  if (blocks.reduce((s, b) => s + b.minutes, 0) > MAX_TOTAL_MIN) invalid("O plano passa de 4 horas.");
  const rawFocus = Array.isArray(raw["focus"]) ? raw["focus"] : [];
  if (rawFocus.length > MAX_FOCUS) invalid("Foco individual demais.");
  const seen = new Set<string>();
  const focus: PlanFocus[] = [];
  for (const f of rawFocus) {
    const r = (f ?? {}) as Record<string, unknown>;
    const athleteId = str(r["athleteId"]);
    const text = str(r["text"]).slice(0, 200);
    if (!athleteId || athleteId.includes("/") || !text || seen.has(athleteId)) continue;
    seen.add(athleteId);
    focus.push({athleteId, text, public: r["public"] === true});
  }
  return {
    kind, refId, objective, tags, blocks, focus,
    published: raw["published"] === true,
    status: str(raw["status"]) === "ready" ? "ready" : "draft",
  };
}

export interface ResolvedLesson {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  arenaName: string;
  place: string;
  /** Alunos com conta da aula (quem recebe a visão). */
  students: Array<{athleteId: string; name: string}>;
}

const hhmm = (v: unknown) => /^\d{2}:\d{2}$/.test(str(v)) ? str(v) : "";

/** Confere que a aula é do professor e devolve os dados e os alunos dela. */
export async function resolveLesson(db: Firestore, uid: string, kind: LessonPlanKind, refId: string): Promise<ResolvedLesson> {
  const notFound = () => new HttpsError("not-found", "Aula não encontrada entre as suas.");
  if (kind === "session") {
    const s = (await db.collection(ARENA_CLASS_SESSIONS).doc(refId).get()).data();
    if (!s) throw notFound();
    const classId = str(s["classId"]);
    const cls = (await db.collection(ARENA_CLASSES).doc(classId).get()).data();
    const teacher = str(s["teacherUserId"]) || str(cls?.["teacherUserId"]);
    if (!cls || teacher !== uid) throw notFound();
    const students = await db.collection(ARENA_CLASSES).doc(classId).collection("classStudents").where("status", "==", "active").get();
    return {
      title: str(s["className"]) || str(cls["name"]) || "Turma",
      date: str(s["date"]),
      startTime: hhmm(s["startTime"]),
      endTime: hhmm(s["endTime"]),
      arenaName: str(cls["arenaName"]),
      place: str(s["courtName"]) || str(cls["courtName"]),
      students: students.docs
        .map((d) => ({athleteId: str(d.data()["athleteId"]), name: str(d.data()["name"]) || "Aluno"}))
        .filter((x) => x.athleteId && x.athleteId !== uid),
    };
  }
  if (kind === "lesson" || kind === "private") {
    const coll = kind === "lesson" ? PROFESSOR_LESSONS : PROFESSOR_PRIVATE_LESSONS;
    const l = (await db.collection(coll).doc(refId).get()).data();
    if (!l || str(l["professorUid"]) !== uid) throw notFound();
    const athleteId = str(l["athleteId"]);
    const athleteName = str(l["athleteName"]) || str(l["studentName"]) || "Aluno";
    if (kind === "private") {
      const start = l["startAt"] as FirebaseFirestore.Timestamp | undefined;
      const end = l["endAt"] as FirebaseFirestore.Timestamp | undefined;
      const fmt = (t?: FirebaseFirestore.Timestamp) => t ? t.toDate().toLocaleTimeString("pt-BR", {timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"}) : "";
      return {
        title: `Particular · ${athleteName}`,
        date: str(l["date"]) || (start ? dayKeyFromEventDate(start.toDate()) : ""),
        startTime: fmt(start), endTime: fmt(end), arenaName: "", place: "",
        students: athleteId ? [{athleteId, name: athleteName}] : [],
      };
    }
    return {
      title: `Aula · ${athleteName}`,
      date: str(l["date"]), startTime: hhmm(l["startTime"]), endTime: hhmm(l["endTime"]),
      arenaName: str(l["arenaName"]), place: str(l["courtName"]),
      students: athleteId ? [{athleteId, name: athleteName}] : [],
    };
  }
  const b = (await db.collection("arenaBookings").doc(refId).get()).data();
  const classId = str(b?.["professorClassId"]);
  if (!b || str(b["athleteId"]) !== uid || b["bookedAs"] !== "professor" || !classId) throw notFound();
  const own = (await db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_OWN_CLASSES).doc(classId).get()).data();
  if (!own) throw notFound();
  const ids = Array.isArray(own["studentIds"]) ? (own["studentIds"] as unknown[]).map(str).filter(Boolean) : [];
  const users = await Promise.all(ids.map((id) => db.collection("users").doc(id).get()));
  return {
    title: str(own["name"]) || "Turma própria",
    date: str(b["date"]), startTime: hhmm(b["startTime"]), endTime: hhmm(b["endTime"]),
    arenaName: str(b["arenaName"]), place: str(b["courtName"]),
    students: ids.map((id, i) => ({athleteId: id, name: str(users[i].data()?.["fullName"]) || str(users[i].data()?.["nickname"]) || "Aluno"})),
  };
}

export const lessonPlanId = (uid: string, kind: string, refId: string) => `${uid}_${kind}_${refId}`;
export const lessonPlanViewId = (planId: string, athleteId: string) => `${planId}_${athleteId}`;

/** O que o aluno vê: sem nota privada, só o foco dele (se público). */
export function studentViewOf(plan: {objective: string; tags: string[]; blocks: PlanBlock[]; focus: PlanFocus[]}, athleteId: string) {
  const mine = plan.focus.find((f) => f.athleteId === athleteId && f.public);
  return {
    objective: plan.objective,
    tags: plan.tags,
    durationMin: plan.blocks.reduce((s, b) => s + b.minutes, 0),
    blocks: plan.blocks.map((b) => ({name: b.name, category: b.category, minutes: b.minutes, note: b.notePublic ? b.note : ""})),
    myFocus: mine ? mine.text : null,
  };
}

export interface LessonPlanDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

const defaultDeps: LessonPlanDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

export async function saveLessonPlanCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: LessonPlanDeps = defaultDeps,
): Promise<{planId: string; viewCount: number}> {
  const input = parseLessonPlanInput(raw);
  const lesson = await resolveLesson(db, uid, input.kind, input.refId);
  const studentIds = new Set(lesson.students.map((s) => s.athleteId));
  // Foco só de quem é aluno desta aula.
  const focus = input.focus.filter((f) => studentIds.has(f.athleteId));
  const planId = lessonPlanId(uid, input.kind, input.refId);
  const ref = db.collection(LESSON_PLANS).doc(planId);
  const before = (await ref.get()).data();
  const professor = (await db.collection("users").doc(uid).get()).data();
  const professorName = str(professor?.["fullName"]) || str(professor?.["nickname"]) || "Seu professor";
  const now = deps.now();
  const names = Object.fromEntries(lesson.students.map((s) => [s.athleteId, s.name]));
  const firstPublish = input.published && before?.["publishedAt"] == null;
  await ref.set({
    professorUid: uid,
    kind: input.kind,
    refId: input.refId,
    title: lesson.title,
    date: lesson.date,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    arenaName: lesson.arenaName,
    place: lesson.place,
    objective: input.objective,
    tags: input.tags,
    blocks: input.blocks,
    focus: focus.map((f) => ({...f, name: names[f.athleteId] ?? "Aluno"})),
    durationMin: input.blocks.reduce((s, b) => s + b.minutes, 0),
    published: input.published,
    status: input.status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(before ? {} : {createdAt: FieldValue.serverTimestamp()}),
    ...(firstPublish ? {publishedAt: FieldValue.serverTimestamp()} : {}),
  }, {merge: true});

  // Refaz as visões: publicado = uma por aluno atual; despublicado/ex-aluno = apaga.
  const existing = await db.collection(LESSON_PLAN_VIEWS).where("planId", "==", planId).get();
  const batch = db.batch();
  const keep = new Set<string>();
  if (input.published) {
    for (const s of lesson.students) {
      const id = lessonPlanViewId(planId, s.athleteId);
      keep.add(id);
      batch.set(db.collection(LESSON_PLAN_VIEWS).doc(id), {
        planId,
        athleteId: s.athleteId,
        professorUid: uid,
        professorName,
        lessonTitle: lesson.title,
        kind: input.kind,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        arenaName: lesson.arenaName,
        place: lesson.place,
        ...studentViewOf({...input, focus}, s.athleteId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  for (const d of existing.docs) if (!keep.has(d.id)) batch.delete(d.ref);
  await batch.commit();

  if (firstPublish && lesson.date >= dayKeyFromEventDate(now)) {
    await Promise.all(lesson.students.map(async (s) => {
      try {
        await deps.notify({
          userId: s.athleteId,
          title: `Plano da aula · ${lesson.title}`,
          body: input.objective || `${professorName} publicou o roteiro da próxima aula.`,
          type: LESSON_PLAN_PUSH_TYPE,
          data: {viewId: lessonPlanViewId(planId, s.athleteId), url: `/aula/plano/${lessonPlanViewId(planId, s.athleteId)}`},
        });
      } catch (e) {
        logger.warn(`lessonPlan ${planId}: push para ${s.athleteId} falhou`, e);
      }
    }));
  }
  return {planId, viewCount: keep.size};
}

export async function deleteLessonPlanCore(db: Firestore, uid: string, raw: Record<string, unknown>): Promise<void> {
  const planId = cleanId(raw["planId"], "Plano inválido.");
  const ref = db.collection(LESSON_PLANS).doc(planId);
  const plan = (await ref.get()).data();
  if (!plan || plan["professorUid"] !== uid) throw new HttpsError("not-found", "Plano não encontrado.");
  const views = await db.collection(LESSON_PLAN_VIEWS).where("planId", "==", planId).get();
  const batch = db.batch();
  for (const d of views.docs) batch.delete(d.ref);
  batch.delete(ref);
  await batch.commit();
}

/** Alunos da aula (para o foco individual) — o professor ainda não tem plano salvo. */
export async function getLessonStudentsCore(db: Firestore, uid: string, raw: Record<string, unknown>) {
  const kind = str(raw["kind"]) as LessonPlanKind;
  if (!(LESSON_PLAN_KINDS as readonly string[]).includes(kind)) invalid("Aula inválida.");
  const lesson = await resolveLesson(db, uid, kind, cleanId(raw["refId"], "Aula inválida."));
  return {planId: lessonPlanId(uid, kind, str(raw["refId"])), ...lesson};
}

// ---------------------------------------------------------------------------

function requireUid(r: CallableRequest): string {
  const uid = r.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

const dataOf = (r: CallableRequest) => (r.data ?? {}) as Record<string, unknown>;

export const saveLessonPlan = onCall({
  region: CLIENT_FACING_REGIONS, timeoutSeconds: 60, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (r) => saveLessonPlanCore(getFirestore(), requireUid(r), dataOf(r)));

export const deleteLessonPlan = onCall({region: CLIENT_FACING_REGIONS}, async (r) => {
  await deleteLessonPlanCore(getFirestore(), requireUid(r), dataOf(r));
  return {ok: true};
});

export const getLessonStudents = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  getLessonStudentsCore(getFirestore(), requireUid(r), dataOf(r)));
