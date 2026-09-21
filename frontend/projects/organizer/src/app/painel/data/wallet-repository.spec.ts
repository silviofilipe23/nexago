import { parseSavedPayout, parseWalletView, walletBalanceFromDoc } from './wallet-repository';

describe('parseWalletView', () => {
  it('lê o formato novo por torneio', () => {
    const view = parseWalletView({
      tournaments: [{ tournamentId: 't2', tournamentName: 'Copa B', availableReais: 90, pendingReais: 5 }],
      selected: { tournamentId: 't2', tournamentName: 'Copa B', availableReais: 90, pendingReais: 5 },
      payout: { pixKey: 'a@b.com', pixKeyType: 'EMAIL', hasPixKey: true },
      ledger: [{ id: 'l1', netReais: 92, grossReais: 100, platformFeeReais: 8, createdAt: '2026-09-16T12:00:00.000Z', athleteLabel: 'Ana Paula' }],
      withdrawals: [{ id: 'w1', amountReais: 40, status: 'pending', pixKey: '123••••••01', requestedBy: 'outro', requestedByStaff: true, payoutStatus: null, createdAt: '2026-09-16T13:00:00.000Z' }],
    });

    expect(view.tournaments.length).toBe(1);
    expect(view.selected?.tournamentId).toBe('t2');
    expect(view.payout.hasPixKey).toBeTrue();
    expect(view.ledger[0].createdAt instanceof Date).toBeTrue();
    expect(view.withdrawals[0].requestedByStaff).toBeTrue();
    expect(view.withdrawals[0].pixKey).toBe('123••••••01');
  });

  it('sem caixa acessível devolve lista vazia e selected nulo', () => {
    const view = parseWalletView({
      tournaments: [], selected: null,
      payout: { pixKey: '', pixKeyType: '', hasPixKey: false },
      ledger: [], withdrawals: [],
    });

    expect(view.tournaments).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.payout.hasPixKey).toBeFalse();
  });

  it('campo ausente não estoura', () => {
    const view = parseWalletView({});
    expect(view.tournaments).toEqual([]);
    expect(view.selected).toBeNull();
    expect(view.ledger).toEqual([]);
    expect(view.withdrawals).toEqual([]);
    expect(view.payout).toEqual({ pixKey: '', pixKeyType: '', hasPixKey: false });
  });

  it('data inválida vira null em vez de Date inválida', () => {
    const view = parseWalletView({ ledger: [{ id: 'l1', createdAt: 'não é data' }] });
    expect(view.ledger[0].createdAt).toBeNull();
  });
});

describe('walletBalanceFromDoc', () => {
  it('lê o saldo do doc do caixa', () => {
    expect(walletBalanceFromDoc({ availableReais: 90.5, pendingReais: 40 })).toEqual({
      availableReais: 90.5,
      pendingReais: 40,
    });
  });

  it('doc ausente é zero de verdade — caixa que nunca creditou', () => {
    expect(walletBalanceFromDoc(undefined)).toEqual({ availableReais: 0, pendingReais: 0 });
  });

  it('campo estranho não vira NaN', () => {
    expect(walletBalanceFromDoc({ availableReais: 'muito' })).toEqual({ availableReais: 0, pendingReais: 0 });
  });
});

describe('parseSavedPayout', () => {
  it('fica com o eco do servidor, não com o que foi digitado', () => {
    expect(parseSavedPayout(
      { success: true, pixKey: '+5562999853983', pixKeyType: 'PHONE' },
      { pixKey: '62999853983', pixKeyType: 'phone' },
    )).toEqual({ pixKey: '+5562999853983', pixKeyType: 'PHONE', hasPixKey: true });
  });

  it('sem eco cai no que foi enviado, normalizando o tipo', () => {
    expect(parseSavedPayout({ success: true }, { pixKey: ' a@b.com ', pixKeyType: 'email' })).toEqual({
      pixKey: 'a@b.com',
      pixKeyType: 'EMAIL',
      hasPixKey: true,
    });
  });

  it('chave curta não conta como cadastrada — mesmo piso do servidor', () => {
    expect(parseSavedPayout({}, { pixKey: 'a@b', pixKeyType: 'EMAIL' }).hasPixKey).toBeFalse();
  });
});
