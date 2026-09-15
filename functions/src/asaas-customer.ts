import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {
  fetchAsaas,
  getAsaasEnvTag,
  isAsaasInvalidCustomerError,
} from "./asaas-client";

type AsaasCustomerResponse = {
  id?: string;
};

type AsaasCustomerListResponse = {
  data?: Array<{id?: string}>;
};

/**
 * Normaliza CPF/CNPJ: maiúsculas, mantém `[0-9A-Z]`.
 * Suporta o novo CNPJ alfanumérico (Receita 2026): 12 posições alfanuméricas
 * + 2 DVs numéricos. CPF e CNPJ numérico legado continuam iguais (só dígitos).
 */
export function normalizeCpfCnpj(raw: string | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** CPF (11 dígitos) ou CNPJ (14: 12 alfanuméricos + 2 dígitos verificadores). */
export function isValidCpfCnpj(value: string): boolean {
  const s = normalizeCpfCnpj(value);
  if (s.length === 11) return /^\d{11}$/.test(s);
  if (s.length === 14) return /^[0-9A-Z]{12}[0-9]{2}$/.test(s);
  return false;
}

/** Último recurso: sem isso o Asaas recebe uma cobrança sem dono rastreável. */
export const GENERIC_PAYER_NAME = "Atleta NexaGO";

/** Limite do campo `name` do customer no Asaas. */
const ASAAS_NAME_MAX_LENGTH = 80;

/**
 * Campos de nome em `users/{uid}`, do mais completo ao mais fraco. O nome que
 * vai pro Asaas precisa casar com o CPF da cobrança, então `fullName` (nome
 * completo do onboarding) vem antes de apelido e primeiro nome.
 */
const ATHLETE_NAME_FIELDS = [
  "fullName",
  "name",
  "displayName",
  "nickname",
  "firstName",
] as const;

function firstFilledName(
  userData: Record<string, unknown> | null | undefined,
): string {
  for (const key of ATHLETE_NAME_FIELDS) {
    const value = userData?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Nome do pagador da cobrança: doc do atleta primeiro, Auth só como fallback.
 *
 * O `displayName` do Firebase Auth só existe quando a conta nasceu de
 * Google/Apple — o cadastro por e-mail/senha do app nunca grava esse campo, e
 * é por isso que cobranças iam ao Asaas como [GENERIC_PAYER_NAME]. O nome real
 * do atleta sempre esteve em `users/{uid}.fullName`.
 */
export function pickAthletePayerName(
  userData: Record<string, unknown> | null | undefined,
  authDisplayName?: string,
): string {
  const fromDoc = firstFilledName(userData);
  if (fromDoc) return fromDoc.slice(0, ASAAS_NAME_MAX_LENGTH);
  const fromAuth = authDisplayName?.trim();
  if (fromAuth) return fromAuth.slice(0, ASAAS_NAME_MAX_LENGTH);
  return GENERIC_PAYER_NAME;
}

/**
 * Resolve o nome do pagador (`users/{uid}` → `authDisplayName` → Auth).
 *
 * `authDisplayName` é só um atalho pra quem já buscou o usuário no Auth (os
 * fluxos de cobrança fazem isso pelo e-mail); quem não tem, deixa em branco e
 * a busca no Auth só acontece se o doc do atleta não tiver nome nenhum.
 */
export async function resolveAthletePayerName(
  uid: string,
  authDisplayName?: string,
): Promise<string> {
  let userData: Record<string, unknown> | undefined;
  try {
    userData = (await getFirestore().collection("users").doc(uid).get()).data();
  } catch {
    // sem o doc, segue pro Auth
  }

  let hint = authDisplayName?.trim() ?? "";
  if (!hint && !firstFilledName(userData)) {
    try {
      hint = (await getAuth().getUser(uid)).displayName?.trim() ?? "";
    } catch {
      // conta sem Auth (ex.: perfil criado por convite) — cai no genérico
    }
  }

  return pickAthletePayerName(userData, hint);
}

/**
 * O customer cacheado só serve se id, CPF, ambiente **e nome** ainda batem.
 *
 * O nome entra no critério porque customers criados antes desta checagem
 * ficaram com [GENERIC_PAYER_NAME] gravado no Asaas: é a diferença de nome que
 * dispara o PUT que os renomeia na próxima cobrança.
 */
export function asaasCustomerCacheIsFresh(params: {
  cachedId: string;
  cachedCpf: string;
  cachedEnv: string;
  cachedName: string;
  cpfCnpj: string;
  env: string;
  name: string;
}): boolean {
  return (
    Boolean(params.cachedId) &&
    params.cachedCpf === params.cpfCnpj &&
    params.cachedEnv === params.env &&
    params.cachedName === params.name
  );
}

async function readStoredCpfCnpj(uid: string): Promise<string> {
  const db = getFirestore();
  for (const col of ["athletes", "users"] as const) {
    const snap = await db.collection(col).doc(uid).get();
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    const raw =
      (data.cpfCnpj as string | undefined) ??
      (data.cpf as string | undefined) ??
      (data.document as string | undefined);
    const digits = normalizeCpfCnpj(raw);
    if (isValidCpfCnpj(digits)) return digits;
  }
  return "";
}

async function persistAthleteCpfCnpj(uid: string, cpfCnpj: string): Promise<void> {
  const db = getFirestore();
  await db.collection("athletes").doc(uid).set(
    {cpfCnpj, updatedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
}

async function updateAsaasCustomer(
  customerId: string,
  params: {name: string; email: string; cpfCnpj: string},
): Promise<void> {
  await fetchAsaas<AsaasCustomerResponse>(
    `/v3/customers/${encodeURIComponent(customerId)}`,
    {
      method: "PUT",
      body: {
        name: params.name,
        email: params.email,
        cpfCnpj: params.cpfCnpj,
        notificationDisabled: true,
      },
    },
  );
}

async function findAsaasCustomerByExternalReference(uid: string): Promise<string> {
  try {
    const listed = await fetchAsaas<AsaasCustomerListResponse>(
      `/v3/customers?externalReference=${encodeURIComponent(uid)}&limit=1`,
    );
    return listed.data?.[0]?.id?.trim() ?? "";
  } catch {
    return "";
  }
}

async function createAsaasCustomer(params: {
  uid: string;
  name: string;
  email: string;
  cpfCnpj: string;
}): Promise<string> {
  const created = await fetchAsaas<AsaasCustomerResponse>("/v3/customers", {
    method: "POST",
    body: {
      name: params.name,
      email: params.email,
      cpfCnpj: params.cpfCnpj,
      externalReference: params.uid,
      notificationDisabled: true,
    },
    idempotencyKey: `asaas-customer-${getAsaasEnvTag()}-${params.uid}`,
  });
  return created.id?.trim() ?? "";
}

/**
 * Resolve CPF/CNPJ do atleta (request → Firestore).
 */
export async function resolveAthleteCpfCnpj(
  uid: string,
  fromRequest?: string,
): Promise<string> {
  const fromReq = normalizeCpfCnpj(fromRequest);
  if (isValidCpfCnpj(fromReq)) return fromReq;
  const stored = await readStoredCpfCnpj(uid);
  if (isValidCpfCnpj(stored)) return stored;
  throw new Error("ASAAS_CUSTOMER_CPF_REQUIRED");
}

/**
 * Retorna o customerId Asaas do atleta, criando ou atualizando com CPF/CNPJ.
 *
 * `authDisplayName` é apenas uma dica de quem já tem o usuário do Auth em mão:
 * o nome que vale é o de `users/{uid}` (ver [resolveAthletePayerName]).
 */
export async function getOrCreateAsaasCustomer(
  uid: string,
  email: string,
  authDisplayName: string | undefined,
  cpfCnpj: string,
): Promise<string> {
  const digits = normalizeCpfCnpj(cpfCnpj);
  if (!isValidCpfCnpj(digits)) {
    throw new Error("ASAAS_CUSTOMER_CPF_REQUIRED");
  }

  const db = getFirestore();
  const ref = db.doc(`users/${uid}/asaas/customer`);
  const snap = await ref.get();
  const cachedId = (snap.data()?.customerId as string | undefined)?.trim() ?? "";
  const cachedCpf = normalizeCpfCnpj(snap.data()?.cpfCnpj as string | undefined);
  const cachedEnv = (snap.data()?.asaasEnv as string | undefined)?.trim() ?? "";
  const cachedName = (snap.data()?.name as string | undefined)?.trim() ?? "";
  const currentEnv = getAsaasEnvTag();
  const envMatches = cachedEnv === currentEnv;

  const safeEmail = email.trim() || `athlete+${uid}@nexago.app`;
  const name = await resolveAthletePayerName(uid, authDisplayName);

  if (
    asaasCustomerCacheIsFresh({
      cachedId,
      cachedCpf,
      cachedEnv,
      cachedName,
      cpfCnpj: digits,
      env: currentEnv,
      name,
    })
  ) {
    return cachedId;
  }

  let customerId = envMatches ? cachedId : "";

  if (!customerId) {
    customerId = await findAsaasCustomerByExternalReference(uid);
  }

  if (customerId) {
    try {
      await updateAsaasCustomer(customerId, {name, email: safeEmail, cpfCnpj: digits});
    } catch (e) {
      if (!isAsaasInvalidCustomerError(e)) {
        throw e;
      }
      customerId = "";
    }
  }

  if (!customerId) {
    customerId = await createAsaasCustomer({
      uid,
      name,
      email: safeEmail,
      cpfCnpj: digits,
    });
  }

  if (!customerId) {
    throw new Error("ASAAS_CUSTOMER_CREATE_FAILED");
  }

  await persistAthleteCpfCnpj(uid, digits);

  await ref.set({
    customerId,
    cpfCnpj: digits,
    email: safeEmail,
    // Gravado pra detectar renomeação do atleta: nome diferente do cacheado
    // invalida o cache e reenvia o PUT (ver [asaasCustomerCacheIsFresh]).
    name,
    asaasEnv: currentEnv,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return customerId;
}
