import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getAuth} from "firebase-admin/auth";
import {
  fetchAsaas,
  getAsaasEnvTag,
  isAsaasInvalidCustomerError,
} from "./asaas-client";
import {isValidCpfCnpj, normalizeCpfCnpj} from "./asaas-customer";

type AsaasCustomerResponse = {id?: string};
type AsaasCustomerListResponse = {data?: Array<{id?: string}>};

/** `externalReference` do customer Asaas da arena. */
function arenaCustomerExternalRef(arenaId: string): string {
  return `arena:${arenaId}`;
}

/**
 * Resolve o CNPJ/CPF da arena para o cadastro no Asaas:
 * request → doc da arena (`cpfCnpj`/`cnpj`) → doc do gestor.
 * Lança `ARENA_CPF_CNPJ_REQUIRED` se não encontrar um documento válido.
 */
export async function resolveArenaCpfCnpj(
  arenaId: string,
  managerUid: string,
  fromRequest?: string,
): Promise<string> {
  const fromReq = normalizeCpfCnpj(fromRequest);
  if (isValidCpfCnpj(fromReq)) return fromReq;

  const db = getFirestore();
  const arenaRaw = (await db.collection("arenas").doc(arenaId).get()).data() ?? {};
  const fromArena = normalizeCpfCnpj(
    (arenaRaw.cpfCnpj as string | undefined) ??
      (arenaRaw.cnpj as string | undefined) ??
      (arenaRaw.document as string | undefined),
  );
  if (isValidCpfCnpj(fromArena)) return fromArena;

  for (const col of ["users", "athletes"] as const) {
    const snap = await db.collection(col).doc(managerUid).get();
    if (!snap.exists) continue;
    const data = snap.data() ?? {};
    const digits = normalizeCpfCnpj(
      (data.cpfCnpj as string | undefined) ??
        (data.cpf as string | undefined) ??
        (data.document as string | undefined),
    );
    if (isValidCpfCnpj(digits)) return digits;
  }

  throw new Error("ARENA_CPF_CNPJ_REQUIRED");
}

/**
 * Retorna o customerId Asaas da arena (pagadora da assinatura), criando ou
 * atualizando com o CNPJ/CPF. Cacheia em `arenas/{arenaId}/asaas/customer`.
 */
export async function getOrCreateArenaAsaasCustomer(params: {
  arenaId: string;
  managerUid: string;
  cpfCnpj: string;
}): Promise<string> {
  const digits = normalizeCpfCnpj(params.cpfCnpj);
  if (!isValidCpfCnpj(digits)) {
    throw new Error("ARENA_CPF_CNPJ_REQUIRED");
  }

  const db = getFirestore();
  const ref = db.doc(`arenas/${params.arenaId}/asaas/customer`);
  const snap = await ref.get();
  const cachedId = (snap.data()?.customerId as string | undefined)?.trim() ?? "";
  const cachedCpf = normalizeCpfCnpj(snap.data()?.cpfCnpj as string | undefined);
  const cachedEnv = (snap.data()?.asaasEnv as string | undefined)?.trim() ?? "";
  const currentEnv = getAsaasEnvTag();
  const envMatches = cachedEnv === currentEnv;
  const externalRef = arenaCustomerExternalRef(params.arenaId);

  const arenaName =
    ((await db.collection("arenas").doc(params.arenaId).get()).data()?.name as string | undefined)
      ?.trim() || "Arena NexaGO";
  let email = "";
  try {
    email = (await getAuth().getUser(params.managerUid)).email?.trim() ?? "";
  } catch {
    // gestor sem auth/email — usa fallback
  }
  const safeEmail = email || `arena+${params.arenaId}@nexago.app`;
  const name = arenaName.slice(0, 80);

  if (cachedId && cachedCpf === digits && envMatches) {
    return cachedId;
  }

  let customerId = envMatches ? cachedId : "";
  if (!customerId) {
    try {
      const listed = await fetchAsaas<AsaasCustomerListResponse>(
        `/v3/customers?externalReference=${encodeURIComponent(externalRef)}&limit=1`,
      );
      customerId = listed.data?.[0]?.id?.trim() ?? "";
    } catch {
      // segue para criar
    }
  }

  if (customerId) {
    try {
      await fetchAsaas<AsaasCustomerResponse>(`/v3/customers/${encodeURIComponent(customerId)}`, {
        method: "PUT",
        body: {name, email: safeEmail, cpfCnpj: digits, notificationDisabled: true},
      });
    } catch (e) {
      if (!isAsaasInvalidCustomerError(e)) {
        throw e;
      }
      customerId = "";
    }
  }

  if (!customerId) {
    const created = await fetchAsaas<AsaasCustomerResponse>("/v3/customers", {
      method: "POST",
      body: {
        name,
        email: safeEmail,
        cpfCnpj: digits,
        externalReference: externalRef,
        notificationDisabled: true,
      },
      idempotencyKey: `asaas-arena-customer-${currentEnv}-${params.arenaId}`,
    });
    customerId = created.id?.trim() ?? "";
  }

  if (!customerId) {
    throw new Error("ASAAS_CUSTOMER_CREATE_FAILED");
  }

  await ref.set({
    customerId,
    cpfCnpj: digits,
    email: safeEmail,
    asaasEnv: currentEnv,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return customerId;
}
