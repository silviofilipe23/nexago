/**
 * Carteira do professor independente: conta de recebimento (subconta Asaas), planos, alunos e
 * cobranças com split para a subconta. Spec:
 * `docs/superpowers/specs/2026-10-20-professor-app-carteira-independente-design.md`.
 *
 * Tudo que mexe em dinheiro passa por aqui (callables); o professor só LÊ as próprias coleções pelas
 * rules. As chamadas ao Asaas entram por [ProfessorWalletDeps] para os testes não tocarem a rede.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError, type CallableRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {FieldValue, getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas, getAsaasEnvTag} from "./asaas-client";
import {deleteAsaasPaymentOrThrow, type AsaasPaymentDetails} from "./asaas-booking-payment";
import {getOrCreateAsaasCustomer, resolveAthleteCpfCnpj} from "./asaas-customer";
import {maskCpfCnpj} from "./arena-class-asaas-model";
import {closeDirectConversation, isStudentOfProfessor} from "./professor-messages";
import {openSecret, PROFESSOR_SECRETS_KEY, sealSecret} from "./professor-secret-box";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {
  PROFESSOR_ASAAS_SECRETS,
  PROFESSOR_CHARGE_FEE_PERCENT,
  PROFESSOR_CHARGE_FINE_PERCENT,
  PROFESSOR_CHARGE_INTEREST_PERCENT,
  PROFESSOR_CHARGE_REF_PREFIX,
  PROFESSOR_CHARGES,
  PROFESSOR_PAYOUT_ACCOUNTS,
  PROFESSOR_PLANS,
  PROFESSOR_STUDENTS,
  PROFESSORS,
  dueDateFor,
  parseProfessorAccountInput,
  parseProfessorChargeRef,
  parseProfessorChargeRequest,
  parseProfessorPlanInput,
  periodOf,
  professorAccountStatusFromAsaas,
  professorChargeStatusFromAsaas,
  professorSplitPercent,
  recurringChargeId,
  recurringPeriodDue,
  type ProfessorAccountInput,
  type ProfessorAccountStatus,
  type ProfessorPlanData,
} from "./professor-wallet-model";

export const PROFESSOR_CHARGE_LINK_TYPE = "professor_charge_link";
export const PROFESSOR_STUDENT_INVITE_TYPE = "professor_student_invite";
/** Cobrança do professor paga: o app abre "Pagamento confirmado" (B17). */
export const PROFESSOR_CHARGE_PAID_TYPE = "professor_charge_paid";
/** Onde o aluno vê as cobranças no app (a mesma lista das mensalidades de aula). */
export const PROFESSOR_CHARGE_APP_URL = "/discover?tab=agenda";

export interface ProfessorWalletDeps {
  now: () => Date;
  env: () => string;
  createAccount: (input: ProfessorAccountInput) => Promise<{accountId: string; walletId: string; apiKey: string | null}>;
  /** Subconta já existente com esse CPF (criada numa tentativa que não chegou a gravar). */
  findAccountByCpf: (cpfCnpj: string) => Promise<{accountId: string; walletId: string} | null>;
  accountStatus: (apiKey: string) => Promise<{general: string; documentation: string | null}>;
  /** Cifra/decifra a `apiKey` da subconta (`PROFESSOR_SECRETS_KEY`). */
  sealKey: (apiKey: string) => string;
  openKey: (sealed: string) => string;
  /** Cliente Asaas do aluno pelo CPF do cadastro; lança `ASAAS_CUSTOMER_CPF_REQUIRED` sem CPF. */
  customerFor: (athleteId: string) => Promise<string>;
  createPayment: (input: {
    customerId: string;
    valueReais: number;
    dueDate: string;
    description: string;
    chargeId: string;
    walletId: string;
    splitPercent: number;
  }) => Promise<{paymentId: string; invoiceUrl: string; status: string}>;
  deletePayment: (paymentId: string) => Promise<void>;
  /** Pagamento vivo com `professorCharge:{id}` (falha ambígua na criação). */
  findPayment: (chargeId: string) => Promise<{paymentId: string; invoiceUrl: string} | null>;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

interface AsaasAccountResponse {
  id?: string;
  walletId?: string;
  apiKey?: string;
  accessToken?: {apiKey?: string} | string;
}

export const defaultProfessorWalletDeps: ProfessorWalletDeps = {
  now: () => new Date(),
  env: () => getAsaasEnvTag(),
  createAccount: async (input) => {
    assertAsaasAllowed();
    const created = await fetchAsaas<AsaasAccountResponse>("/v3/accounts", {
      method: "POST",
      body: {
        name: input.name,
        email: input.email,
        cpfCnpj: input.cpfCnpj,
        birthDate: input.birthDate,
        mobilePhone: input.mobilePhone,
        incomeValue: input.incomeValue,
        address: input.address,
        addressNumber: input.addressNumber,
        complement: input.complement ?? undefined,
        province: input.province,
        postalCode: input.postalCode,
      },
      idempotencyKey: `prof-account-${getAsaasEnvTag()}-${input.cpfCnpj}`,
    });
    const token = created.accessToken;
    const apiKey = (typeof token === "string" ? token : token?.apiKey) ?? created.apiKey ?? "";
    const accountId = created.id?.trim() ?? "";
    const walletId = created.walletId?.trim() ?? "";
    if (!accountId || !walletId) throw new Error("ASAAS_ACCOUNT_MISSING_IDS");
    return {accountId, walletId, apiKey: apiKey.trim() || null};
  },
  findAccountByCpf: async (cpfCnpj) => {
    const list = await fetchAsaas<{data?: Array<{id?: string; walletId?: string}>}>(
      `/v3/accounts?cpfCnpj=${encodeURIComponent(cpfCnpj)}`);
    const hit = (list.data ?? []).find((a) => a.id && a.walletId);
    return hit ? {accountId: String(hit.id), walletId: String(hit.walletId)} : null;
  },
  sealKey: (apiKey) => sealSecret(apiKey, PROFESSOR_SECRETS_KEY.value()),
  openKey: (sealed) => openSecret(sealed, PROFESSOR_SECRETS_KEY.value()),
  accountStatus: async (apiKey) => {
    const status = await fetchAsaas<{general?: string; documentation?: string}>("/v3/myAccount/status/", {apiKey});
    return {general: status.general ?? "PENDING", documentation: status.documentation ?? null};
  },
  customerFor: async (athleteId) => {
    assertAsaasAllowed();
    const cpf = await resolveAthleteCpfCnpj(athleteId);
    return getOrCreateAsaasCustomer(athleteId, "", undefined, cpf);
  },
  createPayment: async (input) => {
    assertAsaasAllowed();
    const payment = await fetchAsaas<{id?: string; invoiceUrl?: string; status?: string}>("/v3/payments", {
      method: "POST",
      body: {
        customer: input.customerId,
        billingType: "UNDEFINED",
        value: input.valueReais,
        dueDate: input.dueDate,
        description: input.description.slice(0, 500),
        externalReference: `${PROFESSOR_CHARGE_REF_PREFIX}${input.chargeId}`,
        fine: {value: PROFESSOR_CHARGE_FINE_PERCENT},
        interest: {value: PROFESSOR_CHARGE_INTEREST_PERCENT},
        split: [{walletId: input.walletId, percentualValue: input.splitPercent}],
      },
      idempotencyKey: `prof-charge-${getAsaasEnvTag()}-${input.chargeId}`,
    });
    const paymentId = payment.id?.trim() ?? "";
    const invoiceUrl = payment.invoiceUrl?.trim() ?? "";
    if (!paymentId || !invoiceUrl) throw new Error("ASAAS_PAYMENT_MISSING_ID");
    return {paymentId, invoiceUrl, status: payment.status ?? "PENDING"};
  },
  deletePayment: async (paymentId) => {
    assertAsaasAllowed();
    await deleteAsaasPaymentOrThrow(paymentId);
  },
  findPayment: async (chargeId) => {
    const list = await fetchAsaas<{data?: Array<{id?: string; invoiceUrl?: string; deleted?: boolean}>}>(
      `/v3/payments?externalReference=${encodeURIComponent(`${PROFESSOR_CHARGE_REF_PREFIX}${chargeId}`)}`);
    const hit = (list.data ?? []).find((p) => p.id && !p.deleted);
    return hit ? {paymentId: String(hit.id), invoiceUrl: String(hit.invoiceUrl ?? "")} : null;
  },
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {style: "currency", currency: "BRL"});
}

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

function asaasFailure(e: unknown, fallback: string): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof AsaasApiError) {
    return new HttpsError("failed-precondition", e.message || fallback);
  }
  if (e instanceof Error && e.message === "ASAAS_CUSTOMER_CPF_REQUIRED") {
    return new HttpsError("failed-precondition",
      "O aluno ainda não tem CPF no cadastro do nexaGO. Peça para ele completar o perfil e tente de novo.");
  }
  logger.error(fallback, e);
  return new HttpsError("internal", fallback);
}

const accountRef = (db: Firestore, uid: string) => db.collection(PROFESSOR_PAYOUT_ACCOUNTS).doc(uid);
const secretRef = (db: Firestore, uid: string) => db.collection(PROFESSOR_ASAAS_SECRETS).doc(uid);
const studentRef = (db: Firestore, uid: string, athleteId: string) =>
  db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_STUDENTS).doc(athleteId);
const planRef = (db: Firestore, uid: string, planId: string) =>
  db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_PLANS).doc(planId);

/**
 * Professor com vínculo `INDEPENDENT` ATIVO — pedido pendente, recusado ou encerrado não conta (o
 * próprio professor cria o pedido, então sem o status qualquer conta passaria).
 */
async function assertIndependentProfessor(db: Firestore, uid: string): Promise<void> {
  const links = await db.collection("arenaProfessors")
    .where("professorUserId", "==", uid)
    .where("relationshipType", "==", "INDEPENDENT")
    .where("status", "==", "ACTIVE")
    .limit(1)
    .get();
  if (links.empty) {
    throw new HttpsError("failed-precondition",
      "A carteira própria é para professor independente com vínculo ativo numa arena.");
  }
}

// ---------------------------------------------------------------------------
// Conta de recebimento
// ---------------------------------------------------------------------------

/** Uma tentativa de criar a conta "segura" o doc por este tempo (toque duplo, retry do app). */
const ACCOUNT_CREATING_LOCK_MS = 2 * 60_000;

export async function createProfessorPayoutAccountCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  deps: ProfessorWalletDeps = defaultProfessorWalletDeps,
): Promise<{status: ProfessorAccountStatus}> {
  const now = deps.now();
  const input = parseProfessorAccountInput(raw, dayKeyFromEventDate(now));
  await assertIndependentProfessor(db, uid);
  const env = deps.env();
  const ref = accountRef(db, uid);
  // Marcador em transação: dois toques não criam duas subcontas.
  await db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data();
    if (existing && existing["asaasEnv"] === env && str(existing["walletId"])) {
      throw new HttpsError("already-exists", "Você já tem uma conta de recebimento.");
    }
    const lockedAt = Number(existing?.["creatingAt"] ?? 0);
    if (existing?.["status"] === "creating" && now.getTime() - lockedAt < ACCOUNT_CREATING_LOCK_MS) {
      throw new HttpsError("aborted", "Sua conta já está sendo criada. Aguarde um instante.");
    }
    tx.set(ref, {professorUserId: uid, status: "creating", creatingAt: now.getTime(), asaasEnv: env}, {merge: true});
  });

  let created: {accountId: string; walletId: string; apiKey: string | null};
  try {
    created = await deps.createAccount(input);
  } catch (e) {
    // Tentativa anterior criou no Asaas e não gravou aqui: o CPF já tem subconta. Adota a que
    // existe (sem a apiKey, que só vem na criação — a situação passa a ser "pendente" até o
    // suporte conferir).
    const adopted = e instanceof AsaasApiError && e.httpStatus === 400 ?
      await deps.findAccountByCpf(input.cpfCnpj).catch(() => null) :
      null;
    if (!adopted) {
      await ref.set({status: "failed", creatingAt: 0}, {merge: true});
      throw asaasFailure(e, "Não foi possível criar a conta de recebimento. Tente de novo.");
    }
    logger.warn(`createProfessorPayoutAccount ${uid}: subconta ${adopted.accountId} já existia; adotada sem apiKey`);
    created = {...adopted, apiKey: null};
  }
  if (!created.apiKey) logger.error(`createProfessorPayoutAccount ${uid}: Asaas não devolveu a apiKey da subconta`);
  const batch = db.batch();
  batch.set(ref, {
    professorUserId: uid,
    status: "pending",
    asaasAccountId: created.accountId,
    walletId: created.walletId,
    asaasEnv: env,
    name: input.name,
    email: input.email,
    cpfMasked: maskCpfCnpj(input.cpfCnpj),
    documentation: null,
    creatingAt: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    statusCheckedAt: null,
  }, {merge: true});
  if (created.apiKey) {
    batch.set(secretRef(db, uid), {sealedApiKey: deps.sealKey(created.apiKey), asaasEnv: env, createdAt: FieldValue.serverTimestamp()});
  }
  await batch.commit();
  return {status: "pending"};
}

export async function refreshProfessorPayoutAccountStatusCore(
  db: Firestore,
  uid: string,
  deps: ProfessorWalletDeps = defaultProfessorWalletDeps,
): Promise<{status: ProfessorAccountStatus | null}> {
  const account = (await accountRef(db, uid).get()).data();
  if (!account || !str(account["walletId"])) return {status: null};
  const current = (account["status"] as ProfessorAccountStatus) ?? "pending";
  const sealed = str((await secretRef(db, uid).get()).data()?.["sealedApiKey"]);
  if (!sealed) return {status: current};
  let general: string;
  let documentation: string | null;
  try {
    ({general, documentation} = await deps.accountStatus(deps.openKey(sealed)));
  } catch (e) {
    logger.warn(`refreshProfessorPayoutAccountStatus ${uid}: consulta falhou`, e);
    return {status: current};
  }
  const status = professorAccountStatusFromAsaas(general);
  await accountRef(db, uid).set({
    status, documentation, statusCheckedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {status};
}

async function requireApprovedWallet(db: Firestore, uid: string, env: string): Promise<string> {
  const account = (await accountRef(db, uid).get()).data();
  const walletId = str(account?.["walletId"]);
  if (!account || !walletId || account["asaasEnv"] !== env) {
    throw new HttpsError("failed-precondition", "Crie sua conta de recebimento em Mais › Receber pelo nexaGO.");
  }
  if (account["status"] !== "approved") {
    throw new HttpsError("failed-precondition",
      "Sua conta de recebimento ainda não foi aprovada pelo Asaas. Confira o e-mail de ativação e envie os documentos.");
  }
  return walletId;
}

// ---------------------------------------------------------------------------
// Planos e alunos
// ---------------------------------------------------------------------------

export async function upsertProfessorPlanCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
): Promise<{planId: string}> {
  await assertIndependentProfessor(db, uid);
  const plan: ProfessorPlanData = parseProfessorPlanInput(raw);
  const planId = str(raw["planId"]);
  if (planId.includes("/")) throw new HttpsError("invalid-argument", "Plano inválido.");
  const ref = planId ? planRef(db, uid, planId) : db.collection(PROFESSORS).doc(uid).collection(PROFESSOR_PLANS).doc();
  if (planId && !(await ref.get()).exists) throw new HttpsError("not-found", "Plano não encontrado.");
  await ref.set({
    ...plan,
    updatedAt: FieldValue.serverTimestamp(),
    ...(planId ? {} : {createdAt: FieldValue.serverTimestamp()}),
  }, {merge: true});
  return {planId: ref.id};
}

/**
 * Convida o atleta para a carteira. Ele vira aluno (`active`) só quando ACEITA
 * (`respondProfessorStudentInvite`) — sem isso qualquer professor cobraria qualquer usuário.
 * Reconvidar quem já é aluno só atualiza o plano padrão.
 */
export async function upsertProfessorStudentCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  deps: ProfessorWalletDeps = defaultProfessorWalletDeps,
): Promise<{athleteId: string; status: "invited" | "active"}> {
  await assertIndependentProfessor(db, uid);
  const athleteId = str(raw["athleteId"]);
  if (!athleteId || athleteId.includes("/")) throw new HttpsError("invalid-argument", "Aluno inválido.");
  if (athleteId === uid) throw new HttpsError("invalid-argument", "Você não pode ser seu próprio aluno.");
  const user = (await db.collection("users").doc(athleteId).get()).data();
  if (!user) throw new HttpsError("not-found", "Atleta não encontrado no nexaGO.");
  const name = str(user["fullName"]) || str(user["displayName"]) || str(user["name"]) || "Aluno";
  const photoUrl = str(user["photoUrl"]) || str(user["avatarUrl"]) || null;
  const planId = str(raw["planId"]) || null;
  if (planId && !(await planRef(db, uid, planId).get()).exists) throw new HttpsError("not-found", "Plano não encontrado.");
  const ref = studentRef(db, uid, athleteId);
  const before = (await ref.get()).data();
  const status = before?.["status"] === "active" ? "active" : "invited";
  const professor = (await db.collection("users").doc(uid).get()).data();
  const professorName = str(professor?.["fullName"]) || "Professor";
  await ref.set({
    athleteId,
    name,
    photoUrl,
    planId,
    status,
    professorUid: uid,
    professorName,
    professorPhotoUrl: str(professor?.["photoUrl"]) || str(professor?.["avatarUrl"]) || null,
    updatedAt: FieldValue.serverTimestamp(),
    ...(before ? {} : {createdAt: FieldValue.serverTimestamp(), recurring: null}),
    ...(status === "invited" ? {invitedAt: FieldValue.serverTimestamp()} : {}),
  }, {merge: true});
  if (status === "invited") {
    try {
      await deps.notify({
        userId: athleteId,
        title: `${professorName} quer você como aluno`,
        body: "Aceite para receber as cobranças das aulas pelo nexaGO.",
        type: PROFESSOR_STUDENT_INVITE_TYPE,
        data: {professorUid: uid, url: `/convite-professor/${uid}`},
      });
    } catch (e) {
      logger.warn(`upsertProfessorStudent ${uid}/${athleteId}: push falhou`, e);
    }
  }
  return {athleteId, status};
}

/** O atleta aceita (vira aluno) ou recusa (o convite é arquivado) — só o próprio atleta. */
export async function respondProfessorStudentInviteCore(
  db: Firestore,
  athleteUid: string,
  professorUid: string,
  accept: boolean,
): Promise<{status: "active" | "declined"}> {
  if (!professorUid || professorUid.includes("/")) throw new HttpsError("invalid-argument", "Convite inválido.");
  const ref = studentRef(db, professorUid, athleteUid);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (!data || data["status"] !== "invited") {
      throw new HttpsError("failed-precondition", "Este convite não está mais disponível.");
    }
    const status = accept ? "active" : "declined";
    tx.set(ref, {
      status, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {status};
  });
}

export async function archiveProfessorStudentCore(db: Firestore, uid: string, athleteId: string): Promise<void> {
  const ref = studentRef(db, uid, str(athleteId));
  if (!athleteId || !(await ref.get()).exists) throw new HttpsError("not-found", "Aluno não encontrado.");
  await ref.set({status: "archived", recurring: null, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  // Saiu da carteira: a conversa direta fecha (o aluno deixa de ler) — se não for aluno de turma.
  if (!(await isStudentOfProfessor(db, uid, athleteId, new Date()))) await closeDirectConversation(db, uid, athleteId);
}

// ---------------------------------------------------------------------------
// Cobrança
// ---------------------------------------------------------------------------

interface IssueInput {
  professorUid: string;
  professorName: string;
  athleteId: string;
  studentName: string;
  amountReais: number;
  description: string;
  dueDate: string;
  planId: string | null;
  chargeId: string;
  recurring: boolean;
}

/**
 * Cria o doc (`creating`), a cobrança no Asaas com split e abre (`open`). Falha no Asaas apaga o
 * doc — nada fica "em aberto" sem fatura. Id determinístico na recorrente: dois disparos do
 * agendador não cobram duas vezes (o `create` falha no segundo).
 */
async function issueProfessorCharge(
  db: Firestore,
  input: IssueInput,
  walletId: string,
  deps: ProfessorWalletDeps,
): Promise<{chargeId: string; invoiceUrl: string}> {
  const ref = db.collection(PROFESSOR_CHARGES).doc(input.chargeId);
  try {
    await ref.create({
      professorUid: input.professorUid,
      professorName: input.professorName,
      athleteId: input.athleteId,
      studentName: input.studentName,
      planId: input.planId,
      description: input.description,
      amountReais: input.amountReais,
      dueDate: input.dueDate,
      period: periodOf(input.dueDate),
      recurring: input.recurring,
      feePercent: PROFESSOR_CHARGE_FEE_PERCENT,
      status: "creating",
      asaasEnv: deps.env(),
      paymentId: null,
      invoiceUrl: null,
      netReais: null,
      paidAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    if ((e as {code?: unknown}).code === 6) throw new HttpsError("already-exists", "Essa cobrança já foi gerada.");
    throw e;
  }
  let created: {paymentId: string; invoiceUrl: string};
  try {
    const customerId = await deps.customerFor(input.athleteId);
    created = await deps.createPayment({
      customerId,
      valueReais: input.amountReais,
      dueDate: input.dueDate,
      description: `${input.description} · Prof. ${input.professorName}`,
      chargeId: input.chargeId,
      walletId,
      splitPercent: professorSplitPercent(),
    });
  } catch (e) {
    // Falha ambígua (timeout, 5xx depois de criar): a cobrança pode estar viva no Asaas. Só apaga o
    // doc quando o Asaas confirma que não há pagamento com esta referência; senão adota o que existe.
    const alive = await deps.findPayment(input.chargeId).catch((lookupError) => {
      logger.error(`issueProfessorCharge ${input.chargeId}: não deu para conferir no Asaas`, lookupError);
      return undefined;
    });
    if (alive === undefined) {
      await ref.set({status: "failed", error: String((e as Error)?.message ?? e).slice(0, 200)}, {merge: true});
      throw asaasFailure(e, "Não foi possível confirmar a cobrança. Confira em Carteira antes de cobrar de novo.");
    }
    if (!alive || !alive.invoiceUrl) {
      await ref.delete().catch(() => undefined);
      throw asaasFailure(e, "Não foi possível gerar a cobrança. Tente de novo.");
    }
    logger.warn(`issueProfessorCharge ${input.chargeId}: criação falhou mas o pagamento ${alive.paymentId} existe — adotado`);
    created = alive;
  }
  await ref.set({
    status: "open", paymentId: created.paymentId, invoiceUrl: created.invoiceUrl, updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  try {
    await deps.notify({
      userId: input.athleteId,
      title: `Cobrança de ${input.professorName}`,
      body: `${input.description} · ${brl(input.amountReais)}. Toque para pagar com PIX ou cartão.`,
      type: PROFESSOR_CHARGE_LINK_TYPE,
      data: {chargeId: input.chargeId, invoiceUrl: created.invoiceUrl, webUrl: created.invoiceUrl, url: PROFESSOR_CHARGE_APP_URL},
    });
  } catch (e) {
    logger.warn(`issueProfessorCharge ${input.chargeId}: push falhou`, e);
  }
  return {chargeId: input.chargeId, invoiceUrl: created.invoiceUrl};
}

async function professorDisplayName(db: Firestore, uid: string): Promise<string> {
  const account = (await accountRef(db, uid).get()).data();
  const user = (await db.collection("users").doc(uid).get()).data();
  return str(user?.["fullName"]) || str(account?.["name"]) || "Professor";
}

export async function createProfessorChargeCore(
  db: Firestore,
  uid: string,
  raw: Record<string, unknown>,
  deps: ProfessorWalletDeps = defaultProfessorWalletDeps,
): Promise<{chargeId: string; invoiceUrl: string}> {
  const todayKey = dayKeyFromEventDate(deps.now());
  const req = parseProfessorChargeRequest(raw, todayKey);
  const walletId = await requireApprovedWallet(db, uid, deps.env());
  const student = (await studentRef(db, uid, req.athleteId).get()).data();
  if (!student || student["status"] !== "active") {
    throw new HttpsError("failed-precondition", student?.["status"] === "invited" ?
      "O aluno ainda não aceitou o convite para a sua carteira." :
      "Adicione o aluno à sua carteira antes de cobrar.");
  }
  let amountReais = req.amountReais;
  let description = req.description;
  if (req.planId) {
    const plan = (await planRef(db, uid, req.planId).get()).data();
    if (!plan || plan["active"] === false) throw new HttpsError("not-found", "Plano não encontrado ou desativado.");
    amountReais ??= Number(plan["priceReais"]);
    description ??= str(plan["name"]) || "Aula";
  }
  if (amountReais == null || !(amountReais > 0)) throw new HttpsError("invalid-argument", "Valor inválido.");
  const period = periodOf(req.dueDate);
  // Id aleatório na cobrança manual (mesmo com "repetir"): o id determinístico é só do agendador,
  // e `lastPeriod` abaixo impede o agendador de gerar de novo este mês.
  const chargeId = db.collection(PROFESSOR_CHARGES).doc().id;
  const result = await issueProfessorCharge(db, {
    professorUid: uid,
    professorName: await professorDisplayName(db, uid),
    athleteId: req.athleteId,
    studentName: str(student["name"]) || "Aluno",
    amountReais,
    description: description ?? "Aula",
    dueDate: req.dueDate,
    planId: req.planId,
    chargeId,
    recurring: req.repeatMonthly,
  }, walletId, deps);
  if (req.repeatMonthly) {
    await studentRef(db, uid, req.athleteId).set({
      recurring: {
        planId: req.planId,
        amountReais,
        description: description ?? "Aula",
        dueDay: Number(req.dueDate.slice(8, 10)),
        lastPeriod: period,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
  return result;
}

export async function cancelProfessorChargeCore(
  db: Firestore,
  uid: string,
  chargeId: string,
  deps: ProfessorWalletDeps = defaultProfessorWalletDeps,
): Promise<void> {
  const id = str(chargeId);
  const ref = db.collection(PROFESSOR_CHARGES).doc(id || "_");
  const charge = id ? (await ref.get()).data() : undefined;
  if (!charge || charge["professorUid"] !== uid) throw new HttpsError("not-found", "Cobrança não encontrada.");
  if (!["open", "creating", "failed"].includes(String(charge["status"]))) {
    throw new HttpsError("failed-precondition", "Só dá para cancelar cobrança em aberto.");
  }
  const paymentId = str(charge["paymentId"]) || (await deps.findPayment(id).catch(() => null))?.paymentId || "";
  if (paymentId) {
    try {
      await deps.deletePayment(paymentId);
    } catch (e) {
      throw asaasFailure(e, "Não foi possível cancelar no Asaas. Se o aluno já pagou, aguarde a confirmação.");
    }
  }
  await ref.set({status: "canceled", canceledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
}

/** Para a cobrança recorrente do aluno (as já geradas seguem). */
export async function stopProfessorRecurringCore(db: Firestore, uid: string, athleteId: string): Promise<void> {
  const ref = studentRef(db, uid, str(athleteId));
  if (!athleteId || !(await ref.get()).exists) throw new HttpsError("not-found", "Aluno não encontrado.");
  await ref.set({recurring: null, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
}

/** Agendador: gera a cobrança do mês das recorrentes que vencem nos próximos dias. */
export async function generateProfessorMonthlyChargesCore(
  db: Firestore,
  deps: ProfessorWalletDeps = defaultProfessorWalletDeps,
): Promise<{created: number; skipped: number}> {
  const todayKey = dayKeyFromEventDate(deps.now());
  const env = deps.env();
  const snap = await db.collectionGroup(PROFESSOR_STUDENTS).where("status", "==", "active").get();
  let created = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    // `professors/{uid}/students/{athleteId}` — outro `students` (de outra coleção) não entra.
    const segments = doc.ref.path.split("/");
    if (segments.length !== 4 || segments[0] !== PROFESSORS) continue;
    const professorUid = segments[1];
    const data = doc.data() as Record<string, unknown>;
    const recurring = data["recurring"] as Record<string, unknown> | null | undefined;
    if (!recurring) continue;
    const dueDay = Number(recurring["dueDay"]);
    const period = recurringPeriodDue(todayKey, dueDay);
    if (!period || str(recurring["lastPeriod"]) >= period) {
      skipped++;
      continue;
    }
    try {
      // O vínculo pode ter sido encerrado desde que a recorrente nasceu.
      await assertIndependentProfessor(db, professorUid);
      const walletId = await requireApprovedWallet(db, professorUid, env);
      await issueProfessorCharge(db, {
        professorUid,
        professorName: await professorDisplayName(db, professorUid),
        athleteId: doc.id,
        studentName: str(data["name"]) || "Aluno",
        amountReais: Number(recurring["amountReais"]),
        description: str(recurring["description"]) || "Mensalidade",
        dueDate: dueDateFor(period, dueDay),
        planId: str(recurring["planId"]) || null,
        chargeId: recurringChargeId(professorUid, doc.id, period),
        recurring: true,
      }, walletId, deps);
      created++;
    } catch (e) {
      if (!(e instanceof HttpsError && e.code === "already-exists")) {
        logger.warn(`generateProfessorMonthlyCharges ${professorUid}/${doc.id} ${period}: não gerou`, e);
        skipped++;
        continue;
      }
    }
    await doc.ref.set({recurring: {...recurring, lastPeriod: period}, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  }
  return {created, skipped};
}

// ---------------------------------------------------------------------------
// Webhook (`professorCharge:{id}`)
// ---------------------------------------------------------------------------

/**
 * O dinheiro já caiu na subconta pelo split; aqui só espelha a situação na cobrança. Age pelo GET
 * fresco (o roteador relê o pagamento), então a ordem dos eventos não importa.
 */
export async function processProfessorChargeAsaasNotification(
  db: Firestore,
  paymentId: string,
  payment: AsaasPaymentDetails,
  processedRef: DocumentReference,
  notify: ProfessorWalletDeps["notify"] = defaultProfessorWalletDeps.notify,
): Promise<void> {
  const chargeId = parseProfessorChargeRef(str(payment.externalReference));
  if (!chargeId) return;
  const ref = db.collection(PROFESSOR_CHARGES).doc(chargeId);
  const next = professorChargeStatusFromAsaas(str(payment.status), payment.deleted === true);
  const paidNow = await db.runTransaction(async (tx): Promise<Record<string, unknown> | null> => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      logger.warn(`Asaas professor: cobrança ${chargeId} (payment ${paymentId}) não existe`);
      tx.set(processedRef, {outcome: "orphan", updatedAt: FieldValue.serverTimestamp()}, {merge: true});
      return null;
    }
    const current = snap.data() as Record<string, unknown>;
    const knownPayment = str(current["paymentId"]);
    if (knownPayment && knownPayment !== paymentId) return null;
    const patch: Record<string, unknown> = {asaasStatus: str(payment.status) || null, updatedAt: FieldValue.serverTimestamp()};
    let paid = false;
    if (!knownPayment) patch["paymentId"] = paymentId;
    // A function caiu entre criar no Asaas e gravar "open": o webhook termina o serviço.
    const invoiceUrl = str((payment as {invoiceUrl?: unknown}).invoiceUrl);
    if ((current["status"] === "creating" || current["status"] === "failed") && !payment.deleted && invoiceUrl) {
      patch["status"] = "open";
      patch["invoiceUrl"] = invoiceUrl;
      current["status"] = "open";
    }
    if (next === "paid" && current["status"] !== "paid" && current["status"] !== "refunded") {
      patch["status"] = "paid";
      patch["paidAt"] = FieldValue.serverTimestamp();
      patch["billingType"] = str(payment.billingType) || null;
      if (typeof payment.netValue === "number") {
        patch["netReais"] = Math.round(payment.netValue * professorSplitPercent(Number(current["feePercent"] ?? PROFESSOR_CHARGE_FEE_PERCENT))) / 100;
      }
      // Comprovante do aluno (B19): o que o Asaas devolve de como foi pago.
      patch["receipt"] = professorChargeReceiptFromAsaas(payment);
      paid = true;
    } else if (next === "refunded" && current["status"] !== "refunded") {
      patch["status"] = "refunded";
    } else if (next === "canceled" && ["open", "creating", "failed"].includes(String(current["status"]))) {
      patch["status"] = "canceled";
    }
    tx.set(ref, patch, {merge: true});
    tx.set(processedRef, {outcome: "approved", professorChargeId: chargeId, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    return paid ? current : null;
  });
  if (!paidNow) return;
  // Fora da transação; só a virada para `paid` chega aqui, então a releitura do webhook não repete o push.
  const amount = typeof paidNow["amountReais"] === "number" ? paidNow["amountReais"] as number : Number(payment.value ?? 0);
  const professorName = str(paidNow["professorName"]) || "seu professor";
  try {
    await notify({
      userId: str(paidNow["athleteId"]),
      title: "Pagamento confirmado",
      body: `${brl(amount)} pagos para ${professorName}. Suas aulas estão garantidas.`,
      type: PROFESSOR_CHARGE_PAID_TYPE,
      // `url` é a Agenda para o app antigo (sem a tela); este build abre a confirmação pelo tipo.
      data: {chargeId, url: PROFESSOR_CHARGE_APP_URL},
    });
  } catch (e) {
    logger.warn(`Asaas professor: push de pagamento da cobrança ${chargeId} falhou`, e);
  }
}

/** Campos do comprovante tirados do pagamento do Asaas (só os que vierem). */
export function professorChargeReceiptFromAsaas(payment: AsaasPaymentDetails): Record<string, string> {
  const p = payment as AsaasPaymentDetails & {
    creditCard?: {creditCardNumber?: unknown; creditCardBrand?: unknown};
    transactionReceiptUrl?: unknown;
    invoiceNumber?: unknown;
  };
  const out: Record<string, string> = {};
  const last4 = str(p.creditCard?.creditCardNumber).replace(/\D/g, "").slice(-4);
  if (last4) out["cardLast4"] = last4;
  const brand = str(p.creditCard?.creditCardBrand);
  if (brand) out["cardBrand"] = brand;
  const receiptUrl = str(p.transactionReceiptUrl);
  if (/^https:\/\//.test(receiptUrl)) out["receiptUrl"] = receiptUrl;
  const invoiceNumber = str(p.invoiceNumber);
  if (invoiceNumber) out["invoiceNumber"] = invoiceNumber;
  return out;
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

const PROFESSOR_ASAAS_OPTS = {region: CLIENT_FACING_REGIONS, secrets: [...asaasArenaSecrets, PROFESSOR_SECRETS_KEY]};
const PROFESSOR_PUSH_OPTS = {region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT]};
const PROFESSOR_CHARGE_OPTS = {
  region: CLIENT_FACING_REGIONS,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
};
const dataOf = (request: CallableRequest) => (request.data ?? {}) as Record<string, unknown>;

export const createProfessorPayoutAccount = onCall(PROFESSOR_ASAAS_OPTS, async (request) =>
  createProfessorPayoutAccountCore(getFirestore(), requireUid(request), dataOf(request)));

export const refreshProfessorPayoutAccountStatus = onCall(PROFESSOR_ASAAS_OPTS, async (request) =>
  refreshProfessorPayoutAccountStatusCore(getFirestore(), requireUid(request)));

export const upsertProfessorPlan = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  upsertProfessorPlanCore(getFirestore(), requireUid(request), dataOf(request)));

export const upsertProfessorStudent = onCall(PROFESSOR_PUSH_OPTS, async (request) =>
  upsertProfessorStudentCore(getFirestore(), requireUid(request), dataOf(request)));

export const respondProfessorStudentInvite = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  respondProfessorStudentInviteCore(getFirestore(), requireUid(request), str(dataOf(request)["professorUid"]),
    dataOf(request)["accept"] === true));

export const archiveProfessorStudent = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  await archiveProfessorStudentCore(getFirestore(), requireUid(request), str(dataOf(request)["athleteId"]));
  return {ok: true};
});

export const createProfessorCharge = onCall(PROFESSOR_CHARGE_OPTS, async (request) =>
  createProfessorChargeCore(getFirestore(), requireUid(request), dataOf(request)));

export const cancelProfessorCharge = onCall(PROFESSOR_ASAAS_OPTS, async (request) => {
  await cancelProfessorChargeCore(getFirestore(), requireUid(request), str(dataOf(request)["chargeId"]));
  return {ok: true};
});

export const stopProfessorRecurring = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  await stopProfessorRecurringCore(getFirestore(), requireUid(request), str(dataOf(request)["athleteId"]));
  return {ok: true};
});

export const generateProfessorMonthlyCharges = onSchedule({
  schedule: "every day 07:00",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
  secrets: [...asaasArenaSecrets, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await generateProfessorMonthlyChargesCore(getFirestore());
  logger.info(`generateProfessorMonthlyCharges: ${result.created} criadas, ${result.skipped} puladas`);
});
