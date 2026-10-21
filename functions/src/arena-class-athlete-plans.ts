/**
 * T14 · Planos e pagamentos do aluno (app do atleta, "Meus treinos").
 *
 * Junta, lado a lado, o que é cobrado PELA ARENA (matrícula em turma, `arenaClassEnrollments`) e o
 * que é cobrado PELO PROFESSOR independente (carteira, `professors/{p}/students/{aluno}`), mais os
 * últimos pagamentos das duas fontes. Matrícula e mensalidade da arena são só da equipe (rules):
 * a leitura sai desta callable, com os dados do próprio aluno e sem CPF, telefone, grupo Asaas ou
 * valores líquidos (precedente: `getMyClassCharges`).
 */
import * as logger from "firebase-functions/logger";
import {onCall} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {
  ARENA_CLASSES,
  ARENA_CLASS_CHARGES,
  ARENA_CLASS_ENROLLMENTS,
} from "./arena-class-constants";
import {PROFESSORS, PROFESSOR_CHARGES, PROFESSOR_PLANS, PROFESSOR_STUDENTS} from "./professor-wallet-model";
import {loadMyClassCredits} from "./arena-class-athlete-actions";
import {requireUid, str} from "./arena-class";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const MAX_ENROLLMENTS = 20;
const MAX_PROFESSOR_LINKS = 20;
const MAX_PAYMENTS = 12;

export interface MyArenaPlanSlot {
  classId: string;
  className: string;
  /** ISO 1 = segunda … 7 = domingo. */
  weekday: number;
  startTime: string;
  teacherName: string;
}

export interface MyArenaPlan {
  enrollmentId: string;
  arenaId: string;
  arenaName: string;
  planName: string;
  /** `monthly`, `package` ou `single`. */
  kind: string;
  priceReais: number;
  classesPerWeek: number | null;
  /** Pacote: aulas restantes e total. */
  creditsLeft: number | null;
  credits: number | null;
  /** `YYYY-MM-DD` — fim do pacote; `null` fora do pacote. */
  expiresOn: string | null;
  startDate: string;
  /** Pago até (mês coberto pela última mensalidade gerada), `YYYY-MM-DD`. */
  billedThrough: string | null;
  dueDay: number | null;
  /** `pix`, `cash`, `card_machine`, `transfer`. */
  paymentMethod: string;
  /** `asaas` = fatura online; `manual` = paga direto à arena. */
  billingMode: string;
  slots: MyArenaPlanSlot[];
  /** Créditos de reposição livres nesta arena. */
  makeupCredits: number;
}

export interface MyProfessorPlan {
  professorUid: string;
  professorName: string;
  professorPhotoUrl: string | null;
  planName: string | null;
  /** `single`, `package`, `monthly` ou `null` sem plano. */
  kind: string | null;
  /** Aulas do pacote / por mês. */
  classes: number | null;
  /** Mensalidade recorrente (o professor cobra todo mês). */
  recurringReais: number | null;
  recurringDueDay: number | null;
  recurringDescription: string | null;
}

export interface MyTrainingPayment {
  /** `arena` ou `professor`. */
  source: "arena" | "professor";
  chargeId: string;
  /** "Arena CFC" ou "Prof. Thiago Mendes". */
  payee: string;
  description: string;
  amountReais: number;
  /** `YYYY-MM-DD`. */
  paidOn: string;
  /** "Pix", "Cartão", "Dinheiro"… */
  method: string;
}

export interface MyTrainingPlans {
  arenaPlans: MyArenaPlan[];
  professorPlans: MyProfessorPlan[];
  payments: MyTrainingPayment[];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function recordOf(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/** Rótulo do meio de pagamento (manual da arena ou `billingType` do Asaas). */
export function paymentMethodLabel(raw: string): string {
  switch (raw.toLowerCase()) {
  case "pix": return "Pix";
  case "cash": return "Dinheiro";
  case "card_machine": return "Maquininha";
  case "transfer": return "Transferência";
  case "credit_card": return "Cartão";
  case "boleto": return "Boleto";
  default: return raw ? "Online" : "";
  }
}

function dayKeyOfTimestamp(v: unknown): string {
  const date = v != null && typeof (v as {toDate?: unknown}).toDate === "function" ?
    (v as {toDate(): Date}).toDate() :
    null;
  return date ? dayKeyFromEventDate(date) : "";
}

async function loadArenaPlans(db: Firestore, uid: string, todayKey: string): Promise<MyArenaPlan[]> {
  const snap = await db.collection(ARENA_CLASS_ENROLLMENTS)
    .where("athleteId", "==", uid)
    .where("status", "==", "active")
    .limit(MAX_ENROLLMENTS)
    .get();
  if (snap.empty) return [];
  const enrollments = snap.docs.map((d) => ({id: d.id, data: d.data() as Record<string, unknown>}));
  const arenaIds = [...new Set(enrollments.map((e) => str(e.data["arenaId"])).filter(Boolean))];
  const classIds = [...new Set(enrollments.flatMap((e) =>
    (Array.isArray(e.data["slots"]) ? e.data["slots"] : []).map((s) => str(recordOf(s)["classId"]))).filter(Boolean))];
  const [arenaSnaps, classSnaps, credits] = await Promise.all([
    arenaIds.length ? db.getAll(...arenaIds.map((id) => db.collection("arenas").doc(id))) : Promise.resolve([]),
    classIds.length ? db.getAll(...classIds.map((id) => db.collection(ARENA_CLASSES).doc(id))) : Promise.resolve([]),
    loadMyClassCredits(db, uid, todayKey).catch((e) => {
      logger.warn(`getMyTrainingPlans ${uid}: créditos falharam`, e);
      return [];
    }),
  ]);
  const arenaNames = new Map(arenaSnaps.map((s) => [s.id, str(s.data()?.["name"]) || "Arena"]));
  const classes = new Map(classSnaps.map((s) => [s.id, (s.data() ?? {}) as Record<string, unknown>]));

  return enrollments.map(({id, data}) => {
    const plan = recordOf(data["plan"]);
    const arenaId = str(data["arenaId"]);
    const kind = str(plan["kind"]) || "monthly";
    const slots = (Array.isArray(data["slots"]) ? data["slots"] : []).map((raw) => {
      const s = recordOf(raw);
      const cls = classes.get(str(s["classId"])) ?? {};
      return {
        classId: str(s["classId"]),
        className: str(s["className"]) || str(cls["name"]) || "Turma",
        weekday: num(s["weekday"]) ?? 0,
        startTime: str(s["startTime"]) || str(cls["startTime"]),
        teacherName: str(cls["teacherName"]),
      };
    }).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    return {
      enrollmentId: id,
      arenaId,
      arenaName: arenaNames.get(arenaId) ?? "Arena",
      planName: str(plan["name"]) || "Plano",
      kind,
      priceReais: num(plan["priceReais"]) ?? 0,
      classesPerWeek: num(plan["classesPerWeek"]),
      creditsLeft: kind === "package" ? num(data["creditsLeft"]) : null,
      credits: kind === "package" ? num(plan["credits"]) : null,
      expiresOn: kind === "package" ? str(data["expiresOn"]) || null : null,
      startDate: str(data["startDate"]),
      billedThrough: str(data["billedThrough"]) || null,
      dueDay: num(data["dueDay"]),
      paymentMethod: str(data["paymentMethod"]),
      billingMode: str(data["billingMode"]) || "manual",
      slots,
      makeupCredits: credits.filter((c) => c.arenaId === arenaId).length,
    };
  }).sort((a, b) => a.arenaName.localeCompare(b.arenaName, "pt-BR") || a.planName.localeCompare(b.planName, "pt-BR"));
}

async function loadProfessorPlans(db: Firestore, uid: string): Promise<MyProfessorPlan[]> {
  const snap = await db.collectionGroup(PROFESSOR_STUDENTS)
    .where("athleteId", "==", uid)
    .where("status", "==", "active")
    .limit(MAX_PROFESSOR_LINKS)
    .get();
  // `professors/{uid}/students/{athleteId}` — outro `students` (de outra coleção) não entra.
  const links = snap.docs.filter((d) => {
    const seg = d.ref.path.split("/");
    return seg.length === 4 && seg[0] === PROFESSORS && seg[3] === uid;
  });
  const plans = await Promise.all(links.map(async (d) => {
    const data = d.data() as Record<string, unknown>;
    const professorUid = d.ref.path.split("/")[1];
    const planId = str(data["planId"]) || str(recordOf(data["recurring"])["planId"]);
    const planSnap = planId ?
      await db.collection(PROFESSORS).doc(professorUid).collection(PROFESSOR_PLANS).doc(planId).get() :
      null;
    const plan = planSnap?.exists ? (planSnap.data() as Record<string, unknown>) : null;
    const recurring = data["recurring"] ? recordOf(data["recurring"]) : null;
    return {
      professorUid,
      professorName: str(data["professorName"]) || "Professor",
      professorPhotoUrl: str(data["professorPhotoUrl"]) || null,
      planName: plan ? str(plan["name"]) || null : null,
      kind: plan ? str(plan["kind"]) || null : null,
      classes: plan ? num(plan["classes"]) : null,
      recurringReais: recurring ? num(recurring["amountReais"]) : null,
      recurringDueDay: recurring ? num(recurring["dueDay"]) : null,
      recurringDescription: recurring ? str(recurring["description"]) || null : null,
    };
  }));
  return plans.sort((a, b) => a.professorName.localeCompare(b.professorName, "pt-BR"));
}

async function loadPayments(db: Firestore, uid: string): Promise<MyTrainingPayment[]> {
  const [arenaSnap, professorSnap] = await Promise.all([
    db.collection(ARENA_CLASS_CHARGES).where("athleteId", "==", uid).where("status", "==", "paid")
      .limit(MAX_PAYMENTS * 2).get(),
    db.collection(PROFESSOR_CHARGES).where("athleteId", "==", uid).where("status", "==", "paid")
      .limit(MAX_PAYMENTS * 2).get()
      .catch((e) => {
        logger.warn(`getMyTrainingPlans ${uid}: pagamentos de professor falharam`, e);
        return null;
      }),
  ]);
  const arenaIds = [...new Set(arenaSnap.docs.map((d) => str(d.data()["arenaId"])).filter(Boolean))];
  const arenas = arenaIds.length ? await db.getAll(...arenaIds.map((id) => db.collection("arenas").doc(id))) : [];
  const arenaNames = new Map(arenas.map((a) => [a.id, str(a.data()?.["name"]) || "Arena"]));
  const out: MyTrainingPayment[] = [
    ...arenaSnap.docs.map((d) => {
      const c = d.data() as Record<string, unknown>;
      return {
        source: "arena" as const,
        chargeId: d.id,
        payee: arenaNames.get(str(c["arenaId"])) ?? "Arena",
        description: str(c["description"]) || "Mensalidade",
        amountReais: num(c["amountReais"]) ?? 0,
        paidOn: str(c["paidOn"]) || dayKeyOfTimestamp(c["paidAt"]),
        method: paymentMethodLabel(str(c["paidVia"]) === "asaas" ? "online" : str(c["paymentMethod"])),
      };
    }),
    ...(professorSnap?.docs ?? []).map((d) => {
      const c = d.data() as Record<string, unknown>;
      return {
        source: "professor" as const,
        chargeId: d.id,
        payee: `Prof. ${str(c["professorName"]) || "Professor"}`,
        description: str(c["description"]) || "Aula",
        amountReais: num(c["amountReais"]) ?? 0,
        paidOn: dayKeyOfTimestamp(c["paidAt"]),
        method: paymentMethodLabel(str(c["billingType"]) || "online"),
      };
    }),
  ];
  return out
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || a.description.localeCompare(b.description, "pt-BR"))
    .slice(0, MAX_PAYMENTS);
}

export async function loadMyTrainingPlansCore(db: Firestore, uid: string, todayKey: string): Promise<MyTrainingPlans> {
  // As três partes são independentes: uma falha na carteira do professor não esconde a da arena.
  const [arenaPlans, professorPlans, payments] = await Promise.all([
    loadArenaPlans(db, uid, todayKey),
    loadProfessorPlans(db, uid).catch((e) => {
      logger.warn(`getMyTrainingPlans ${uid}: carteira do professor falhou`, e);
      return [];
    }),
    loadPayments(db, uid),
  ]);
  return {arenaPlans, professorPlans, payments};
}

export const getMyTrainingPlans = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = requireUid(request.auth);
  return loadMyTrainingPlansCore(getFirestore(), uid, dayKeyFromEventDate(new Date()));
});
