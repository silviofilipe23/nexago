import {
  buildFinancialMovements,
  computeFinancialPeriodStats,
  ledgerEntryFromData,
  walletSummaryFromData,
  withdrawalIsFailed,
  withdrawalStatusLabel,
} from './arena-wallet.model';

describe('withdrawalStatusLabel (saque da arena)', () => {
  const item = (status: string, payoutStatus: string | null) => ({ status, payoutStatus });

  it('PIX criado no Asaas é ENVIADO; só a conclusão da transferência é PAGO', () => {
    expect(withdrawalStatusLabel(item('approved', 'sent'))).toBe('ENVIADO');
    expect(withdrawalStatusLabel(item('approved', 'paid'))).toBe('PAGO');
  });

  it('PIX que o banco não concluiu (valor de volta ao caixa) é FALHOU', () => {
    expect(withdrawalStatusLabel(item('rejected', 'failed'))).toBe('FALHOU');
    expect(withdrawalIsFailed(item('rejected', 'failed'))).toBeTrue();
  });

  it('aguardando aprovação é PENDENTE', () => {
    expect(withdrawalStatusLabel(item('pending', null))).toBe('PENDENTE');
  });
});

describe('carteira da arena: a liberar e origem do extrato', () => {
  it('lê o "a liberar" do cartão; doc antigo ou negativo vira zero', () => {
    expect(walletSummaryFromData({ availableReais: 10, pendingReais: 0, awaitingSettlementReais: 6.64 }).awaitingSettlementReais).toBe(6.64);
    expect(walletSummaryFromData({ availableReais: 10 }).awaitingSettlementReais).toBe(0);
    expect(walletSummaryFromData({ awaitingSettlementReais: -1 }).awaitingSettlementReais).toBe(0);
  });

  it('mensalidade de aula e clubinho têm título próprio; reserva segue como antes', () => {
    const at = new Date();
    const ledger = [
      ledgerEntryFromData('a', { type: 'credit', source: 'class', grossReais: 8.89, netReais: 6.64, bookingId: 'g1' }),
      ledgerEntryFromData('b', { type: 'credit', source: 'club', grossReais: 30, netReais: 28.2 }),
      ledgerEntryFromData('c', { type: 'credit', grossReais: 120, netReais: 120, bookingId: 'bk1' }),
    ].map((e) => ({ ...e, createdAt: at }));
    const [a, b, c] = buildFinancialMovements(ledger, [], 'Vegeton');
    expect(a!.title).toBe('Mensalidade de aula');
    expect(a!.amountReais).toBe(6.64);
    expect(a!.note).toBe(`Bruto ${(8.89).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · taxas ${(2.25).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
    expect(b!.title).toBe('Clubinho');
    expect(c!.title).toBe('Reserva · Vegeton');
    expect(c!.note).toBeNull();
  });

  it('estorno do clubinho sai como débito, não como "+R$ -X"', () => {
    const refund = { ...ledgerEntryFromData('r', { type: 'refund', source: 'club', grossReais: -28.2, netReais: -28.2 }), createdAt: new Date() };
    const [m] = buildFinancialMovements([refund], [], 'Arena');
    expect(m!.title).toBe('Estorno · Clubinho');
    expect(m!.isPositive).toBeFalse();
    expect(m!.amountReais).toBe(28.2);
    expect(m!.statusLabel).toBe('ESTORNADO');
    // O "Recebido" do período desconta o estorno.
    const credit = { ...ledgerEntryFromData('c', { type: 'credit', source: 'club', grossReais: 30, netReais: 28.2 }), createdAt: new Date() };
    expect(computeFinancialPeriodStats([credit, refund], [], 30).receivedReais).toBe(0);
  });

  it('repasse de aulas pago pelo nexaGO é saída "Repasse · professor · mês", não estorno', () => {
    const payout = {
      ...ledgerEntryFromData('p', {
        type: 'class_payout', payoutId: 'a_t_2026-09', teacherUserId: 'u1', teacherName: 'Ana Lima', month: '2026-09',
        grossReais: 450, platformFeeReais: 0, netReais: -450,
      }),
      createdAt: new Date(),
    };
    const [m] = buildFinancialMovements([payout], [], 'Arena');
    expect(m!.title).toBe('Repasse · Ana Lima · setembro/2026');
    expect(m!.title).not.toContain('Estorno');
    expect(m!.kind).toBe('withdrawal');
    expect(m!.isPositive).toBeFalse();
    expect(m!.amountReais).toBe(450);
    expect(m!.statusLabel).toBe('PAGO');
    // Conta como saída do período, não desconta o "Recebido".
    const credit = { ...ledgerEntryFromData('c', { type: 'credit', source: 'class', grossReais: 500, netReais: 500 }), createdAt: new Date() };
    const stats = computeFinancialPeriodStats([credit, payout], [], 30);
    expect(stats.receivedReais).toBe(500);
    expect(stats.withdrawnReais).toBe(450);
  });
});
