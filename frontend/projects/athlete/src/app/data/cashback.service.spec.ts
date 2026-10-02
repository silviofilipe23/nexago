import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { CASHBACK_SOURCE, type CashbackSource } from './cashback-repository';
import {
  DEFAULT_CASHBACK_CONFIG,
  EMPTY_CASHBACK_WALLET,
  type CashbackConfig,
  type CashbackLedgerEntry,
  type CashbackLot,
  type CashbackWallet,
} from './cashback-model';
import { CashbackService } from './cashback.service';

type FakeUser = { uid: string } | null;

/** Fonte em memória: guarda os callbacks por uid para o teste empurrar snapshots. Nada de
 *  Firestore — listener real trava o Karma. */
class FakeSource implements CashbackSource {
  readonly walletListeners = new Map<string, (wallet: CashbackWallet) => void>();
  readonly ledgerListeners = new Map<
    string,
    { onChange: (entries: CashbackLedgerEntry[]) => void; onError: () => void }
  >();
  readonly stopped: string[] = [];
  readonly lotCalls: Array<{ uid: string; lotId: string }> = [];
  configResult: 'on' | 'off' | 'fail' = 'on';

  watchWallet(uid: string, onChange: (wallet: CashbackWallet) => void): () => void {
    this.walletListeners.set(uid, onChange);
    return () => this.stopped.push(`wallet:${uid}`);
  }

  watchLedger(uid: string, onChange: (entries: CashbackLedgerEntry[]) => void, onError: () => void): () => void {
    this.ledgerListeners.set(uid, { onChange, onError });
    return () => this.stopped.push(`ledger:${uid}`);
  }

  fetchConfig(): Promise<CashbackConfig> {
    if (this.configResult === 'fail') return Promise.reject(new Error('offline'));
    return Promise.resolve({ ...DEFAULT_CASHBACK_CONFIG, enabled: this.configResult === 'on' });
  }

  watchLot(uid: string, lotId: string, onChange: (lot: CashbackLot | null) => void): () => void {
    this.lotCalls.push({ uid, lotId });
    onChange({ id: lotId, status: 'pending', earnedCents: 240, remainingCents: 240, label: 'Reserva' });
    return () => this.stopped.push(`lot:${lotId}`);
  }
}

const WALLET: CashbackWallet = { ...EMPTY_CASHBACK_WALLET, availableCents: 1240, pendingCents: 240 };

/** Deixa a promise da config resolver. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

function setup(
  source: CashbackSource | null,
  user: FakeUser = { uid: 'ana' },
): { service: CashbackService; userSignal: WritableSignal<FakeUser> } {
  const userSignal = signal<FakeUser>(user);
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { user: userSignal } },
      { provide: CASHBACK_SOURCE, useValue: source },
    ],
  });
  const service = TestBed.inject(CashbackService);
  TestBed.tick();
  return { service, userSignal };
}

describe('CashbackService', () => {
  it('sem Firebase fica na carteira zerada, carregada, sem abrir nada', () => {
    const { service } = setup(null);
    expect(service.wallet()).toEqual(EMPTY_CASHBACK_WALLET);
    expect(service.walletLoaded()).toBeTrue();
    expect(service.ledgerLoaded()).toBeTrue();
    expect(service.visible()).toBeFalse();
  });

  it('carteira e extrato chegam pelos listeners do uid logado', () => {
    const source = new FakeSource();
    const { service } = setup(source);
    expect(service.walletLoaded()).toBeFalse();
    expect(service.ledgerLoaded()).toBeFalse();

    source.walletListeners.get('ana')!(WALLET);
    source.ledgerListeners.get('ana')!.onChange([
      { id: 'l1', type: 'earn', amountCents: 240, label: 'Reserva', createdAt: new Date(2026, 9, 12) },
    ]);

    expect(service.availableCents()).toBe(1240);
    expect(service.ledger().length).toBe(1);
    expect(service.walletLoaded()).toBeTrue();
    expect(service.ledgerLoaded()).toBeTrue();
  });

  it('visible só com o recurso ligado e saldo', async () => {
    const source = new FakeSource();
    const { service } = setup(source);
    await flush();
    expect(service.config().enabled).toBeTrue();
    expect(service.visible()).toBeFalse();

    source.walletListeners.get('ana')!(WALLET);
    expect(service.visible()).toBeTrue();
  });

  it('recurso desligado esconde a entrada mesmo com saldo — o saldo segue legível', async () => {
    const source = new FakeSource();
    source.configResult = 'off';
    const { service } = setup(source);
    await flush();
    source.walletListeners.get('ana')!(WALLET);
    expect(service.visible()).toBeFalse();
    expect(service.availableCents()).toBe(1240);
  });

  it('config que falha cai no padrão desligado', async () => {
    const source = new FakeSource();
    source.configResult = 'fail';
    const { service } = setup(source);
    await flush();
    expect(service.config()).toEqual(DEFAULT_CASHBACK_CONFIG);
  });

  it('troca de conta: para os listeners antigos e zera antes de ouvir o novo uid', () => {
    const source = new FakeSource();
    const { service, userSignal } = setup(source);
    source.walletListeners.get('ana')!(WALLET);
    expect(service.availableCents()).toBe(1240);

    userSignal.set({ uid: 'bia' });
    TestBed.tick();

    expect(source.stopped).toEqual(['wallet:ana', 'ledger:ana']);
    expect(service.availableCents()).toBe(0);
    expect(service.walletLoaded()).toBeFalse();
    expect(source.walletListeners.has('bia')).toBeTrue();
  });

  it('logout: para os listeners e zera a carteira', () => {
    const source = new FakeSource();
    const { service, userSignal } = setup(source);
    source.walletListeners.get('ana')!(WALLET);

    userSignal.set(null);
    TestBed.tick();

    expect(source.stopped).toEqual(['wallet:ana', 'ledger:ana']);
    expect(service.wallet()).toEqual(EMPTY_CASHBACK_WALLET);
  });

  it('erro no extrato marca o erro em vez de fingir extrato vazio', () => {
    const source = new FakeSource();
    const { service } = setup(source);
    source.ledgerListeners.get('ana')!.onError();
    expect(service.ledgerError()).toBeTrue();
    expect(service.ledgerLoaded()).toBeTrue();
  });

  it('watchLot ouve o lote do atleta logado; sem login devolve null sem abrir nada', () => {
    const source = new FakeSource();
    const { service, userSignal } = setup(source);
    const seen: Array<CashbackLot | null> = [];

    const stop = service.watchLot('pay_1', (lot) => seen.push(lot));
    expect(source.lotCalls).toEqual([{ uid: 'ana', lotId: 'pay_1' }]);
    expect(seen[0]?.earnedCents).toBe(240);
    stop();
    expect(source.stopped).toContain('lot:pay_1');

    userSignal.set(null);
    TestBed.tick();
    service.watchLot('pay_2', (lot) => seen.push(lot));
    expect(seen[1]).toBeNull();
    expect(source.lotCalls.length).toBe(1);
  });
});
