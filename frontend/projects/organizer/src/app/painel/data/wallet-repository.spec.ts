import { parseWalletView } from './wallet-repository';

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
