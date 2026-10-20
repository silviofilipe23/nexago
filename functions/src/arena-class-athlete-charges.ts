/**
 * Mensalidades de aula em aberto do atleta (app e portal web) — "Mensalidade a pagar".
 *
 * `arenaClassCharges` continua só da equipe da arena (rules): a lista sai desta callable, montada
 * no servidor com as mensalidades do próprio atleta (`athleteId`) e sem telefone, CPF ou grupo de
 * pagamento (precedente: `getMyClassAgenda`). O link da fatura só vai quando dá para pagar —
 * mensalidade `open` com o espelho Asaas `open`, a mesma regra de `chargeInvoiceUrl` no portal da
 * arena. Cobrança manual (ou sem CPF) é só informativa: o aluno paga direto à arena.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASS_CHARGES} from "./arena-class-constants";
import {PROFESSOR_CHARGES} from "./professor-wallet-model";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const MAX_CHARGES = 50;

/** Grupo ainda vai (ou volta a) ter fatura: criando, retentando ou reagrupando após uma anulação. */
const PREPARING_STATES = new Set(["pending", "creating", "failed", "voiding"]);

export interface MyClassChargeItem {
  chargeId: string;
  arenaId: string;
  arenaName: string;
  description: string;
  amountReais: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  overdue: boolean;
  /** `online` = fatura pronta (`invoiceUrl`); `preparing` = link sendo gerado; `manual` = paga direto à arena. */
  payment: "online" | "preparing" | "manual";
  invoiceUrl: string | null;
  /** `professor`: cobrança do professor independente (`arenaName` = "Prof. Fulano", sem arena). */
  source: "arena" | "professor";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function recordOf(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/** Item da lista; `null` para mensalidade que não está em aberto. */
export function myClassChargeItem(
  chargeId: string,
  data: Record<string, unknown>,
  arenaName: string,
  todayKey: string,
): MyClassChargeItem | null {
  if (data["status"] !== "open") return null;
  const asaas = recordOf(data["asaas"]);
  const state = str(asaas["state"]);
  const invoiceUrl = state === "open" ? str(asaas["invoiceUrl"]) || null : null;
  const dueDate = str(data["dueDate"]);
  return {
    chargeId,
    arenaId: str(data["arenaId"]),
    arenaName,
    description: str(data["description"]) || "Mensalidade",
    amountReais: Number(data["amountReais"] ?? 0),
    dueDate,
    overdue: dueDate !== "" && dueDate < todayKey,
    payment: invoiceUrl ? "online" : PREPARING_STATES.has(state) ? "preparing" : "manual",
    invoiceUrl,
    source: "arena",
  };
}

/** Cobrança em aberto do professor independente (`professorCharges`); `null` fora de "em aberto". */
export function myProfessorChargeItem(chargeId: string, data: Record<string, unknown>, todayKey: string): MyClassChargeItem | null {
  const status = data["status"];
  if (status !== "open" && status !== "creating") return null;
  const invoiceUrl = status === "open" ? str(data["invoiceUrl"]) || null : null;
  const dueDate = str(data["dueDate"]);
  return {
    chargeId,
    arenaId: "",
    arenaName: `Prof. ${str(data["professorName"]) || "Professor"}`,
    description: str(data["description"]) || "Aula",
    amountReais: Number(data["amountReais"] ?? 0),
    dueDate,
    overdue: dueDate !== "" && dueDate < todayKey,
    payment: invoiceUrl ? "online" : "preparing",
    invoiceUrl,
    source: "professor",
  };
}

/** Mensalidades em aberto do atleta, da que vence primeiro (vencidas no topo). */
export async function loadMyClassCharges(db: Firestore, uid: string, todayKey: string): Promise<MyClassChargeItem[]> {
  // Só igualdades: os índices de campo único bastam.
  // As do professor em paralelo e tolerantes a falha: um erro nelas não pode esconder as da arena.
  const professorQuery = db.collection(PROFESSOR_CHARGES)
    .where("athleteId", "==", uid)
    .where("status", "in", ["open", "creating"])
    .limit(MAX_CHARGES)
    .get()
    .catch((e) => {
      logger.warn(`loadMyClassCharges ${uid}: cobranças de professor falharam`, e);
      return null;
    });
  const snap = await db.collection(ARENA_CLASS_CHARGES)
    .where("athleteId", "==", uid)
    .where("status", "==", "open")
    .limit(MAX_CHARGES)
    .get();
  const arenaIds = [...new Set(snap.docs.map((d) => str(d.data()["arenaId"])).filter(Boolean))];
  const arenas = arenaIds.length > 0 ? await db.getAll(...arenaIds.map((id) => db.collection("arenas").doc(id))) : [];
  const arenaNames = new Map(arenas.map((a) => [a.id, str(a.data()?.["name"]) || "Arena"]));

  const professorSnap = await professorQuery;

  return [
    ...snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return myClassChargeItem(d.id, data, arenaNames.get(str(data["arenaId"])) ?? "Arena", todayKey);
    }),
    ...(professorSnap?.docs ?? []).map((d) => myProfessorChargeItem(d.id, d.data() as Record<string, unknown>, todayKey)),
  ]
    .filter((item): item is MyClassChargeItem => item != null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.description.localeCompare(b.description, "pt-BR"));
}

export const getMyClassCharges = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const items = await loadMyClassCharges(getFirestore(), uid, dayKeyFromEventDate(new Date()));
  return {items};
});
