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
  const ref = db.doc(`fiscalInvoices/${invoiceId}`);
  await ref.set(
    {status: "requested", errorMessage: null, processedAt: FieldValue.serverTimestamp()},
    {merge: true},
  );
  try {
    await processInvoiceRequest(db, issuer, readToken, invoiceId);
  } catch (e) {
    // Falha transitória (rede/5xx da Focus) — processInvoiceRequest lança de
    // propósito para o `retry: true` do trigger de criação pegar, mas esta
    // chamada é direta, sem trigger nenhum reagindo. Sem isto, a nota fica
    // presa em "requested" para sempre: nem o botão de reemitir nem o de
    // ativação enxergam esse estado. Volta para "rejected" — acionável de
    // novo pela UI — e relança pro chamador saber que esta tentativa falhou.
    //
    // O webhook do emissor pode ter autorizado a nota enquanto a chamada
    // acima ainda estava presa na falha de rede (a Focus pode ter recebido o
    // pedido mesmo com o cliente não tendo visto a resposta). Mesma guarda de
    // `invoice-processor.ts`: nunca sobrescrever um status terminal.
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const currentStatus = current.data()?.status;
      if (currentStatus === "authorized" || currentStatus === "cancelled") return;
      tx.set(
        ref,
        {
          status: "rejected",
          errorMessage: "Falha temporária ao falar com o emissor — tente de novo.",
        },
        {merge: true},
      );
    });
    throw e;
  }
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
