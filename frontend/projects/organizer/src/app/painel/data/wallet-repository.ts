import { collection, doc, limit as fsLimit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { organizerFirestore } from './firestore';
import { organizerFunctions } from './functions';

/** Espelho 1:1 de `organizer_wallet_repository.dart`: `organizerWallets/{uid}` (+ subcoleção
 *  `ledger`, ordenada `createdAt desc`) e `organizerWithdrawals` (`where organizerId == uid`,
 *  `orderBy createdAt desc`, `limit 20` — mesmo índice composto que o Flutter já usa, não criar
 *  um novo). Toda escrita passa por Cloud Function (`setOrganizerPayoutPixKey`/
 *  `requestOrganizerWithdrawal`); o client só lê Firestore diretamente. */

export interface OrganizerWalletSummary {
  availableReais: number;
  pendingReais: number;
  payoutPixKey: string;
  payoutPixKeyType: string;
}

export interface OrganizerLedgerEntry {
  id: string;
  netReais: number;
  grossReais: number;
  platformFeeReais: number;
  createdAt: Date | null;
}

export interface OrganizerWithdrawal {
  id: string;
  amountReais: number;
  status: string;
  pixKey: string;
  createdAt: Date | null;
  payoutStatus: string | null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

function numberOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const EMPTY_WALLET: OrganizerWalletSummary = { availableReais: 0, pendingReais: 0, payoutPixKey: '', payoutPixKeyType: '' };

export function watchWallet(uid: string, cb: (w: OrganizerWalletSummary) => void): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    doc(db, 'organizerWallets', uid),
    (snap) => {
      const d = snap.data() as Record<string, unknown> | undefined;
      cb({
        availableReais: numberOf(d?.['availableReais']),
        pendingReais: numberOf(d?.['pendingReais']),
        payoutPixKey: optionalStr(d?.['payoutPixKey']) ?? '',
        payoutPixKeyType: optionalStr(d?.['payoutPixKeyType']) ?? '',
      });
    },
    () => cb(EMPTY_WALLET),
  );
}

function ledgerEntryFromDoc(id: string, data: Record<string, unknown>): OrganizerLedgerEntry {
  return {
    id,
    netReais: numberOf(data['netReais']),
    grossReais: numberOf(data['grossReais']),
    platformFeeReais: numberOf(data['platformFeeReais']),
    createdAt: toDate(data['createdAt']),
  };
}

export function watchLedger(uid: string, cb: (l: OrganizerLedgerEntry[]) => void, limit = 30): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    query(collection(db, 'organizerWallets', uid, 'ledger'), orderBy('createdAt', 'desc'), fsLimit(limit)),
    (snap) => cb(snap.docs.map((d) => ledgerEntryFromDoc(d.id, d.data() as Record<string, unknown>))),
    () => cb([]),
  );
}

function withdrawalFromDoc(id: string, data: Record<string, unknown>): OrganizerWithdrawal {
  return {
    id,
    amountReais: numberOf(data['amountReais']),
    status: optionalStr(data['status']) ?? 'pending',
    pixKey: optionalStr(data['pixKey']) ?? '',
    createdAt: toDate(data['createdAt']),
    payoutStatus: optionalStr(data['payoutStatus']),
  };
}

export function watchWithdrawals(uid: string, cb: (w: OrganizerWithdrawal[]) => void): () => void {
  const db = organizerFirestore();
  return onSnapshot(
    query(collection(db, 'organizerWithdrawals'), where('organizerId', '==', uid), orderBy('createdAt', 'desc'), fsLimit(20)),
    (snap) => cb(snap.docs.map((d) => withdrawalFromDoc(d.id, d.data() as Record<string, unknown>))),
    () => cb([]),
  );
}

export class OrganizerWalletError extends Error {}

function mapCallableError(err: unknown): OrganizerWalletError {
  const message = err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new OrganizerWalletError(message);
}

export async function setPayoutPixKey(pixKey: string, pixKeyType: string): Promise<void> {
  const functions = organizerFunctions();
  try {
    await httpsCallable(functions, 'setOrganizerPayoutPixKey')({ pixKey, pixKeyType });
  } catch (err) {
    throw mapCallableError(err);
  }
}

export interface WithdrawalRequestResult {
  withdrawalId: string;
  status: string;
  payoutStatus: string | null;
  autoProcessed: boolean;
  message: string | null;
}

export async function requestWithdrawal(amountReais: number, pixKey: string, pixKeyType: string): Promise<WithdrawalRequestResult> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, 'requestOrganizerWithdrawal')({
      amountReais,
      pixKey,
      pixKeyType,
    });
    const data = result.data;
    return {
      withdrawalId: optionalStr(data['withdrawalId']) ?? '',
      status: optionalStr(data['status']) ?? 'pending',
      payoutStatus: optionalStr(data['payoutStatus']),
      autoProcessed: data['autoProcessed'] === true,
      message: optionalStr(data['message']),
    };
  } catch (err) {
    throw mapCallableError(err);
  }
}
