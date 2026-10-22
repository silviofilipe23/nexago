/**
 * Conta de recebimento do Centro de Treinamento criada pelo próprio centro: subconta Asaas sob a
 * conta NexaGO (`POST /v3/accounts`), como a carteira do professor (`professor-wallet.ts`).
 *
 * - `createTrainingCenterReceivingAccount` (callable, só o OWNER): cria a subconta, grava o
 *   `walletId` em `trainingCenterReceiving/{c}` (só servidor; é para onde vai o split) e a `apiKey`
 *   da subconta cifrada em `trainingCenterAsaasSecrets/{c}`.
 * - `refreshTrainingCenterReceivingStatus` (callable, owner/admin) e a varredura de hora em hora
 *   consultam a situação e os documentos pendentes no Asaas. Aprovada → `receivingConnected`
 *   liga sozinho e as cobranças online passam a sair com link.
 * - O que o portal lê fica em `trainingCenters/{c}/receivingAccount/current` (owner/admin) e
 *   `trainingCenters/{c}.receivingStatus` (todos os membros, para o passo da ativação).
 *
 * Conectar uma conta Asaas que o centro JÁ tem (walletId informado) continua só pelo time NexaGO
 * (backoffice/script): `walletId` digitado por quem tem acesso ao portal desviaria o dinheiro.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas, getAsaasEnvTag} from "./asaas-client";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {openSecret, PROFESSOR_SECRETS_KEY, sealSecret} from "./professor-secret-box";
import {TRAINING_CENTERS, TRAINING_CENTER_RECEIVING} from "./training-center-billing-model";
import {
  documentsFromAsaas,
  maskDocument,
  parseCenterAccountInput,
  receivingStatusFromAsaas,
  type CenterAccountInput,
  type ReceivingDocument,
  type ReceivingStatus,
} from "./training-center-receiving-model";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export const TRAINING_CENTER_ASAAS_SECRETS = "trainingCenterAsaasSecrets";
const ACCOUNT_CREATING_LOCK_MS = 2 * 60_000;

export interface ReceivingDeps {
  now: () => Date;
  env: () => string;
  createAccount: (input: CenterAccountInput) => Promise<{accountId: string; walletId: string; apiKey: string | null}>;
  findAccount: (cpfCnpj: string) => Promise<{accountId: string; walletId: string} | null>;
  accountStatus: (apiKey: string) => Promise<{general: string}>;
  documents: (apiKey: string) => Promise<ReceivingDocument[]>;
  sealKey: (apiKey: string) => string;
  openKey: (sealed: string) => string;
}

function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

export const defaultReceivingDeps: ReceivingDeps = {
  now: () => new Date(),
  env: () => getAsaasEnvTag(),
  createAccount: async (input) => {
    assertAsaasAllowed();
    const created = await fetchAsaas<{id?: string; walletId?: string; apiKey?: string; accessToken?: {apiKey?: string} | string}>("/v3/accounts", {
      method: "POST",
      body: {
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        ...(input.companyType ? {companyType: input.companyType} : {}),
        ...(input.birthDate ? {birthDate: input.birthDate} : {}),
        mobilePhone: input.mobilePhone,
        incomeValue: input.incomeValue,
        address: input.address,
        addressNumber: input.addressNumber,
        complement: input.complement ?? undefined,
        province: input.province,
        postalCode: input.postalCode,
      },
      idempotencyKey: `center-account-${getAsaasEnvTag()}-${input.cpfCnpj}`,
    });
    const token = created.accessToken;
    const apiKey = (typeof token === "string" ? token : token?.apiKey) ?? created.apiKey ?? "";
    const accountId = created.id?.trim() ?? "";
    const walletId = created.walletId?.trim() ?? "";
    if (!accountId || !walletId) throw new Error("ASAAS_ACCOUNT_MISSING_IDS");
    return {accountId, walletId, apiKey: apiKey.trim() || null};
  },
  findAccount: async (cpfCnpj) => {
    const list = await fetchAsaas<{data?: Array<{id?: string; walletId?: string}>}>(`/v3/accounts?cpfCnpj=${encodeURIComponent(cpfCnpj)}`);
    const hit = (list.data ?? []).find((a) => a.id && a.walletId);
    return hit ? {accountId: String(hit.id), walletId: String(hit.walletId)} : null;
  },
  accountStatus: async (apiKey) => {
    const s = await fetchAsaas<{general?: string}>("/v3/myAccount/status/", {apiKey});
    return {general: s.general ?? "PENDING"};
  },
  documents: async (apiKey) => documentsFromAsaas(await fetchAsaas<unknown>("/v3/myAccount/documents", {apiKey})),
  sealKey: (apiKey) => sealSecret(apiKey, PROFESSOR_SECRETS_KEY.value()),
  openKey: (sealed) => openSecret(sealed, PROFESSOR_SECRETS_KEY.value()),
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const centerRef = (db: Firestore, c: string) => db.collection(TRAINING_CENTERS).doc(c);
const receivingRef = (db: Firestore, c: string) => db.collection(TRAINING_CENTER_RECEIVING).doc(c);
const secretRef = (db: Firestore, c: string) => db.collection(TRAINING_CENTER_ASAAS_SECRETS).doc(c);
const mirrorRef = (db: Firestore, c: string) => centerRef(db, c).collection("receivingAccount").doc("current");

function parseCenterId(raw: unknown): string {
  const centerId = str((raw && typeof raw === "object" ? raw as Data : {})["centerId"]);
  if (!centerId || centerId.includes("/")) throw new HttpsError("invalid-argument", "Centro inválido.");
  return centerId;
}

async function memberOf(db: Firestore, uid: string | undefined, centerId: string): Promise<{uid: string; role: string; name: string}> {
  if (!uid) throw new HttpsError("unauthenticated", "Entre de novo.");
  const m = (await centerRef(db, centerId).collection("centerMembers").doc(uid).get()).data();
  if (!m || m["status"] !== "active") throw new HttpsError("permission-denied", "Você não tem acesso a este centro.");
  return {uid, role: str(m["role"]), name: str(m["displayName"]) || "Owner"};
}

function audit(at: Timestamp, actor: {uid: string; name: string}, action: string, centerId: string, detail: string): Data {
  return {at, actorUid: actor.uid, actorName: actor.name, action, entity: "center", entityId: centerId, detail, reason: ""};
}

export interface CreateResult {
  status: ReceivingStatus;
}

export async function createCenterReceivingAccountCore(db: Firestore, uid: string | undefined, raw: unknown, deps: ReceivingDeps = defaultReceivingDeps): Promise<CreateResult> {
  const centerId = parseCenterId(raw);
  const actor = await memberOf(db, uid, centerId);
  // Dinheiro: só o dono do centro abre a conta que recebe (admin vê a situação, não cria).
  if (actor.role !== "center_owner") throw new HttpsError("permission-denied", "Só o owner do centro cria a conta de recebimento.");
  const center = (await centerRef(db, centerId).get()).data();
  if (!center) throw new HttpsError("not-found", "Centro não encontrado.");
  if (center["status"] === "suspended") throw new HttpsError("failed-precondition", "Centro suspenso.");
  const now = deps.now();
  const input = parseCenterAccountInput((raw ?? {}) as Data, dayKeyIn(now, str(center["timezone"])));
  const env = deps.env();
  const at = Timestamp.fromDate(now);

  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(receivingRef(db, centerId))).data();
    if (cur && str(cur["walletId"]) && (!cur["asaasEnv"] || cur["asaasEnv"] === env)) {
      throw new HttpsError("already-exists", "Este centro já tem conta de recebimento.");
    }
    if (cur?.["status"] === "creating" && now.getTime() - Number(cur["creatingAt"] ?? 0) < ACCOUNT_CREATING_LOCK_MS) {
      throw new HttpsError("aborted", "A conta já está sendo criada. Aguarde um instante.");
    }
    tx.set(receivingRef(db, centerId), {status: "creating", creatingAt: now.getTime(), asaasEnv: env}, {merge: true});
  });

  let created: {accountId: string; walletId: string; apiKey: string | null};
  try {
    created = await deps.createAccount(input);
  } catch (e) {
    // Tentativa anterior criou no Asaas e não chegou a gravar: adota a subconta do mesmo documento
    // (sem a apiKey, que só vem na criação — fica "em análise" até o time NexaGO conferir).
    const adopted = e instanceof AsaasApiError && e.httpStatus === 400 ? await deps.findAccount(input.cpfCnpj).catch(() => null) : null;
    if (!adopted) {
      await receivingRef(db, centerId).set({status: "failed", creatingAt: 0}, {merge: true});
      await mirrorRef(db, centerId).set({status: "failed", updatedAt: at}, {merge: true});
      if (e instanceof AsaasApiError) throw new HttpsError("failed-precondition", e.message || "O Asaas recusou o cadastro.");
      logger.error(`createTrainingCenterReceivingAccount ${centerId}`, e);
      throw new HttpsError("internal", "Não foi possível criar a conta de recebimento. Tente de novo.");
    }
    logger.warn(`createTrainingCenterReceivingAccount ${centerId}: subconta ${adopted.accountId} já existia; adotada sem apiKey`);
    created = {...adopted, apiKey: null};
  }

  const batch = db.batch();
  batch.set(receivingRef(db, centerId), {
    walletId: created.walletId,
    asaasAccountId: created.accountId,
    asaasEnv: env,
    source: "self",
    status: "pending",
    creatingAt: 0,
    createdByUid: actor.uid,
    updatedAt: at,
  }, {merge: true});
  if (created.apiKey) batch.set(secretRef(db, centerId), {sealedApiKey: deps.sealKey(created.apiKey), asaasEnv: env, createdAt: at});
  batch.set(mirrorRef(db, centerId), {
    status: "pending",
    source: "self",
    personType: input.personType,
    name: input.name,
    email: input.email,
    document: maskDocument(input.cpfCnpj),
    documents: [],
    createdAt: at,
    createdByName: actor.name,
    statusCheckedAt: null,
    updatedAt: at,
  });
  batch.update(centerRef(db, centerId), {receivingStatus: "pending"});
  batch.set(centerRef(db, centerId).collection("auditLogs").doc(), audit(at, actor, "center.receiving_created", centerId,
    `Conta de recebimento criada no Asaas (${input.personType === "company" ? "CNPJ" : "CPF"} ${maskDocument(input.cpfCnpj)}) · em análise`));
  await batch.commit();

  // Documentos pendentes já na hora (o Asaas costuma pedir na sequência da criação).
  await refreshCenterReceivingCore(db, centerId, deps).catch((e) => logger.warn(`receiving ${centerId}: 1ª consulta falhou`, e));
  return {status: "pending"};
}

export interface RefreshResult {
  status: ReceivingStatus | null;
  documents: number;
}

/** Consulta situação e documentos no Asaas; aprovada liga o recebimento do centro. */
export async function refreshCenterReceivingCore(db: Firestore, centerId: string, deps: ReceivingDeps = defaultReceivingDeps): Promise<RefreshResult> {
  const rec = (await receivingRef(db, centerId).get()).data();
  if (!rec || !str(rec["walletId"]) || rec["source"] !== "self") return {status: null, documents: 0};
  const sealed = str((await secretRef(db, centerId).get()).data()?.["sealedApiKey"]);
  const current = (str(rec["status"]) || "pending") as ReceivingStatus;
  if (!sealed) return {status: current, documents: 0};
  const apiKey = deps.openKey(sealed);
  const {general} = await deps.accountStatus(apiKey);
  const status = receivingStatusFromAsaas(general);
  const documents = status === "approved" ? [] : await deps.documents(apiKey).catch(() => [] as ReceivingDocument[]);
  const at = Timestamp.fromDate(deps.now());

  await db.runTransaction(async (tx) => {
    const center = (await tx.get(centerRef(db, centerId))).data();
    tx.set(receivingRef(db, centerId), {status, updatedAt: at}, {merge: true});
    tx.set(mirrorRef(db, centerId), {status, documents, statusCheckedAt: at, updatedAt: at}, {merge: true});
    if (!center) return;
    const patch: Data = {};
    if (center["receivingStatus"] !== status) patch["receivingStatus"] = status;
    if (status === "approved" && center["receivingConnected"] !== true) patch["receivingConnected"] = true;
    if (Object.keys(patch).length) tx.update(centerRef(db, centerId), patch);
    if (status !== current && (status === "approved" || status === "rejected")) {
      tx.set(centerRef(db, centerId).collection("auditLogs").doc(), audit(at, {uid: "system", name: "Sistema"}, `center.receiving_${status}`, centerId,
        status === "approved" ? "Conta de recebimento aprovada pelo Asaas · cobranças online liberadas" : "Conta de recebimento recusada pelo Asaas"));
    }
  });
  return {status, documents: documents.length};
}

export async function refreshCenterReceivingCallableCore(db: Firestore, uid: string | undefined, raw: unknown, deps: ReceivingDeps = defaultReceivingDeps): Promise<RefreshResult> {
  const centerId = parseCenterId(raw);
  const actor = await memberOf(db, uid, centerId);
  if (actor.role !== "center_owner" && actor.role !== "center_admin") throw new HttpsError("permission-denied", "Só owner ou admin consulta a conta de recebimento.");
  try {
    return await refreshCenterReceivingCore(db, centerId, deps);
  } catch (e) {
    logger.warn(`refreshTrainingCenterReceivingStatus ${centerId}`, e);
    throw new HttpsError("unavailable", "Não foi possível consultar o Asaas agora. Tente de novo em instantes.");
  }
}

const SECRETS = [...asaasArenaSecrets, PROFESSOR_SECRETS_KEY];

export const createTrainingCenterReceivingAccount = onCall({region: CLIENT_FACING_REGIONS, secrets: SECRETS},
  async (request: CallableRequest) => createCenterReceivingAccountCore(getFirestore(), request.auth?.uid, request.data));

export const refreshTrainingCenterReceivingStatus = onCall({region: CLIENT_FACING_REGIONS, secrets: SECRETS},
  async (request: CallableRequest) => refreshCenterReceivingCallableCore(getFirestore(), request.auth?.uid, request.data));

/** De hora em hora: contas em análise (o Asaas aprova sem avisar a gente). */
export async function sweepCenterReceivingCore(db: Firestore, deps: ReceivingDeps = defaultReceivingDeps): Promise<number> {
  const pending = await db.collection(TRAINING_CENTER_RECEIVING).where("status", "==", "pending").get();
  let changed = 0;
  for (const doc of pending.docs) {
    try {
      const r = await refreshCenterReceivingCore(db, doc.id, deps);
      if (r.status && r.status !== "pending") changed++;
    } catch (e) {
      logger.warn(`sweepTrainingCenterReceiving ${doc.id}`, e);
    }
  }
  return changed;
}

export const sweepTrainingCenterReceiving = onSchedule({schedule: "every 60 minutes", timeZone: "America/Sao_Paulo", secrets: SECRETS},
  async () => {
    await sweepCenterReceivingCore(getFirestore());
  });
