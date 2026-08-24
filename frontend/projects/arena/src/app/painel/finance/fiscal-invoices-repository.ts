import { collection, getDocs, limit, orderBy, query, where, type Firestore } from 'firebase/firestore';
import { mapFiscalInvoice, type FiscalInvoiceItem } from './fiscal-invoice.model';

/** Espelha `functions/src/fiscal/types.ts` (Task 8) — `fiscalInvoices` é coleção top-level, uma
 *  nota por documento, com índice composto `(arenaId ASC, createdAt DESC)` sustentando esta
 *  consulta. Escrita é exclusiva das Cloud Functions; este portal só lê. */

const INVOICES_LIMIT = 200;

function invoicesCol(db: Firestore) {
  return collection(db, 'fiscalInvoices');
}

export async function fetchFiscalInvoices(db: Firestore, arenaId: string): Promise<FiscalInvoiceItem[]> {
  const snap = await getDocs(
    query(invoicesCol(db), where('arenaId', '==', arenaId), orderBy('createdAt', 'desc'), limit(INVOICES_LIMIT)),
  );
  return snap.docs.map((d) => mapFiscalInvoice(d.id, d.data()));
}
