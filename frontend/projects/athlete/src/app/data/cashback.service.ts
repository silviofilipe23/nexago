import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CASHBACK_SOURCE } from './cashback-repository';
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  cashbackEntryVisible,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from './cashback-model';

/** Carteira de cashback do atleta logado — um listener por sessão, compartilhado pela página
 *  `/cashback`, pelo card do painel e pelos três checkouts. Mesmo desenho do
 *  `AthleteGamificationService`: effect no uid → `onSnapshot`, com limpeza na troca de conta. */
@Injectable({ providedIn: 'root' })
export class CashbackService {
  private readonly auth = inject(AuthService);
  private readonly source = inject(CASHBACK_SOURCE);
  /** `computed` para o effect só rodar quando o uid muda de verdade. */
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  private readonly walletState = signal<CashbackWallet>(EMPTY_CASHBACK_WALLET);
  private readonly ledgerState = signal<readonly CashbackLedgerEntry[]>([]);
  private readonly configState = signal<CashbackConfig>(DEFAULT_CASHBACK_CONFIG);
  private readonly walletLoadedState = signal(false);
  private readonly ledgerLoadedState = signal(false);
  private readonly ledgerErrorState = signal(false);

  readonly wallet = this.walletState.asReadonly();
  readonly ledger = this.ledgerState.asReadonly();
  readonly config = this.configState.asReadonly();
  readonly walletLoaded = this.walletLoadedState.asReadonly();
  readonly ledgerLoaded = this.ledgerLoadedState.asReadonly();
  readonly ledgerError = this.ledgerErrorState.asReadonly();
  readonly availableCents = computed(() => this.walletState().availableCents);
  /** Card do painel: recurso ligado e algum saldo. A página `/cashback` NÃO usa isto — ela abre
   *  mesmo com o recurso desligado. */
  readonly visible = computed(() => cashbackEntryVisible(this.configState(), this.walletState()));

  constructor() {
    effect((onCleanup) => {
      const uid = this.uid();
      // Troca de conta no mesmo navegador: nada do atleta anterior sobrevive.
      this.walletState.set(EMPTY_CASHBACK_WALLET);
      this.ledgerState.set([]);
      this.configState.set(DEFAULT_CASHBACK_CONFIG);
      this.ledgerErrorState.set(false);
      const source = this.source;
      if (!uid || !source) {
        this.walletLoadedState.set(true);
        this.ledgerLoadedState.set(true);
        return;
      }
      this.walletLoadedState.set(false);
      this.ledgerLoadedState.set(false);
      let active = true;
      const stopWallet = source.watchWallet(
        uid,
        (wallet) => {
          this.walletState.set(wallet);
          this.walletLoadedState.set(true);
        },
        () => {
          this.walletState.set(EMPTY_CASHBACK_WALLET);
          this.walletLoadedState.set(true);
        },
      );
      const stopLedger = source.watchLedger(
        uid,
        (entries) => {
          this.ledgerState.set(entries);
          this.ledgerErrorState.set(false);
          this.ledgerLoadedState.set(true);
        },
        () => {
          this.ledgerState.set([]);
          this.ledgerErrorState.set(true);
          this.ledgerLoadedState.set(true);
        },
      );
      void source.fetchConfig().then(
        (config) => {
          if (active) this.configState.set(config);
        },
        () => undefined,
      );
      onCleanup(() => {
        active = false;
        stopWallet();
        stopLedger();
      });
    });
  }

  /** Lote de um pagamento (`lots/{asaasPaymentId}`) ao vivo — a nota da tela de sucesso. */
  watchLot(lotId: string, onChange: (lot: CashbackLot | null) => void): () => void {
    const uid = this.uid();
    if (!uid || !this.source || !lotId) {
      onChange(null);
      return () => undefined;
    }
    return this.source.watchLot(uid, lotId, onChange);
  }
}
