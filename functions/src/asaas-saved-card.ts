/**
 * Cartão salvo do atleta (débito automático das mensalidades dos Planos de horário).
 *
 * Guardamos só o token do Asaas (`creditCardToken`), bandeira e final. Número e CVV passam pela
 * callable direto para o Asaas e NUNCA tocam Firestore, log ou mensagem de erro.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type DocumentReference, type Firestore, type Transaction} from "firebase-admin/firestore";
import {AsaasApiError, asaasArenaSecrets, fetchAsaas, getAsaasEnvTag} from "./asaas-client";
import {getOrCreateAsaasCustomer, isValidCpfCnpj, normalizeCpfCnpj, resolveAthleteCpfCnpj} from "./asaas-customer";
import {CPF_REQUIRED_MESSAGE} from "./arena-schedule-plan-constants";
import {requireUid, rethrowSchedule} from "./arena-schedule-plans";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

type Data = Record<string, unknown>;
type AsaasEnv = "sandbox" | "production";

export const CARD_INVALID_MESSAGE = "Confira os dados do cartão.";
export const CARD_ATTEMPTS_MESSAGE = "Muitas tentativas. Tente de novo amanhã.";
export const CARD_REFUSED_TOKENIZE_MESSAGE = "Não foi possível validar este cartão. Confira os dados.";
const CPF_INVALID_MESSAGE = "CPF inválido. Confira os números.";

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SavedCard {
  creditCardToken: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  holderName: string;
  customerId: string;
  env: AsaasEnv;
  remoteIp: string;
}

export function savedCardRef(db: Firestore, uid: string): DocumentReference {
  return db.doc(`users/${uid}/asaas/savedCard`);
}

function attemptsRef(db: Firestore, uid: string): DocumentReference {
  return db.doc(`users/${uid}/asaas/savedCardAttempts`);
}

function parseSavedCard(data: Data | undefined, env: AsaasEnv): SavedCard | null {
  if (!data || data["env"] !== env) return null;
  const token = typeof data["creditCardToken"] === "string" ? data["creditCardToken"].trim() : "";
  if (!token) return null;
  return {
    creditCardToken: token,
    brand: String(data["brand"] ?? ""),
    last4: String(data["last4"] ?? ""),
    expiryMonth: Number(data["expiryMonth"] ?? 0),
    expiryYear: Number(data["expiryYear"] ?? 0),
    holderName: String(data["holderName"] ?? ""),
    customerId: String(data["customerId"] ?? ""),
    env,
    remoteIp: String(data["remoteIp"] ?? ""),
  };
}

/** Cartão do atleta neste ambiente; null = sem doc, de outro ambiente ou sem token. */
export async function readSavedCard(db: Firestore, uid: string, env: AsaasEnv): Promise<SavedCard | null> {
  return parseSavedCard((await savedCardRef(db, uid).get()).data() as Data | undefined, env);
}

export async function readSavedCardTx(tx: Transaction, db: Firestore, uid: string, env: AsaasEnv): Promise<SavedCard | null> {
  return parseSavedCard((await tx.get(savedCardRef(db, uid))).data() as Data | undefined, env);
}

/** Válido se (ano, mês) da validade ≥ (ano, mês) do vencimento `AAAA-MM-DD`. */
export function cardValidForDueDate(
  card: Pick<SavedCard, "expiryMonth" | "expiryYear">,
  dueDate: string,
): boolean {
  const year = Number(dueDate.slice(0, 4));
  const month = Number(dueDate.slice(5, 7));
  return card.expiryYear * 12 + card.expiryMonth >= year * 12 + month;
}

// ---------------------------------------------------------------------------
// Asaas
// ---------------------------------------------------------------------------

export interface TokenizeInput {
  customerId: string;
  card: {holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string};
  holderInfo: {name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string};
  remoteIp: string;
}

export interface SavedCardDeps {
  /** Cliente Asaas do atleta pelo CPF guardado; null = sem CPF. */
  resolveCustomer(uid: string): Promise<string | null>;
  /** Grava o CPF digitado (cliente Asaas + cadastro). */
  registerCustomer(uid: string, cpfCnpj: string): Promise<string>;
  holderInfo(uid: string): Promise<{name: string; email: string; cpfCnpj: string; phone: string}>;
  tokenize(input: TokenizeInput): Promise<{creditCardToken: string; creditCardBrand: string; creditCardNumber: string}>;
  now(): Date;
  envTag(): AsaasEnv;
}

/** No emulador, só sandbox: o projeto DEV aponta para o Asaas de produção. */
function assertAsaasAllowed(): void {
  if (process.env.FUNCTIONS_EMULATOR === "true" && getAsaasEnvTag() !== "sandbox") {
    throw new Error("ASAAS_BLOCKED_IN_EMULATOR");
  }
}

async function userData(uid: string): Promise<Data> {
  return ((await getFirestore().collection("users").doc(uid).get()).data() ?? {}) as Data;
}

async function athleteEmail(uid: string): Promise<string> {
  return String((await userData(uid))["email"] ?? "");
}

export async function resolveScheduleCustomer(athleteId: string): Promise<string | null> {
  assertAsaasAllowed();
  const cached = (await getFirestore().doc(`users/${athleteId}/asaas/customer`).get()).data();
  let cpf = normalizeCpfCnpj(cached?.["cpfCnpj"] as string | undefined);
  if (!isValidCpfCnpj(cpf)) {
    try {
      cpf = await resolveAthleteCpfCnpj(athleteId);
    } catch {
      return null;
    }
  }
  return getOrCreateAsaasCustomer(athleteId, await athleteEmail(athleteId), undefined, cpf);
}

export async function registerScheduleCustomer(athleteId: string, cpfCnpj: string): Promise<string> {
  assertAsaasAllowed();
  return getOrCreateAsaasCustomer(athleteId, await athleteEmail(athleteId), undefined, cpfCnpj);
}

export const defaultSavedCardDeps: SavedCardDeps = {
  resolveCustomer: resolveScheduleCustomer,
  registerCustomer: registerScheduleCustomer,
  holderInfo: async (uid) => {
    const user = await userData(uid);
    const cached = (await getFirestore().doc(`users/${uid}/asaas/customer`).get()).data();
    const cpfCnpj = normalizeCpfCnpj(cached?.["cpfCnpj"] as string | undefined);
    const name = String(cached?.["name"] ?? user["fullName"] ?? user["name"] ?? user["displayName"] ?? "").trim();
    return {
      name,
      email: String(user["email"] ?? "").trim(),
      cpfCnpj,
      phone: String(user["phoneNumber"] ?? user["phone"] ?? "").replace(/\D/g, ""),
    };
  },
  tokenize: async (input) => {
    assertAsaasAllowed();
    const res = await fetchAsaas<{creditCardToken?: string; creditCardBrand?: string; creditCardNumber?: string}>(
      "/v3/creditCard/tokenizeCreditCard",
      {
        method: "POST",
        body: {
          customer: input.customerId,
          creditCard: {
            holderName: input.card.holderName,
            number: input.card.number,
            expiryMonth: input.card.expiryMonth,
            expiryYear: input.card.expiryYear,
            ccv: input.card.ccv,
          },
          creditCardHolderInfo: {
            name: input.holderInfo.name,
            email: input.holderInfo.email,
            cpfCnpj: input.holderInfo.cpfCnpj,
            postalCode: input.holderInfo.postalCode,
            addressNumber: input.holderInfo.addressNumber,
            mobilePhone: input.holderInfo.phone,
          },
          remoteIp: input.remoteIp,
        },
      },
    );
    return {
      creditCardToken: String(res.creditCardToken ?? ""),
      creditCardBrand: String(res.creditCardBrand ?? ""),
      creditCardNumber: String(res.creditCardNumber ?? ""),
    };
  },
  now: () => new Date(),
  envTag: getAsaasEnvTag,
};

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function digitsOnly(raw: unknown): string {
  return typeof raw === "string" || typeof raw === "number" ? String(raw).replace(/[\s.\-]/g, "") : "";
}

function luhnOk(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

interface ParsedCard {
  number: string; holderName: string; expiryMonth: number; expiryYear: number;
  ccv: string; postalCode: string; addressNumber: string; cpfCnpj: string;
}

function parseCardInput(raw: unknown, now: Date): ParsedCard {
  const bad = () => new HttpsError("invalid-argument", CARD_INVALID_MESSAGE);
  const input = (raw ?? {}) as Data;
  const number = digitsOnly(input["number"]);
  const ccv = digitsOnly(input["ccv"]);
  const postalCode = digitsOnly(input["postalCode"]);
  const holderName = typeof input["holderName"] === "string" ? input["holderName"].trim() : "";
  const addressNumber = typeof input["addressNumber"] === "string" || typeof input["addressNumber"] === "number" ?
    String(input["addressNumber"]).trim() : "";
  const expiryMonth = Number(digitsOnly(input["expiryMonth"]));
  let expiryYear = Number(digitsOnly(input["expiryYear"]));
  if (expiryYear > 0 && expiryYear < 100) expiryYear += 2000;

  if (!/^\d{13,19}$/.test(number) || !luhnOk(number)) throw bad();
  if (!/^\d{3,4}$/.test(ccv)) throw bad();
  if (!/^\d{8}$/.test(postalCode)) throw bad();
  if (holderName.length < 2 || holderName.length > 80) throw bad();
  if (addressNumber.length < 1 || addressNumber.length > 10) throw bad();
  if (!Number.isInteger(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) throw bad();
  if (!Number.isInteger(expiryYear) || expiryYear < 1000 || expiryYear > 9999) throw bad();
  const today = dayKeyFromEventDate(now);
  if (!cardValidForDueDate({expiryMonth, expiryYear}, today)) throw bad();

  const cpfRaw = input["cpfCnpj"];
  const cpfCnpj = typeof cpfRaw === "string" ? normalizeCpfCnpj(cpfRaw) : "";
  return {number, holderName, expiryMonth, expiryYear, ccv, postalCode, addressNumber, cpfCnpj};
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/** Conta a tentativa (janela de 24h desde a primeira); lança `resource-exhausted` na 6ª. */
async function countAttempt(db: Firestore, uid: string, now: Date): Promise<void> {
  const ref = attemptsRef(db, uid);
  await db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as Data | undefined;
    const start = data?.["windowStart"];
    const startMs = start instanceof Timestamp ? start.toMillis() : 0;
    const count = Number(data?.["count"] ?? 0);
    if (data && now.getTime() - startMs < ATTEMPT_WINDOW_MS) {
      if (count >= MAX_ATTEMPTS) throw new HttpsError("resource-exhausted", CARD_ATTEMPTS_MESSAGE);
      tx.set(ref, {windowStart: start, count: count + 1});
      return;
    }
    tx.set(ref, {windowStart: Timestamp.fromDate(now), count: 1});
  });
}

export async function saveMyPaymentCardCore(
  db: Firestore,
  uid: string,
  input: unknown,
  remoteIp: string,
  deps: SavedCardDeps = defaultSavedCardDeps,
): Promise<{brand: string; last4: string}> {
  const now = deps.now();
  const card = parseCardInput(input, now);
  await countAttempt(db, uid, now);

  let customerId: string | null;
  if (card.cpfCnpj) {
    if (!isValidCpfCnpj(card.cpfCnpj)) throw new HttpsError("invalid-argument", CPF_INVALID_MESSAGE);
    customerId = await deps.registerCustomer(uid, card.cpfCnpj);
  } else {
    customerId = await deps.resolveCustomer(uid);
  }
  if (!customerId) throw new HttpsError("failed-precondition", CPF_REQUIRED_MESSAGE);

  const holder = await deps.holderInfo(uid);
  let token: {creditCardToken: string; creditCardBrand: string; creditCardNumber: string};
  try {
    token = await deps.tokenize({
      customerId,
      card: {
        holderName: card.holderName,
        number: card.number,
        expiryMonth: String(card.expiryMonth).padStart(2, "0"),
        expiryYear: String(card.expiryYear),
        ccv: card.ccv,
      },
      holderInfo: {
        name: holder.name || card.holderName,
        email: holder.email,
        cpfCnpj: card.cpfCnpj || holder.cpfCnpj,
        postalCode: card.postalCode,
        addressNumber: card.addressNumber,
        phone: holder.phone,
      },
      remoteIp,
    });
  } catch (e) {
    if (e instanceof AsaasApiError) {
      logger.warn("saveMyPaymentCard: Asaas recusou", {uid, httpStatus: e.httpStatus});
      throw new HttpsError("invalid-argument", e.message.trim() || CARD_REFUSED_TOKENIZE_MESSAGE);
    }
    logger.error("saveMyPaymentCard: falha ao tokenizar", {uid});
    throw new HttpsError("internal", "Não foi possível concluir agora. Tente novamente em instantes.");
  }
  if (!token.creditCardToken) throw new HttpsError("invalid-argument", CARD_REFUSED_TOKENIZE_MESSAGE);

  const brand = token.creditCardBrand.toUpperCase();
  const last4 = token.creditCardNumber.slice(-4);
  const ref = savedCardRef(db, uid);
  const prev = (await ref.get()).data() as Data | undefined;
  const stamp = Timestamp.fromDate(now);
  const doc: SavedCard & {createdAt: unknown; updatedAt: unknown} = {
    creditCardToken: token.creditCardToken,
    brand,
    last4,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    holderName: card.holderName,
    customerId,
    env: deps.envTag(),
    remoteIp,
    createdAt: prev?.["createdAt"] ?? stamp,
    updatedAt: stamp,
  };
  await ref.set(doc);
  return {brand, last4};
}

export async function getMyPaymentCardCore(
  db: Firestore,
  uid: string,
  env: AsaasEnv,
): Promise<{brand: string; last4: string; expiryMonth: number; expiryYear: number} | null> {
  const card = await readSavedCard(db, uid, env);
  if (!card) return null;
  return {brand: card.brand, last4: card.last4, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear};
}

/** Apaga só o token local; quem desliga o débito é a Task 5. */
export async function deleteSavedCardCore(db: Firestore, uid: string): Promise<boolean> {
  const ref = savedCardRef(db, uid);
  const existed = (await ref.get()).exists;
  if (existed) await ref.delete();
  return existed;
}

// ---------------------------------------------------------------------------
// Callables (nunca logar request.data: carrega número e CVV)
// ---------------------------------------------------------------------------

export const saveMyPaymentCard = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: asaasArenaSecrets},
  async (request) => {
    const uid = requireUid(request.auth);
    try {
      return await saveMyPaymentCardCore(getFirestore(), uid, request.data, request.rawRequest?.ip ?? "");
    } catch (e) {
      return rethrowSchedule("saveMyPaymentCard", e);
    }
  },
);

export const getMyPaymentCard = onCall(
  {region: CLIENT_FACING_REGIONS, secrets: asaasArenaSecrets},
  async (request) => {
    const uid = requireUid(request.auth);
    try {
      return await getMyPaymentCardCore(getFirestore(), uid, getAsaasEnvTag());
    } catch (e) {
      return rethrowSchedule("getMyPaymentCard", e);
    }
  },
);
