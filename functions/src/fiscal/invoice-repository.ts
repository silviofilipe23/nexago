/**
 * Acesso ao Firestore do módulo fiscal. A idempotência mora no id do
 * documento: duas execuções concorrentes do mesmo webhook não conseguem criar
 * duas notas porque disputam a mesma chave.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import type {
  ArenaFiscalConfig,
  FiscalInvoiceOrigin,
  FiscalTomador,
} from "./types";

const FISCAL_INVOICES = "fiscalInvoices";

export async function readArenaFiscalConfig(
  db: Firestore,
  arenaId: string,
): Promise<ArenaFiscalConfig | null> {
  const snap = await db.doc(`arenas/${arenaId}/fiscal/config`).get();
  if (!snap.exists) return null;
  return snap.data() as ArenaFiscalConfig;
}

export interface CreateInvoiceRequestInput {
  arenaId: string;
  origin: FiscalInvoiceOrigin;
  originId: string | null;
  /** Fatia do split que pagou, quando houver — ver `FiscalInvoice.shareId`. */
  shareId?: string | null;
  idempotencyKey: string;
  serviceId: string;
  codigoMunicipal: string;
  aliquotaIss: number;
  descricao: string;
  tomador: FiscalTomador;
  tomadorUid: string | null;
  valorBrutoReais: number;
  requestedByUid?: string;
  issuedByUid?: string;
}

/** Id determinístico: mesma chave, mesmo documento. */
export function invoiceIdFor(arenaId: string, idempotencyKey: string): string {
  return `${arenaId}__${idempotencyKey}`.replace(/\//g, "_");
}

/**
 * Grava o pedido. Devolve o id criado, ou `null` quando já existia nota para
 * a mesma chave.
 */
export async function createInvoiceRequest(
  db: Firestore,
  input: CreateInvoiceRequestInput,
): Promise<string | null> {
  const id = invoiceIdFor(input.arenaId, input.idempotencyKey);
  const ref = db.collection(FISCAL_INVOICES).doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return null;
    tx.set(ref, {
      ...input,
      status: "requested",
      createdAt: FieldValue.serverTimestamp(),
    });
    return id;
  });
}
