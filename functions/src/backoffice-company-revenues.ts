/**
 * Backoffice › Financeiro › Resultado: lança e anula receita avulsa (`companyRevenues`) — dinheiro
 * que entrou fora do Asaas, como a mensalidade de plano de arena paga por PIX direto. Regras em
 * `company-revenues.ts`; a soma no Resultado em `company-finance.ts` (`addCompanyRevenue`).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {assertBackofficeAdmin} from "./backoffice-finance";
import {
  COMPANY_REVENUES,
  parseRecordRevenueInput,
  parseVoidRevenueInput,
  planRecordRevenue,
  planVoidRevenue,
  saoPauloToday,
  type RecordRevenueInput,
} from "./company-revenues";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const, timeoutSeconds: 30};

async function requireAdmin(uid: string | undefined): Promise<string> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  await assertBackofficeAdmin(uid);
  return uid;
}

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    throw new HttpsError("invalid-argument", (e as Error).message);
  }
}

/** Grava a receita; a checagem de lançamento em dobro roda na mesma transação. */
export async function recordRevenue(db: Firestore, uid: string, input: RecordRevenueInput): Promise<{id: string}> {
  const arenaRef = db.collection("arenas").doc(input.arenaId);
  const sameArena = db.collection(COMPANY_REVENUES).where("arenaId", "==", input.arenaId);
  const ref = db.collection(COMPANY_REVENUES).doc();
  return db.runTransaction(async (tx) => {
    const [arena, revenues] = await Promise.all([tx.get(arenaRef), tx.get(sameArena)]);
    const plan = planRecordRevenue({
      input,
      arena: arena.exists ? arena.data() ?? {} : null,
      arenaRevenues: revenues.docs.map((d) => d.data()),
      uid,
    });
    if (plan.status === "error") throw new HttpsError("failed-precondition", plan.message);
    const now = FieldValue.serverTimestamp();
    tx.create(ref, {...plan.record, createdAt: now, updatedAt: now});
    return {id: ref.id};
  });
}

/** Anula (não apaga): some do Resultado e da lista, o registro fica com quem anulou e por quê. */
export async function voidRevenue(db: Firestore, uid: string, id: string, reason: string): Promise<{changed: boolean}> {
  const ref = db.collection(COMPANY_REVENUES).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const plan = planVoidRevenue(snap.exists ? snap.data() ?? {} : null);
    if (plan.status === "error") throw new HttpsError("not-found", plan.message);
    if (plan.status === "unchanged") return {changed: false};
    const now = FieldValue.serverTimestamp();
    tx.update(ref, {voidedAt: now, voidedBy: uid, voidReason: reason || null, updatedAt: now});
    return {changed: true};
  });
}

export const recordCompanyRevenue = onCall(CALLABLE, async (request) => {
  const uid = await requireAdmin(request.auth?.uid);
  const input = parsed(() => parseRecordRevenueInput(request.data, saoPauloToday()));
  const result = await recordRevenue(getFirestore(), uid, input);
  logger.info(`recordCompanyRevenue: ${result.id} ${input.source} arena ${input.arenaId} ` +
    `${input.amountCents} centavos em ${input.receivedOn} por ${uid}`);
  return result;
});

export const voidCompanyRevenue = onCall(CALLABLE, async (request) => {
  const uid = await requireAdmin(request.auth?.uid);
  const {id, reason} = parsed(() => parseVoidRevenueInput(request.data));
  const result = await voidRevenue(getFirestore(), uid, id, reason);
  if (result.changed) logger.info(`voidCompanyRevenue: ${id} anulada por ${uid}`);
  return result;
});
