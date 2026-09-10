import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { organizerFirestore } from './firestore';
import { organizerFunctions } from './functions';

/** Espelho 1:1 de `organizer_wallet_repository.dart`: `organizerWallets/{uid}` (+ subcoleção
 *  `ledger` e `organizerWithdrawals` vêm pela callable). Toda escrita passa por Cloud
 *  Function (`setOrganizerPayoutPixKey`/`requestOrganizerWithdrawal`); do Firestore o
 *  client só lê o doc da carteira dele, para o saldo ao vivo de Início e Config.
 *
 *  Carteira de OUTRO organizador (gestor de equipe) não passa por aqui: as
 *  rules de `organizerWallets` só liberam leitura para o próprio dono, e a
 *  relação gestor → dono não cabe nelas. Esse caminho usa a callable
 *  `loadOrganizerWalletView`, que recalcula a permissão a cada chamada. */

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

/** `organizerId` só quando o saque é de uma carteira que não é a sua (gestor
 *  da equipe). Nesse caso o backend ignora `pixKey`/`pixKeyType` e usa a chave
 *  cadastrada pelo dono — mandar os dois aqui não muda o destino do dinheiro. */
export async function requestWithdrawal(
  amountReais: number,
  pixKey: string,
  pixKeyType: string,
  organizerId?: string,
): Promise<WithdrawalRequestResult> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions, 'requestOrganizerWithdrawal')({
      amountReais,
      pixKey,
      pixKeyType,
      ...(organizerId ? { organizerId } : {}),
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

/** Uma carteira que o usuário alcança: a própria e a dos donos dos torneios em
 *  que ele é gestor de equipe. */
export interface OrganizerWalletRef {
  organizerId: string;
  organizerName: string;
  isOwn: boolean;
}

export interface OrganizerWalletSelection extends OrganizerWalletRef {
  availableReais: number;
  pendingReais: number;
  /** Na carteira de outro dono vem mascarada — o gestor confere o destino sem
   *  levar o CPF/telefone dele embora. */
  payoutPixKey: string;
  payoutPixKeyType: string;
  hasPayoutPixKey: boolean;
  canEditPixKey: boolean;
}

export interface OrganizerWalletView {
  wallets: OrganizerWalletRef[];
  selected: OrganizerWalletSelection;
  ledger: OrganizerLedgerEntry[];
  withdrawals: OrganizerWithdrawal[];
}

function isoToDate(v: unknown): Date | null {
  const d = typeof v === 'string' ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

function boolOf(v: unknown): boolean {
  return v === true;
}

/** Uma chamada para o seletor de carteiras + extrato/saques da escolhida.
 *  `organizerId` ausente (ou fora do alcance) devolve a carteira do próprio. */
export async function loadWalletView(organizerId?: string, ledgerLimit?: number): Promise<OrganizerWalletView> {
  const functions = organizerFunctions();
  try {
    const result = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(
      functions,
      'loadOrganizerWalletView',
    )({ ...(organizerId ? { organizerId } : {}), ...(ledgerLimit ? { ledgerLimit } : {}) });
    const data = result.data;
    const rawSelected = (data['selected'] ?? {}) as Record<string, unknown>;
    const wallets = (Array.isArray(data['wallets']) ? data['wallets'] : []).map((w) => {
      const row = w as Record<string, unknown>;
      return {
        organizerId: optionalStr(row['organizerId']) ?? '',
        organizerName: optionalStr(row['organizerName']) ?? 'Organizador',
        isOwn: boolOf(row['isOwn']),
      };
    });
    return {
      wallets,
      selected: {
        organizerId: optionalStr(rawSelected['organizerId']) ?? '',
        organizerName: optionalStr(rawSelected['organizerName']) ?? '',
        isOwn: boolOf(rawSelected['isOwn']),
        availableReais: numberOf(rawSelected['availableReais']),
        pendingReais: numberOf(rawSelected['pendingReais']),
        payoutPixKey: optionalStr(rawSelected['payoutPixKey']) ?? '',
        payoutPixKeyType: optionalStr(rawSelected['payoutPixKeyType']) ?? '',
        hasPayoutPixKey: boolOf(rawSelected['hasPayoutPixKey']),
        canEditPixKey: boolOf(rawSelected['canEditPixKey']),
      },
      ledger: (Array.isArray(data['ledger']) ? data['ledger'] : []).map((e) => {
        const row = e as Record<string, unknown>;
        return {
          id: optionalStr(row['id']) ?? '',
          netReais: numberOf(row['netReais']),
          grossReais: numberOf(row['grossReais']),
          platformFeeReais: numberOf(row['platformFeeReais']),
          createdAt: isoToDate(row['createdAt']),
        };
      }),
      withdrawals: (Array.isArray(data['withdrawals']) ? data['withdrawals'] : []).map((x) => {
        const row = x as Record<string, unknown>;
        return {
          id: optionalStr(row['id']) ?? '',
          amountReais: numberOf(row['amountReais']),
          status: optionalStr(row['status']) ?? 'pending',
          pixKey: optionalStr(row['pixKey']) ?? '',
          createdAt: isoToDate(row['createdAt']),
          payoutStatus: optionalStr(row['payoutStatus']),
        };
      }),
    };
  } catch (err) {
    throw mapCallableError(err);
  }
}
