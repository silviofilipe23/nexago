import { computed, signal, type WritableSignal } from '@angular/core';
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  cashbackEntryVisible,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from '../app/data/cashback-model';
import type { CashbackService } from '../app/data/cashback.service';

/** Dublê do `CashbackService` para specs de tela — sem Firestore (listener real trava o Karma).
 *  Padrão: recurso LIGADO e carteira zerada; cada spec ajusta pelos signals. */
export interface FakeCashbackService {
  readonly wallet: WritableSignal<CashbackWallet>;
  readonly ledger: WritableSignal<readonly CashbackLedgerEntry[]>;
  readonly config: WritableSignal<CashbackConfig>;
  readonly walletLoaded: WritableSignal<boolean>;
  readonly ledgerLoaded: WritableSignal<boolean>;
  readonly ledgerError: WritableSignal<boolean>;
  /** Ids pedidos a `watchLot`, o último callback recebido e quantos listeners foram parados. */
  readonly lotIds: string[];
  lotListener: ((lot: CashbackLot | null) => void) | null;
  lotStops: number;
  asService(): CashbackService;
}

export function fakeCashbackService(
  init: { wallet?: Partial<CashbackWallet>; config?: Partial<CashbackConfig>; ledger?: CashbackLedgerEntry[] } = {},
): FakeCashbackService {
  const wallet = signal<CashbackWallet>({ ...EMPTY_CASHBACK_WALLET, ...init.wallet });
  const config = signal<CashbackConfig>({ ...DEFAULT_CASHBACK_CONFIG, enabled: true, ...init.config });
  const ledger = signal<readonly CashbackLedgerEntry[]>(init.ledger ?? []);
  const walletLoaded = signal(true);
  const ledgerLoaded = signal(true);
  const ledgerError = signal(false);

  const fake: FakeCashbackService = {
    wallet,
    ledger,
    config,
    walletLoaded,
    ledgerLoaded,
    ledgerError,
    lotIds: [],
    lotListener: null,
    lotStops: 0,
    asService: () => service,
  };

  const service = {
    wallet: wallet.asReadonly(),
    ledger: ledger.asReadonly(),
    config: config.asReadonly(),
    walletLoaded: walletLoaded.asReadonly(),
    ledgerLoaded: ledgerLoaded.asReadonly(),
    ledgerError: ledgerError.asReadonly(),
    availableCents: computed(() => wallet().availableCents),
    visible: computed(() => cashbackEntryVisible(config(), wallet())),
    watchLot: (lotId: string, onChange: (lot: CashbackLot | null) => void): (() => void) => {
      fake.lotIds.push(lotId);
      fake.lotListener = onChange;
      return () => {
        fake.lotStops += 1;
      };
    },
  } as unknown as CashbackService;

  return fake;
}
