import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {fetchAsaas} from "./asaas-client";

type AsaasCustomerResponse = {
  id?: string;
};

type AsaasCustomerListResponse = {
  data?: Array<{id?: string}>;
};

/** Apenas dígitos; CPF 11 ou CNPJ 14. */
export function normalizeCpfCnpj(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits;
}

export function isValidCpfCnpj(digits: string): boolean {
  return digits.length === 11 || digits.length === 14;
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
 */
export async function getOrCreateAsaasCustomer(
  uid: string,
  email: string,
  displayName: string | undefined,
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

  const safeEmail = email.trim() || `athlete+${uid}@nexago.app`;
  const name = (displayName?.trim() || "Atleta NexaGO").slice(0, 80);

  if (cachedId && cachedCpf === digits) {
    return cachedId;
  }

  let customerId = cachedId;

  if (!customerId) {
    try {
      const listed = await fetchAsaas<AsaasCustomerListResponse>(
        `/v3/customers?externalReference=${encodeURIComponent(uid)}&limit=1`,
      );
      customerId = listed.data?.[0]?.id?.trim() ?? "";
    } catch {
      // segue para criar
    }
  }

  if (customerId) {
    await updateAsaasCustomer(customerId, {name, email: safeEmail, cpfCnpj: digits});
  } else {
    const created = await fetchAsaas<AsaasCustomerResponse>("/v3/customers", {
      method: "POST",
      body: {
        name,
        email: safeEmail,
        cpfCnpj: digits,
        externalReference: uid,
        notificationDisabled: true,
      },
      idempotencyKey: `asaas-customer-${uid}`,
    });
    customerId = created.id?.trim() ?? "";
  }

  if (!customerId) {
    throw new Error("ASAAS_CUSTOMER_CREATE_FAILED");
  }

  await persistAthleteCpfCnpj(uid, digits);

  await ref.set({
    customerId,
    cpfCnpj: digits,
    email: safeEmail,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return customerId;
}
