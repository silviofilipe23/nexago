import { InjectionToken } from '@angular/core';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore';
import {
  DEFAULT_CASHBACK_CONFIG,
  cashbackLedgerEntryFromData,
  cashbackLotFromData,
  cashbackWalletFromData,
  parseCashbackConfig,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from './cashback-model';
import { athleteFirestore } from './firestore';

/** Extrato da página: os últimos 50 lançamentos (`createdAt desc`). */
export const CASHBACK_LEDGER_LIMIT = 50;

/** Leitura do cashback do atleta — tudo só leitura: `athleteWallets` é escrito exclusivamente
 *  pelo servidor (rules: dono lê, ninguém escreve). Interface para o `CashbackService` ser
 *  testado sem Firestore (listener real no Karma trava a suíte). */
export interface CashbackSource {
  watchWallet(uid: string, onChange: (wallet: CashbackWallet) => void, onError: () => void): () => void;
  watchLedger(uid: string, onChange: (entries: CashbackLedgerEntry[]) => void, onError: () => void): () => void;
  fetchConfig(): Promise<CashbackConfig>;
  watchLot(uid: string, lotId: string, onChange: (lot: CashbackLot | null) => void): () => void;
}

export function firestoreCashbackSource(db: Firestore): CashbackSource {
  return {
    watchWallet: (uid, onChange, onError) =>
      onSnapshot(
        doc(db, 'athleteWallets', uid),
        (snap) => onChange(cashbackWalletFromData(snap.data())),
        () => onError(),
      ),
    watchLedger: (uid, onChange, onError) =>
      onSnapshot(
        query(
          collection(db, 'athleteWallets', uid, 'ledger'),
          orderBy('createdAt', 'desc'),
          limit(CASHBACK_LEDGER_LIMIT),
        ),
        (snap) =>
          onChange(
            snap.docs
              .map((d) => cashbackLedgerEntryFromData(d.id, d.data()))
              .filter((e): e is CashbackLedgerEntry => e !== null),
          ),
        () => onError(),
      ),
    // Uma leitura por sessão (mesmo padrão de `fetchFriendlyMatchEnabled`): falha = padrão desligado.
    fetchConfig: async () => {
      try {
        const snap = await getDoc(doc(db, 'appConfig', 'cashback'));
        return parseCashbackConfig(snap.exists() ? snap.data() : undefined);
      } catch {
        return { ...DEFAULT_CASHBACK_CONFIG };
      }
    },
    watchLot: (uid, lotId, onChange) =>
      onSnapshot(
        doc(db, 'athleteWallets', uid, 'lots', lotId),
        (snap) => onChange(cashbackLotFromData(snap.id, snap.data())),
        () => onChange(null),
      ),
  };
}

/** `null` sem chave de Firebase (specs com `apiKey` em branco, ambiente sem config): o serviço
 *  fica na carteira zerada em vez de abrir conexão. */
export const CASHBACK_SOURCE = new InjectionToken<CashbackSource | null>('CASHBACK_SOURCE', {
  providedIn: 'root',
  factory: () => {
    const db = athleteFirestore();
    return db ? firestoreCashbackSource(db) : null;
  },
});
