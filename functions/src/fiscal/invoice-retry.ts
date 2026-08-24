/**
 * O primitivo de "resetar e reprocessar direto" — usado tanto pelo reemitir
 * de uma nota real quanto pelo callable de ativação (Task 4). É direto porque
 * `onFiscalInvoiceRequested` só dispara na CRIAÇÃO do documento; resetar o
 * status e esperar o trigger não funcionaria numa atualização.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {processInvoiceRequest, readIssuerTokenFromSecretManager, type ReadIssuerToken} from "./invoice-processor";
import {buildDefaultIssuer} from "./focus-nfe-client";
import {assertManagesArena} from "./arena-fiscal-config";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice} from "./types";

export async function reprocessFiscalInvoice(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  invoiceId: string,
): Promise<void> {
  await db.doc(`fiscalInvoices/${invoiceId}`).set(
    {status: "requested", errorMessage: null, processedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  await processInvoiceRequest(db, issuer, readToken, invoiceId);
}

export interface RetryFiscalInvoiceInput {
  arenaId: string;
  invoiceId: string;
  callerUid: string;
}

export async function retryFiscalInvoiceCore(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  input: RetryFiscalInvoiceInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);

  const ref = db.doc(`fiscalInvoices/${input.invoiceId}`);
  const snap = await ref.get();
  const invoice = snap.data() as FiscalInvoice | undefined;
  if (!snap.exists || invoice?.arenaId !== input.arenaId) {
    throw new HttpsError("not-found", "NOT_FOUND: nota fiscal não encontrada para esta arena.");
  }
  if (invoice.status !== "rejected") {
    throw new HttpsError(
      "failed-precondition",
      "NOT_REJECTED: só é possível reemitir uma nota rejeitada.",
    );
  }

  await reprocessFiscalInvoice(db, issuer, readToken, input.invoiceId);
}

export const retryFiscalInvoice = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const data = (request.data ?? {}) as {arenaId?: string; invoiceId?: string};
  const arenaId = String(data.arenaId ?? "");
  const invoiceId = String(data.invoiceId ?? "");
  if (!arenaId || !invoiceId) {
    throw new HttpsError("invalid-argument", "arenaId e invoiceId são obrigatórios.");
  }
  await retryFiscalInvoiceCore(getFirestore(), buildDefaultIssuer(), readIssuerTokenFromSecretManager, {
    arenaId,
    invoiceId,
    callerUid,
  });
  return {ok: true};
});
