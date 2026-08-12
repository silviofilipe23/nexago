import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  inferPixKeyType,
  ledgerEntryFromDoc,
  walletSummaryFromData,
  withdrawalFromDoc,
  type ArenaLedgerEntry,
  type ArenaWalletSummary,
  type ArenaWithdrawalItem,
  type ArenaWithdrawalRequestResult,
  type PixKeyType,
} from './arena-wallet.model';

/** Espelha `ArenaWalletRepository` (Flutter): saldo/ledger/saques são leitura direta
 *  (`arenaWallets`/`arenaWithdrawals`, rules restringem ao gestor da arena), mas TODA escrita —
 *  inclusive abrir um saque — passa pela Cloud Function `requestArenaWithdrawal` (as rules
 *  bloqueiam `create` direto em `arenaWithdrawals`; só o Admin SDK grava saldo/ledger). */

export class ArenaWalletError extends Error {}

export function watchArenaWallet(db: Firestore, arenaId: string, onChange: (wallet: ArenaWalletSummary) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'arenaWallets', arenaId),
    (snap) => onChange(walletSummaryFromData(snap.data() as Record<string, unknown> | undefined)),
    () => onChange({ availableReais: 0, pendingReais: 0 }),
  );
}

export function watchArenaLedger(db: Firestore, arenaId: string, onChange: (ledger: ArenaLedgerEntry[]) => void, limitCount = 20): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaWallets', arenaId, 'ledger'), orderBy('createdAt', 'desc'), limit(limitCount)),
    (snap) => onChange(snap.docs.map(ledgerEntryFromDoc)),
    () => onChange([]),
  );
}

export function watchArenaWithdrawals(db: Firestore, arenaId: string, onChange: (withdrawals: ArenaWithdrawalItem[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaWithdrawals'), where('arenaId', '==', arenaId), orderBy('createdAt', 'desc'), limit(20)),
    (snap) => onChange(snap.docs.map(withdrawalFromDoc)),
    () => onChange([]),
  );
}

export interface RequestArenaWithdrawalInput {
  arenaId: string;
  amountReais: number;
  pixKey: string;
  pixKeyType: string;
}

function mapFunctionsError(err: unknown): ArenaWalletError {
  const message = err instanceof Error && err.message ? err.message : 'Não foi possível concluir a operação. Tente novamente.';
  return new ArenaWalletError(message);
}

export async function requestArenaWithdrawal(functions: Functions, input: RequestArenaWithdrawalInput): Promise<ArenaWithdrawalRequestResult> {
  const call = httpsCallable<RequestArenaWithdrawalInput, ArenaWithdrawalRequestResult>(functions, 'requestArenaWithdrawal');
  try {
    const result = await call(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export interface ArenaPayoutPix {
  pixKey: string;
  pixKeyType: PixKeyType;
}

/** `arenas/{arenaId}.payoutPixKey`/`payoutPixKeyType` — mesmo doc do Perfil, campo livre pro
 *  gestor escrever direto (rules só congelam campos de plano). Lê do doc que o
 *  `ArenaContextService` já mantém ao vivo, sem refazer a leitura só pra abrir a tela. */
export function arenaPayoutPixFromDoc(data: Record<string, unknown>): ArenaPayoutPix {
  const pixKey = typeof data['payoutPixKey'] === 'string' ? data['payoutPixKey'] : '';
  const storedType = typeof data['payoutPixKeyType'] === 'string' ? (data['payoutPixKeyType'].toUpperCase() as PixKeyType) : null;
  const pixKeyType: PixKeyType = storedType && ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'].includes(storedType) ? storedType : inferPixKeyType(pixKey);
  return { pixKey, pixKeyType };
}

export async function saveArenaPayoutPix(db: Firestore, arenaId: string, pixKey: string, pixKeyType: PixKeyType): Promise<void> {
  await setDoc(doc(db, 'arenas', arenaId), { payoutPixKey: pixKey.trim(), payoutPixKeyType: pixKeyType }, { merge: true });
}
